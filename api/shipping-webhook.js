const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });
const axios = require('axios');

// Initialize Firebase Admin (Singleton)
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (error) {
        console.error('Firebase Admin Init Error:', error);
    }
}
const db = admin.firestore();

// --- HELPER FUNCTIONS ---

const statusTemplateMap = {
    'In-Transit': 'alert_shipping_transit',
    'OFD': 'alert_shipping_ofd',
    'NDR': 'alert_shipping_ndr'
};

const getTemplateComponents = (type, order, payload, awb) => {
    const firstItem = order.items?.[0]?.name || order.productName || 'your order';
    const productDisplay = order.items?.length > 1 ? `${firstItem} & more` : firstItem;
    const courier = payload.courier_name || order.carrier || 'our courier partner';
    const customer = order.customerName || 'Customer';
    const orderId = order.orderNumber.toString();

    // Default Body Params (Name, Order#, Product)
    let bodyParams = [
        { type: 'text', text: customer },
        { type: 'text', text: orderId },
        { type: 'text', text: productDisplay }
    ];

    // Position {{4}} varies by template
    if (type === 'In-Transit') {
        bodyParams.push({ type: 'text', text: courier }); // {{4}} = Courier Name
    } else if (type === 'OFD') {
        bodyParams.push({ type: 'text', text: awb || order.awb || 'available soon' }); // {{4}} = AWB
    } else if (type === 'NDR') {
        // NDR only has 3 variables (Name, Order#, Reason)
        bodyParams = [
            { type: 'text', text: customer },
            { type: 'text', text: orderId },
            { type: 'text', text: payload.ndr_reason || 'Address issue or customer not available' }
        ];
    }

    const components = [
        {
            type: 'body',
            parameters: bodyParams
        }
    ];

    // Only In-Transit has the tracking button variable
    if (type === 'In-Transit') {
        components.push({
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: awb || order.awb || '' }]
        });
    }

    return components;
};

const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

// --- MAIN HANDLER ---

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = req.body;
        
        // --- MULTI-CARRIER ADAPTER ---
        const isShiprocket = !!payload.awb_code;
        const source = isShiprocket ? 'shiprocket' : 'nimbuspost';
        
        const awb = (isShiprocket ? payload.awb_code : payload.awb_number || payload.awb || '').toString().trim();
        const rawStatus = (isShiprocket ? payload.current_status : payload.status || '').toString().toLowerCase();
        const orderNum = (isShiprocket ? payload.order_id : payload.order_number || payload.order_id || '').toString().trim();

        // Log raw payload
        const logRef = await db.collection('webhook_logs').add({
            source: source,
            payload: payload,
            timestamp: admin.firestore.Timestamp.now(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
            status: rawStatus,
            awb: awb,
            automationStatus: 'PENDING'
        });
        payload.log_id = logRef.id;

        if (!awb && !orderNum) {
            return res.status(400).json({ error: 'Missing AWB or Order Number' });
        }

        // Determine Trigger
        let automationType = null;
        if (rawStatus.includes('ndr') || rawStatus.includes('undelivered') || rawStatus.includes('failed attempt') || rawStatus.includes('exception')) {
            automationType = 'NDR';
        } else if (rawStatus.includes('out for delivery') || rawStatus.includes('ofd')) {
            automationType = 'OFD';
        } else if (rawStatus.includes('in transit') || rawStatus.includes('shipped') || rawStatus.includes('dispatched')) {
            automationType = 'In-Transit';
        }

        if (!automationType) {
            await db.collection('webhook_logs').doc(payload.log_id).update({ automationStatus: 'IGNORED' });
            return res.status(200).json({ message: 'Status ignored' });
        }

        const templateName = statusTemplateMap[automationType];

        // Find Order
        let orderDoc = null;
        if (awb) {
            const q = await db.collection('orders').where('awb', '==', awb).limit(1).get();
            if (!q.empty) orderDoc = q.docs[0];
        }
        
        if (!orderDoc && orderNum) {
            const cleanNum = orderNum.replace('#', '').trim();
            const searchArray = [orderNum, cleanNum];
            if (!isNaN(cleanNum)) searchArray.push(Number(cleanNum));
            const q = await db.collection('orders').where('orderNumber', 'in', [...new Set(searchArray)]).limit(1).get();
            if (!q.empty) orderDoc = q.docs[0];
        }

        if (!orderDoc) {
            await db.collection('webhook_logs').doc(payload.log_id).update({ 
                automationStatus: 'FAILED: ORDER_NOT_FOUND',
                debugInfo: `Searched for ${orderNum}`
            });
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderDoc.data();

        // 4. Update Order with latest Tracking Info (Persistence)
        await orderDoc.ref.update({
            awb: awb,
            carrier: payload.courier_name || order.carrier || 'Delhivery',
            lastStatus: rawStatus,
            updatedAt: admin.firestore.Timestamp.now()
        });

        // 5. Phone Normalization
        let phone = order.phoneNormalized || order.phone || '';
        phone = phone.toString().replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        if (phone.length === 12 && phone.startsWith('0')) phone = '91' + phone.substring(1);

        if (!phone || phone.length < 10) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }

        // 5. Duplicate Check (Skip if is_test or force is true)
        const isTest = payload.is_test || payload.force || false;
        
        if (!isTest) {
            // In-Transit is 'one-time only' per order. NDR/OFD have a 24h cooldown.
            const timeLimit = automationType === 'In-Transit' ? null : new Date(Date.now() - 24 * 60 * 60 * 1000);
            const orderIdStr = order.orderNumber.toString();
            const cleanId = orderIdStr.replace('#', '');
            const dupSearch = [orderIdStr, cleanId, `#${cleanId}`];
            if (!isNaN(cleanId)) dupSearch.push(Number(cleanId));

            let dupCheckQuery = db.collection('whatsapp_messages')
                .where('orderNumber', 'in', [...new Set(dupSearch)])
                .where('templateName', '==', templateName);

            // Fully professional timestamp filter (Requires Composite Index)
            if (timeLimit) {
                dupCheckQuery = dupCheckQuery.where('timestamp', '>', admin.firestore.Timestamp.fromDate(timeLimit));
            }

            const dupCheck = await dupCheckQuery.limit(1).get();
            if (!dupCheck.empty) {
                await db.collection('webhook_logs').doc(payload.log_id).update({ automationStatus: 'SKIPPED: DUPLICATE' });
                return res.status(200).json({ message: 'Duplicate alert prevented' });
            }
        } else {
            console.log('[Shipping Webhook] TEST MODE: Bypassing duplicate check');
        }

        // Send WhatsApp
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;

        if (!phoneId || !whatsappToken) {
            await db.collection('webhook_logs').doc(payload.log_id).update({ automationStatus: 'FAILED: MISSING_KEYS' });
            return res.status(500).json({ error: 'Missing API keys' });
        }

        const components = getTemplateComponents(automationType, order, payload, awb);

        try {
            const waResponse = await axios.post(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
                messaging_product: 'whatsapp',
                to: phone,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: 'en' },
                    components: components
                }
            }, {
                headers: { 'Authorization': `Bearer ${whatsappToken}` }
            });

            // Log Success
            await db.collection('whatsapp_messages').add({
                phoneNormalized: phone,
                phone: phone,
                customerName: order.customerName || 'Customer',
                orderNumber: order.orderNumber.toString(),
                direction: 'outbound',
                type: 'template',
                templateName: templateName,
                timestamp: admin.firestore.Timestamp.now(),
                expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
                whatsappId: waResponse.data.messages?.[0]?.id,
                status: 'sent',
                metadata: { automation: true, courier: payload.courier_name || order.carrier, awb: awb, automationType }
            });

            await db.collection('webhook_logs').doc(payload.log_id).update({ 
                automationStatus: 'SUCCESS',
                customerName: order.customerName || 'Customer'
            });

            return res.status(200).json({ success: true });

        } catch (waError) {
            const errorMsg = waError.response?.data?.error?.message || waError.message;
            await db.collection('webhook_logs').doc(payload.log_id).update({ 
                automationStatus: 'FAILED: META_API_ERROR',
                errorDetails: errorMsg
            });
            return res.status(500).json({ error: 'WhatsApp failed', details: errorMsg });
        }

    } catch (error) {
        console.error('[Shipping Webhook] Exception:', error);
        return res.status(500).json({ error: 'Internal Error' });
    }
};

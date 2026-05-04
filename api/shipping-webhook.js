const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

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

// Helper to run middleware
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

/**
 * FULL AUTOMATION ENGINE: Shipping Status Webhook
 * This endpoint receives updates from NimbusPost or other courier partners
 * and automatically triggers WhatsApp alerts for NDR and OFD statuses.
 */
module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = req.body;
        console.log('[Shipping Webhook] Received payload:', JSON.stringify(payload));

        // NEW: Log raw payload for Live Dashboard Monitoring (with 7-day TTL)
        const logRef = await db.collection('webhook_logs').add({
            source: 'nimbuspost',
            payload: payload,
            timestamp: admin.firestore.Timestamp.now(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
            status: payload.status || 'unknown',
            awb: payload.awb_number || payload.awb || 'N/A',
            automationStatus: 'PENDING'
        });
        payload.log_id = logRef.id;

        // 1. Extract Core Data (Prioritize your Order Number over Nimbus internal ID)
        const rawStatus = (payload.status || '').toString().toLowerCase();
        const awb = (payload.awb_number || payload.awb || '').toString().trim();
        const orderNum = (payload.order_number || payload.order_id || '').toString().trim();

        if (!awb && !orderNum) {
            return res.status(400).json({ error: 'Missing AWB or Order Number' });
        }

        // 2. Determine Trigger Type
        let templateName = null;
        let automationType = null;

        if (rawStatus.includes('ndr') || rawStatus.includes('undelivered') || rawStatus.includes('failed attempt') || rawStatus.includes('exception')) {
            templateName = 'alert_shipping_ndr';
            automationType = 'NDR';
        } else if (rawStatus.includes('out for delivery') || rawStatus.includes('ofd')) {
            templateName = 'alert_shipping_ofd';
            automationType = 'OFD';
        } else if (rawStatus.includes('in transit') || rawStatus.includes('shipped') || rawStatus.includes('dispatched')) {
            templateName = 'alert_shipping_transit';
            automationType = 'In-Transit';
        }

        if (!templateName) {
            console.log(`[Shipping Webhook] Status '${rawStatus}' does not require automation.`);
            return res.status(200).json({ message: 'Status ignored' });
        }

        // 3. Find the Order in Firestore
        let order = null;
        if (awb) {
            const q = await db.collection('orders').where('awb', '==', awb).limit(1).get();
            if (!q.empty) order = q.docs[0].data();
        }
        
        if (!order && orderNum) {
            // Try matching by orderNumber (with and without #, string vs number)
            const cleanNum = orderNum.replace('#', '').trim();
            const searchArray = [orderNum, cleanNum];
            if (!isNaN(cleanNum)) searchArray.push(Number(cleanNum));

            const q = await db.collection('orders').where('orderNumber', 'in', [...new Set(searchArray)]).limit(1).get();
            if (!q.empty) order = q.docs[0].data();
        }

        if (!order) {
            console.error(`[Shipping Webhook] No order found for AWB: ${awb} / OrderNum: ${orderNum}`);
            // Log the mismatch to help debugging
            if (payload.log_id) {
                await db.collection('webhook_logs').doc(payload.log_id).update({
                    automationStatus: 'FAILED: ORDER_NOT_FOUND',
                    debugInfo: `Searched for ${orderNum}`
                });
            }
            return res.status(404).json({ error: 'Order not found' });
        }

        let phone = order.phoneNormalized || order.phone || '';
        phone = phone.toString().replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        if (phone.length === 12 && phone.startsWith('0')) phone = '91' + phone.substring(1);

        if (!phone || phone.length < 10) {
            return res.status(400).json({ error: 'Invalid or missing phone number' });
        }

        // 4. Idempotency Check (Prevent duplicate alerts)
        const timeLimit = automationType === 'In-Transit' ? null : new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const cleanNum = order.orderNumber.toString().replace('#', '').trim();
        const searchArray = [order.orderNumber.toString(), cleanNum, `#${cleanNum}`];
        if (!isNaN(cleanNum)) searchArray.push(Number(cleanNum));

        let dupCheckQuery = db.collection('whatsapp_messages')
            .where('orderNumber', 'in', [...new Set(searchArray)])
            .where('templateName', '==', templateName);

        if (timeLimit) {
            dupCheckQuery = dupCheckQuery.where('timestamp', '>', admin.firestore.Timestamp.fromDate(timeLimit));
        }

        const dupCheck = await dupCheckQuery.limit(1).get();

        if (!dupCheck.empty) {
            console.info(`[Shipping Webhook] Skipping duplicate ${automationType} alert for order ${order.orderNumber}`);
            return res.status(200).json({ message: 'Duplicate alert prevented' });
        }

        // 5. Trigger WhatsApp Alert via internal API logic
        // We reuse the existing /api/whatsapp logic or call it directly
        const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        // Extract product name (Assuming 'items' array or 'productName' field)
        const firstItem = order.items?.[0]?.name || order.productName || 'your order';
        const productDisplay = order.items?.length > 1 ? `${firstItem} & more` : firstItem;

        const components = [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: order.customerName || 'Customer' },
                    { type: 'text', text: order.orderNumber.toString() },
                    { type: 'text', text: productDisplay },
                    { type: 'text', text: payload.courier_name || order.carrier || 'our courier partner' }
                ]
            }
        ];

        // 5a. Specialized Parameter Handling for Buttons
        if (automationType === 'In-Transit') {
            // Param 4 for NDR/OFD (if needed) vs Button Param for In-Transit
            components.push({
                type: 'button',
                sub_type: 'url',
                index: '0', // First button
                parameters: [
                    { type: 'text', text: awb || order.awb || '' }
                ]
            });
        } else if (automationType === 'OFD') {
            components[0].parameters.push({ type: 'text', text: order.awb || awb || '' });
        } else if (automationType === 'NDR') {
            components[0].parameters.push({ type: 'text', text: payload.ndr_reason || 'Address issue or customer not available' });
        }

        const waResponse = await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phone,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: 'en' },
                    components: components
                }
            })
        });

        const waData = await waResponse.json();
        
        if (!waResponse.ok) {
            console.error('[Shipping Webhook] Meta API Error:', JSON.stringify(waData));
            if (payload.log_id) {
                await db.collection('webhook_logs').doc(payload.log_id).update({
                    automationStatus: 'FAILED: META_API_ERROR',
                    errorDetails: waData.error?.message || 'Unknown Meta Error'
                });
            }
            return res.status(waResponse.status).json({ error: 'WhatsApp delivery failed', details: waData });
        }

        // 6. Log to Firestore for Dashboard Visibility
        const logEntry = {
            phoneNormalized: phone,
            phone: phone,
            customerName: order.customerName || 'Customer',
            orderNumber: order.orderNumber.toString(),
            direction: 'outbound',
            type: 'template',
            templateName: templateName,
            timestamp: admin.firestore.Timestamp.now(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
            whatsappId: waData.messages?.[0]?.id,
            status: 'sent',
            metadata: {
                automation: true,
                courier: payload.courier_name || order.carrier,
                awb: awb,
                automationType
            }
        };

        await db.collection('whatsapp_messages').add(logEntry);

        // UPDATE original webhook_log with result
        if (payload.log_id) {
            await db.collection('webhook_logs').doc(payload.log_id).update({
                automationStatus: 'SUCCESS',
                customerName: order.customerName || 'Customer'
            });
        }

        console.info(`[Shipping Webhook] Successfully triggered auto-${automationType} for Order ${order.orderNumber}`);
        return res.status(200).json({ success: true, automationType });

    } catch (error) {
        console.error('[Shipping Webhook] Exception:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

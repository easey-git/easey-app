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

        // NEW: Log raw payload for Live Dashboard Monitoring
        await db.collection('webhook_logs').add({
            source: 'nimbuspost',
            payload: payload,
            timestamp: admin.firestore.Timestamp.now(),
            status: payload.status || 'unknown',
            awb: payload.awb_number || payload.awb || 'N/A'
        });

        // 1. Extract Core Data (Adapt to NimbusPost format)
        // Standard NimbusPost webhook fields: status, awb, order_number
        const rawStatus = (payload.status || '').toString().toLowerCase();
        const awb = (payload.awb || payload.tracking_number || '').toString().trim();
        const orderId = (payload.order_id || payload.order_number || '').toString().trim();

        if (!awb && !orderId) {
            return res.status(400).json({ error: 'Missing AWB or Order ID' });
        }

        // 2. Determine Trigger Type
        let templateName = null;
        let automationType = null;

        if (rawStatus.includes('ndr') || rawStatus.includes('undelivered') || rawStatus.includes('failed attempt')) {
            templateName = 'alert_shipping_ndr';
            automationType = 'NDR';
        } else if (rawStatus.includes('out for delivery') || rawStatus.includes('ofd')) {
            templateName = 'alert_shipping_ofd';
            automationType = 'OFD';
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
        
        if (!order && orderId) {
            // Try matching by orderNumber (with and without #)
            const cleanId = orderId.replace('#', '');
            const q = await db.collection('orders').where('orderNumber', 'in', [orderId, cleanId, Number(cleanId)]).limit(1).get();
            if (!q.empty) order = q.docs[0].data();
        }

        if (!order) {
            console.error(`[Shipping Webhook] No order found for AWB: ${awb} / ID: ${orderId}`);
            return res.status(404).json({ error: 'Order not found' });
        }

        const phone = order.phone || order.phoneNormalized;
        if (!phone) {
            return res.status(400).json({ error: 'No phone number found for order' });
        }

        // 4. Idempotency Check (Prevent duplicate alerts within 24h)
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const dupCheck = await db.collection('whatsapp_messages')
            .where('orderNumber', '==', order.orderNumber.toString())
            .where('templateName', '==', templateName)
            .where('timestamp', '>', admin.firestore.Timestamp.fromDate(dayAgo))
            .limit(1)
            .get();

        if (!dupCheck.empty) {
            console.info(`[Shipping Webhook] Skipping duplicate ${automationType} alert for order ${order.orderNumber}`);
            return res.status(200).json({ message: 'Duplicate alert prevented' });
        }

        // 5. Trigger WhatsApp Alert via internal API logic
        // We reuse the existing /api/whatsapp logic or call it directly
        const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        const components = [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: order.customerName || 'Customer' },
                    { type: 'text', text: order.orderNumber.toString() },
                    { type: 'text', text: payload.courier_name || order.carrier || 'our courier partner' }
                ]
            }
        ];

        // For OFD, we add the AWB as the 4th parameter
        if (automationType === 'OFD') {
            components[0].parameters.push({ type: 'text', text: order.awb || awb || '' });
        } else if (automationType === 'NDR') {
            // NDR might need attempts or reason
            components[0].parameters.push({ type: 'text', text: payload.ndr_reason || 'Address issue or customer not available' });
        }

        const waResponse = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${whatsappToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: phone.toString().replace(/\D/g, ''),
                type: "template",
                template: {
                    name: templateName,
                    language: { code: "en" },
                    components: components
                }
            })
        });

        const waData = await waResponse.json();

        if (!waResponse.ok) {
            console.error('[Shipping Webhook] WhatsApp API Error:', JSON.stringify(waData));
            return res.status(500).json({ error: 'WhatsApp delivery failed', details: waData });
        }

        // 6. Log to Firestore for Dashboard Visibility
        await db.collection('whatsapp_messages').add({
            phone: phone,
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
        });

        console.info(`[Shipping Webhook] Successfully triggered auto-${automationType} for Order ${order.orderNumber}`);
        return res.status(200).json({ success: true, automationType });

    } catch (error) {
        console.error('[Shipping Webhook] Exception:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

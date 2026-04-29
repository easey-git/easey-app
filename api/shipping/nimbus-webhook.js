const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });

// Helper to run middleware
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

// Initialize Firebase Admin
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

/**
 * Normalizes phone number to E.164 format.
 */
const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, '');
    if (p.length === 10) p = `91${p}`;
    return p;
};

/**
 * Sends WhatsApp Template for NDR.
 */
async function sendNDRWhatsApp(phone, orderNumber, awb, reason) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId || !phone) return;

    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    
    // Template: shipping_ndr_alert
    // Parameters: 1: Name, 2: Order#, 3: Reason
    const body = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
            name: "shipping_ndr_alert",
            language: { code: "en_US" },
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: "Customer" }, // Fallback name
                        { type: "text", text: String(orderNumber) },
                        { type: "text", text: reason || "Unavailable" }
                    ]
                }
            ]
        }
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        // Log to Firestore
        await db.collection('whatsapp_messages').add({
            phone: phone,
            phoneNormalized: normalizePhone(phone),
            direction: 'outbound',
            type: 'template',
            templateName: 'shipping_ndr_alert',
            body: `NDR Alert: ${reason} (AWB: ${awb})`,
            timestamp: admin.firestore.Timestamp.now(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
            whatsappId: data.messages?.[0]?.id,
            metadata: { awb, orderNumber, source: 'nimbuspost' }
        });

    } catch (error) {
        console.error('NDR WhatsApp Send Error:', error);
    }
}

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    console.log('[NimbusPost Webhook] Received:', JSON.stringify(req.body));

    try {
        const payload = req.body;
        const event = payload.status || payload.event;
        const awb = payload.awb || payload.data?.awb;
        const orderId = payload.order_id || payload.data?.order_id;
        const reason = payload.reason || payload.remarks || payload.data?.reason;

        // We only care about NDR events
        if (event !== 'NDR' && !String(event).toLowerCase().includes('ndr')) {
            return res.status(200).json({ status: 'ignored', message: 'Not an NDR event' });
        }

        if (!awb) return res.status(400).json({ error: 'Missing AWB' });

        // 1. Find the order in Firestore
        let orderData = null;
        let orderSnap = await db.collection('orders').doc(String(orderId)).get();
        
        if (!orderSnap.exists) {
            // Try searching by orderNumber if orderId doesn't match doc ID
            const querySnap = await db.collection('orders').where('orderNumber', '==', String(orderId)).limit(1).get();
            if (!querySnap.empty) {
                orderSnap = querySnap.docs[0];
            }
        }

        if (orderSnap.exists) {
            orderData = orderSnap.data();
            // Update order status
            await orderSnap.ref.update({
                shipping_status: 'NDR',
                ndr_reason: reason,
                updatedAt: admin.firestore.Timestamp.now()
            });
        }

        const phone = orderData?.phoneNormalized || payload.phone || payload.data?.phone;
        const orderNumber = orderData?.orderNumber || orderId;

        if (phone) {
            await sendNDRWhatsApp(phone, orderNumber, awb, reason);
        }

        return res.status(200).json({ status: 'success', message: 'NDR processed' });

    } catch (error) {
        console.error('[NimbusPost Webhook] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

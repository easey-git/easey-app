const admin = require("firebase-admin");
const cors = require('cors')({ origin: true });
const crypto = require('crypto');

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
 * Verifies the NimbusPost webhook signature.
 */
const verifySignature = (req) => {
    const secret = process.env.NIMBUS_SECRET;
    if (!secret) return true; // Skip if no secret set

    const signature = req.headers['x-hmac-sha256'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(JSON.stringify(req.body)).digest('base64');

    return signature === digest;
};

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
                        { type: "text", text: "Customer" },
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

    // Verify Signature
    if (!verifySignature(req)) {
        console.error('[NimbusPost Webhook] Invalid Signature');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[NimbusPost Webhook] Received:', JSON.stringify(req.body));

    try {
        const payload = req.body;
        const status = (payload.status || "").toLowerCase();
        const awb = payload.awb_number;
        const reason = payload.message;

        // Check if status is NDR related
        if (status !== 'ndr' && !status.includes('ndr') && !reason.toLowerCase().includes('ndr')) {
            return res.status(200).json({ status: 'ignored', message: 'Not an NDR event' });
        }

        if (!awb) return res.status(400).json({ error: 'Missing AWB' });

        // Search for the order using AWB
        let orderSnap = await db.collection('orders').where('awb', '==', String(awb)).limit(1).get();
        if (orderSnap.empty) {
            orderSnap = await db.collection('orders').where('shipping_awb', '==', String(awb)).limit(1).get();
        }

        if (orderSnap.empty) {
            console.warn(`[NimbusPost Webhook] Order not found for AWB: ${awb}`);
            return res.status(200).json({ status: 'not_found', message: 'Order not found for this AWB' });
        }

        const orderDoc = orderSnap.docs[0];
        const orderData = orderDoc.data();

        // Update order status
        await orderDoc.ref.update({
            shipping_status: 'NDR',
            ndr_reason: reason,
            updatedAt: admin.firestore.Timestamp.now()
        });

        const phone = orderData.phoneNormalized || orderData.phone;
        const orderNumber = orderData.orderNumber;

        if (phone) {
            await sendNDRWhatsApp(phone, orderNumber, awb, reason);
        }

        return res.status(200).json({ status: 'success', message: 'NDR processed' });

    } catch (error) {
        console.error('[NimbusPost Webhook] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

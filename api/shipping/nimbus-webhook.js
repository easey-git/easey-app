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
            name: "alert_shipping_ndr",
            language: { code: "en" },
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
            templateName: 'alert_shipping_ndr',
            body: `NDR Alert: ${reason} (AWB: ${awb})`,
            timestamp: admin.firestore.Timestamp.now(),
            expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
            whatsappId: data.messages?.[0]?.id || null,
            metadata: { awb, orderNumber, source: 'nimbuspost' }
        });

    } catch (error) {
        console.error('NDR WhatsApp Send Error:', error);
    }
}

const { getShipmentDetails } = require('./nimbus');

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!verifySignature(req)) {
        console.error('[NimbusPost Webhook] Invalid Signature');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const payload = req.body;
        const status = (payload.status || "").toLowerCase();
        const awb = payload.awb_number;
        const reason = payload.message;

        if (status !== 'ndr' && !status.includes('ndr') && !reason.toLowerCase().includes('ndr')) {
            return res.status(200).json({ status: 'ignored', message: 'Not an NDR event' });
        }

        if (!awb) return res.status(400).json({ error: 'Missing AWB' });

        // 1. Fetch Shipment Details from NimbusPost (to get the Link)
        const shipment = await getShipmentDetails(awb);
        if (!shipment || !shipment.orderNumber) {
            console.error(`[NimbusPost Webhook] Could not find any order reference in Nimbus for AWB: ${awb}`);
            return res.status(200).json({ status: 'error', message: 'Order reference not found in Nimbus' });
        }

        const orderNumber = shipment.orderNumber;

        // 2. Find the order in Firestore using the Order Number we just got
        // We check for String, Number, and with/without #
        let orderSnap = await db.collection('orders').where('orderNumber', '==', String(orderNumber)).limit(1).get();
        
        if (orderSnap.empty) {
            // Try as a pure number if it looks like one
            const numericOrder = parseInt(orderNumber.replace(/\D/g, ''));
            if (!isNaN(numericOrder)) {
                orderSnap = await db.collection('orders').where('orderNumber', '==', numericOrder).limit(1).get();
            }
        }
        
        if (orderSnap.empty) {
            const altOrderNumber = orderNumber.startsWith('#') ? orderNumber.substring(1) : `#${orderNumber}`;
            orderSnap = await db.collection('orders').where('orderNumber', '==', String(altOrderNumber)).limit(1).get();
        }

        if (orderSnap.empty) {
            console.error(`[NimbusPost Webhook] Order ${orderNumber} not found in Firestore.`);
            return res.status(200).json({ status: 'error', message: `Order ${orderNumber} not found in database` });
        }

        const orderDoc = orderSnap.docs[0];
        const orderData = orderDoc.data();
        const phone = normalizePhone(orderData.phone || orderData.phoneNormalized);
        const customerName = orderData.customerName || 'Customer';

        // Update order with AWB if it was missing, and set NDR status
        await orderDoc.ref.update({
            awb: awb, // Sync AWB back to Firestore
            shipping_status: 'NDR',
            ndr_reason: reason,
            updatedAt: admin.firestore.Timestamp.now()
        });

            // Send Notification to Admins
            try {
                await db.collection('notifications').add({
                    title: '🚚 Delivery Failed (NDR)',
                    body: `NDR Alert for Order #${orderNumber}: ${reason}`,
                    type: 'NDR_ALERT',
                    orderId: orderDoc.id,
                    timestamp: admin.firestore.Timestamp.now(),
                    read: false,
                    targetRoles: ['admin', 'manager']
                });
            } catch (e) {}

        // 3. Send WhatsApp to Customer (using data from NimbusPost)
        if (phone) {
            await sendNDRWhatsApp(phone, orderNumber, awb, reason);
        }

        return res.status(200).json({ status: 'success', message: 'NDR processed' });

    } catch (error) {
        console.error('[NimbusPost Webhook] Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

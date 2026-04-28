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

/**
 * Normalizes phone number to E.164 format (digits only) without leading +.
 */
const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, '');
    if (p.length === 10) {
        p = `91${p}`; // Default to India
    }
    return p;
};

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { to, message, type = 'text', templateName, languageCode = 'en_US', components } = req.body;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
        return res.status(500).json({ error: 'WhatsApp configuration missing on server.' });
    }

    if (!to) {
        return res.status(400).json({ error: 'Recipient phone number is required.' });
    }

    const phoneNormalized = normalizePhone(to);

    // Industry Standard: Check if user has opted out before sending
    const subscriptionCheck = await db.collection('orders')
        .where('phoneNormalized', '==', phoneNormalized)
        .where('isSubscribed', '==', false)
        .limit(1)
        .get();

    if (!subscriptionCheck.empty) {
        return res.status(403).json({ error: 'Recipient has opted out of WhatsApp communications.' });
    }

    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

    let body = {
        messaging_product: "whatsapp",
        to: phoneNormalized,
    };

    if (type === 'template') {
        body.type = "template";
        body.template = {
            name: templateName,
            language: { code: languageCode },
            components: components
        };
    } else {
        body.type = "text";
        body.text = { body: message };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('WhatsApp API Error:', JSON.stringify(data));
            return res.status(response.status).json({ error: data.error?.message || 'Failed to send message' });
        }

        const whatsappId = data.messages?.[0]?.id;

        // Log to Firestore
        const logData = {
            phone: to,
            phoneNormalized,
            direction: 'outbound',
            type,
            body: type === 'template' ? `Template: ${templateName}` : message,
            timestamp: admin.firestore.Timestamp.now(),
            whatsappId,
            status: 'sent'
        };

        if (type === 'template') logData.templateName = templateName;

        await db.collection('whatsapp_messages').add(logData);

        return res.status(200).json({ success: true, whatsappId });
    } catch (error) {
        console.error('WhatsApp Send Exception:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const admin = require("firebase-admin");

// Initialize Firebase Admin if it hasn't been initialized yet
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}

const db = admin.firestore();

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

/**
 * Normalizes phone number to E.164 format (digits only) without leading +.
 * Defaults to India (91) if no country code is detected on 10-digit numbers.
 */
const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, '');

    // If 10 digits, assume default country code (91)
    if (p.length === 10) {
        p = `91${p}`;
    }

    return p;
};

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { to, templateName, languageCode = 'en_US', components } = req.body;

    if (!to || !templateName) {
        return res.status(400).json({ error: 'Missing required fields: to, templateName' });
    }

    const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
    const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        return res.status(500).json({ error: 'Server configuration error: Missing WhatsApp credentials' });
    }

    // Normalize Phone Number
    const normalizedTo = normalizePhone(to);
    if (!normalizedTo) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }

    try {
        const url = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        const payload = {
            messaging_product: "whatsapp",
            to: normalizedTo,
            type: "template",
            template: {
                name: templateName,
                language: {
                    code: languageCode
                }
            }
        };

        if (components) {
            payload.template.components = components;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('WhatsApp API Error:', data);
            return res.status(response.status).json({ error: data.error?.message || 'Failed to send message' });
        }

        // Log Outbound Message to Firestore
        try {
            await db.collection('whatsapp_messages').add({
                phone: normalizedTo,
                phoneNormalized: normalizedTo, // Already normalized
                direction: 'outbound',
                type: 'template',
                body: `Template: ${templateName}`,
                templateName: templateName,
                timestamp: admin.firestore.Timestamp.now(),
                whatsappId: data.messages?.[0]?.id
            });
        } catch (logError) {
            console.error('Error logging outbound message:', logError);
            // Don't fail the request just because logging failed
        }

        return res.status(200).json({ success: true, data });

    } catch (error) {
        console.error('Internal Server Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

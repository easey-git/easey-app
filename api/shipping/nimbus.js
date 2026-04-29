const admin = require("firebase-admin");

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

const NIMBUS_API_BASE = 'https://api.nimbuspost.com/v1';

/**
 * Gets a login token for NimbusPost.
 * In a real production environment, you should cache this token in Firestore or Redis.
 */
async function getNimbusToken() {
    try {
        const response = await fetch(`${NIMBUS_API_BASE}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: process.env.NIMBUS_EMAIL,
                password: process.env.NIMBUS_PASSWORD
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'NimbusPost Login Failed');
        
        return data.data; // This is usually the token
    } catch (error) {
        console.error('NimbusPost Auth Error:', error);
        throw error;
    }
}

/**
 * Updates the NDR status for a shipment.
 * @param {string} awb - The AWB number.
 * @param {string} action - 're-attempt' | 'return' | 'fake_attempt' etc.
 * @param {string} remarks - Customer feedback or new address.
 */
async function updateNDRAction(awb, action, remarks = "") {
    try {
        const token = await getNimbusToken();
        
        const body = {
            awb: awb,
            action: action, // e.g., 'REATTEMPT'
            comments: remarks
        };

        const response = await fetch(`${NIMBUS_API_BASE}/shipments/ndr/update`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('NimbusPost NDR Update Error:', JSON.stringify(data));
            return { success: false, error: data.message };
        }

        return { success: true, data: data.data };
    } catch (error) {
        console.error('NimbusPost NDR Exception:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { updateNDRAction };

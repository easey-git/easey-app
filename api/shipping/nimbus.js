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
 * @param {string} action - 're-attempt' | 'change_address' | 'change_phone'
 * @param {object} actionData - Data required for the action (e.g., re_attempt_date)
 */
async function updateNDRAction(awb, action, actionData = {}) {
    try {
        const token = await getNimbusToken();
        
        // If action is re-attempt, ensure we have a date (default to tomorrow)
        if (action === 're-attempt' && !actionData.re_attempt_date) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            actionData.re_attempt_date = tomorrow.toISOString().split('T')[0];
        }

        const body = [
            {
                awb: awb,
                action: action,
                action_data: actionData
            }
        ];

        const response = await fetch(`${NIMBUS_API_BASE}/ndr/action`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        // The response is an array of statuses
        const status = data[0];

        if (!status || !status.status) {
            console.error('NimbusPost NDR Update Error:', JSON.stringify(data));
            return { success: false, error: status?.message || 'Failed to update NDR' };
        }

        return { success: true, message: status.message };
    } catch (error) {
        console.error('NimbusPost NDR Exception:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetches shipment details (name, phone, etc.) from NimbusPost by AWB.
 * @param {string} awb - The AWB number.
 */
async function getShipmentDetails(awb) {
    try {
        const token = await getNimbusToken();
        const response = await fetch(`${NIMBUS_API_BASE}/shipments/view/${awb}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!data.status || !data.data) {
            console.error('NimbusPost View Shipment Error:', JSON.stringify(data));
            return null;
        }

        return {
            customerName: data.data.consignee_name || 'Customer',
            phone: data.data.consignee_phone,
            orderNumber: data.data.order_number || data.data.order_id,
            awb: data.data.awb_number
        };
    } catch (error) {
        console.error('NimbusPost View Exception:', error);
        return null;
    }
}

module.exports = { 
    getNimbusToken, 
    updateNDRAction, 
    getShipmentDetails 
};

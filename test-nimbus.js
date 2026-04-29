const crypto = require('crypto');

// --- Configuration ---
// Make sure this matches the secret you put in Vercel and NimbusPost
const NIMBUS_SECRET = 'easey_ndr_secure_2026';
const WEBHOOK_URL = 'https://easey-app.vercel.app/api/shipping/nimbus-webhook';

// Put a real AWB number here that exists in your Firestore orders!
// If you don't have one, the script will still run, but you'll get an "Order not found" response.
const TEST_AWB = '40441733756784';

// --- The Payload NimbusPost sends ---
const payload = {
    awb_number: TEST_AWB,
    status: 'ndr',
    event_time: new Date().toISOString(),
    location: 'Delhi',
    message: 'Customer not responding to calls'
};

const payloadString = JSON.stringify(payload);

// --- Generate the Security Signature ---
const hmac = crypto.createHmac('sha256', NIMBUS_SECRET);
const signature = hmac.update(payloadString).digest('base64');

// --- Send the Test Request ---
async function testWebhook() {
    console.log(`Sending test NDR for AWB: ${TEST_AWB}...`);

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Hmac-SHA256': signature
            },
            body: payloadString
        });

        const data = await response.json();
        console.log('\n--- Webhook Response ---');
        console.log(`Status Code: ${response.status}`);
        console.log('Data:', data);

        if (response.status === 200 && data.status === 'success') {
            console.log('\n✅ SUCCESS! The webhook works and WhatsApp should be sent.');
        } else if (data.status === 'not_found') {
            console.log('\n⚠️ PARTIAL SUCCESS: Webhook security passed, but AWB not found in database. This is normal for a test AWB.');
        } else {
            console.log('\n❌ FAILED: Something went wrong.');
        }

    } catch (error) {
        console.error('Error sending request:', error);
    }
}

testWebhook();

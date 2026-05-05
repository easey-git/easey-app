const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

async function getLog() {
    const snapshot = await db.collection('webhook_logs').where('type', '==', 'shopify_order').orderBy('timestamp', 'desc').limit(2).get();
    if (snapshot.empty) {
        console.log("No logs found");
        return;
    }
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log("Order number:", data.payload.order_number);
        console.log("Financial status:", data.payload.financial_status);
        console.log("Gateway:", data.payload.gateway);
        console.log("Payment gateway names:", data.payload.payment_gateway_names);
        console.log("Tags:", data.payload.tags);
    });
}

getLog().catch(console.error);

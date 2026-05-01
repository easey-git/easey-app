
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

async function checkOrders() {
    const snapshot = await db.collection("orders").limit(5).get();
    snapshot.forEach(doc => {
        console.log("ID:", doc.id);
        console.log("Data:", JSON.stringify(doc.data(), null, 2));
    });
}

checkOrders().catch(console.error);

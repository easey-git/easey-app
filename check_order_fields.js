const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();
async function check() {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) {
        console.log('No orders found');
        return;
    }
    console.log('ORDER_FIELDS:', Object.keys(snap.docs[0].data()));
    console.log('ORDER_DATA:', JSON.stringify(snap.docs[0].data(), null, 2));
}
check();

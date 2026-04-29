const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();
async function find() {
    const snap = await db.collection('orders').where('status', '==', 'COD').limit(1).get();
    if (snap.empty) {
        console.log('No COD orders found');
        return;
    }
    const order = snap.docs[0].data();
    console.log('FOUND_AWB:' + (order.awb || order.shipping_awb || 'NO_AWB_FOUND'));
}
find();

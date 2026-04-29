const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}
const db = admin.firestore();

async function create() {
    await db.collection('orders').add({
        orderNumber: '#3240',
        customerName: 'Sneha Gujarat',
        phone: '918910901525',
        status: 'COD',
        totalPrice: 699,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
    });
    console.log('✅ Order #3240 for Sneha created in Firestore!');
    process.exit(0);
}
create();

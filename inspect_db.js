const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!getApps().length) {
    initializeApp({
        credential: cert(SERVICE_ACCOUNT)
    });
}

const db = getFirestore();

async function inspect() {
    console.log("--- ORDER SAMPLE ---");
    const orders = await db.collection('orders').limit(1).get();
    if (!orders.empty) {
        console.log(JSON.stringify(orders.docs[0].data(), null, 2));
    } else {
        console.log("No orders found.");
    }

    console.log("\n--- CHECKOUT SAMPLE ---");
    const checkouts = await db.collection('checkouts').limit(1).get();
    if (!checkouts.empty) {
        console.log(JSON.stringify(checkouts.docs[0].data(), null, 2));
    } else {
        console.log("No checkouts found.");
    }
}

inspect();

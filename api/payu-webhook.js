const admin = require("firebase-admin");
const crypto = require('crypto');
const cors = require('cors')({ origin: true });

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

const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

module.exports = async (req, res) => {
    await runMiddleware(req, res, cors);

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const {
            status, txnid, amount, productinfo, firstname, email, key, hash, mihpayid, mode, error_Message, bank_ref_num
        } = req.body;

        const salt = process.env.PAYU_SALT;

        // 1. Verify Hash
        // Formula: sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
        const udf1 = req.body.udf1 || '';
        const udf2 = req.body.udf2 || '';
        const udf3 = req.body.udf3 || '';
        const udf4 = req.body.udf4 || '';
        const udf5 = req.body.udf5 || '';

        const hashString = `${salt}|${status}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}|||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
        const calculatedHash = crypto.createHash('sha512').update(hashString).digest('hex');

        if (calculatedHash !== hash) {
            console.error('PayU Webhook: Hash Mismatch', { received: hash, calculated: calculatedHash });
            // Ideally reject, but sometimes PayU retry policies are aggressive. We log and proceed cautiously or return 400.
            // keeping it strictly 400 for security.
            return res.status(400).json({ error: 'Invalid Hash' });
        }

        // 2. Log Transaction to Firestore
        const txnRef = db.collection('payu_transactions').doc(txnid);
        await txnRef.set({
            txnid,
            mihpayid,
            amount,
            status,
            mode,
            error_Message,
            bank_ref_num,
            productinfo,
            firstname,
            email,
            updatedAt: admin.firestore.Timestamp.now(),
            raw: JSON.stringify(req.body)
        }, { merge: true });

        // 3. Update Order Status if applicable
        // Assuming txnid format: txn_ORDERID or similar
        // Or if txnid IS the orderId
        // Try to match with Order
        if (status === 'success') {
            // Find order by txnid or extraction
            // Simple approach: Check if we have an order with this ID or if txnid contains it
            const orderIdStr = txnid.replace('txn_', ''); // Example extraction
            const orderRef = db.collection('orders').doc(orderIdStr);
            const orderDoc = await orderRef.get();

            if (orderDoc.exists) {
                await orderRef.update({
                    status: 'Paid',
                    paymentStatus: 'success',
                    paymentId: txnid, // Save the PayU txn ID
                    paymentMethod: mode || 'PayU',
                    updatedAt: admin.firestore.Timestamp.now()
                });
                console.log(`Order ${orderIdStr} marked as Paid via PayU Webhook`);
            } else {
                // Search by query if strictly exact match not found
                // Optional: perform query if needed
            }
        } else if (status === 'failure') {
            const orderIdStr = txnid.replace('txn_', '');
            const orderRef = db.collection('orders').doc(orderIdStr);
            const orderDoc = await orderRef.get();
            if (orderDoc.exists) {
                await orderRef.update({
                    paymentStatus: 'failed',
                    paymentError: error_Message,
                    updatedAt: admin.firestore.Timestamp.now()
                });
            }
        }

        return res.status(200).send('Verified');

    } catch (error) {
        console.error('PayU Webhook Error:', error);
        return res.status(500).json({ error: error.message });
    }
};

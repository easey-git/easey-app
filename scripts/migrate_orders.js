const admin = require("firebase-admin");
const path = require("path");

// Load Environment Variables (You might need dotenv if running locally)
// require('dotenv').config(); 

// Initialize Firebase Admin
// NOTE: Ensure you have your service account key or are authenticated
if (!admin.apps.length) {
    try {
        // Try to load from local service account file if available
        const serviceAccount = require("../service-account.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        // Fallback to environment variable
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
            });
        } else {
            console.error("Error: Could not initialize Firebase Admin. Missing service-account.json or FIREBASE_SERVICE_ACCOUNT env var.");
            process.exit(1);
        }
    }
}

const db = admin.firestore();

const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.toString().replace(/\D/g, '');
    if (p.length === 10) {
        p = `91${p}`;
    }
    return p;
};

async function migrateOrders() {
    console.log("Starting Order Migration: Backfilling phoneNormalized...");

    const ordersRef = db.collection('orders');
    const snapshot = await ordersRef.get();

    if (snapshot.empty) {
        console.log("No orders found.");
        return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const batchSize = 500;
    let batch = db.batch();
    let operationCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();

        // Skip if already normalized
        if (data.phoneNormalized) {
            skippedCount++;
            continue;
        }

        const rawPhone = data.phone || data.customer?.phone || data.shipping_address?.phone;
        const normalized = normalizePhone(rawPhone);

        if (normalized) {
            batch.update(doc.ref, {
                phoneNormalized: normalized,
                updatedAt: admin.firestore.Timestamp.now() // Optional: update timestamp
            });
            updatedCount++;
            operationCount++;
        } else {
            console.warn(`Skipping Order ${doc.id}: No valid phone number found.`);
        }

        // Commit batch if limit reached
        if (operationCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            operationCount = 0;
            console.log(`Committed batch of ${batchSize} updates...`);
        }
    }

    // Commit remaining
    if (operationCount > 0) {
        await batch.commit();
    }

    console.log("------------------------------------------------");
    console.log(`Migration Complete.`);
    console.log(`Total Orders Scanned: ${snapshot.size}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (Already Done): ${skippedCount}`);
    console.log("------------------------------------------------");
}

migrateOrders().catch(console.error);

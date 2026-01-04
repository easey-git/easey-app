const admin = require("firebase-admin");
const path = require("path");

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
// Load environment variables if running locally with dotenv
require('dotenv').config();

async function migrateData() {
    console.log("🚀 Starting Data Migration: String Prices -> Number Prices...");
    console.log("⚠️  WARN: This will OVERWRITE 'totalPrice' in your documents from String to Number.");

    // 1. Initialize Firebase
    if (!admin.apps.length) {
        try {
            // Use Application Default Credentials (works if you ran 'gcloud auth application-default login' or are in a cloud env)
            // OR checks for GOOGLE_APPLICATION_CREDENTIALS env var
            admin.initializeApp({
                credential: admin.credential.applicationDefault()
            });
            console.log("✅ Authenticated using default credentials.");
        } catch (e) {
            console.error("❌ Failed to initialize Firebase.");
            console.error("Try running: gcloud auth application-default login");
            console.error(e);
            process.exit(1);
        }
    }

    const db = admin.firestore();
    const batchSize = 500;
    let totalUpdated = 0;

    // ------------------------------------------------------------------
    // MIGRATE ORDERS
    // ------------------------------------------------------------------
    console.log("\n📦 Processing 'orders' collection...");
    const ordersRef = db.collection('orders');
    const snapshot = await ordersRef.get();

    if (snapshot.empty) {
        console.log("No orders found.");
    } else {
        const batches = [];
        let currentBatch = db.batch();
        let batchCount = 0;

        snapshot.docs.forEach((doc) => {
            const data = doc.data();

            // Check if conversion is needed (if it's a string)
            if (data.totalPrice && typeof data.totalPrice === 'string') {
                const numericVal = parseFloat(data.totalPrice.replace(/,/g, '').trim());

                if (!isNaN(numericVal)) {
                    // Overwrite the existing field
                    currentBatch.update(doc.ref, { totalPrice: numericVal });
                    batchCount++;

                    // Fire batch if full
                    if (batchCount >= batchSize) {
                        batches.push(currentBatch.commit());
                        currentBatch = db.batch();
                        batchCount = 0;
                    }
                }
            }
        });

        // Commit remaining
        if (batchCount > 0) {
            batches.push(currentBatch.commit());
        }

        await Promise.all(batches);
        totalUpdated += snapshot.size; // roughly
        console.log(`✅ Converted ${totalUpdated} orders: 'totalPrice' is now a Number.`);
    }

    console.log("\n🎉 Migration Complete!");
    process.exit(0);
}

migrateData();

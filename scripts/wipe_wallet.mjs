import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, query, limit } from 'firebase/firestore';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const firebaseConfig = {
    apiKey: "AIzaSyCrp7A4FlGRbIkmPpzP0nxzae4u808RHBw",
    authDomain: "easey-db.firebaseapp.com",
    projectId: "easey-db",
    storageBucket: "easey-db.firebasestorage.app",
    messagingSenderId: "783483362570",
    appId: "1:783483362570:web:8cd006aa659d66e79baef3",
    measurementId: "G-CHZFNWKVYQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function wipe() {
    console.log("⚠️  WIPING ALL WALLET TRANSACTIONS...");
    const coll = collection(db, 'wallet_transactions');

    // Delete in batches
    while (true) {
        const q = query(coll, limit(400));
        const snapshot = await getDocs(q);

        if (snapshot.size === 0) break;

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`Deleted ${snapshot.size} docs...`);
    }

    console.log("✅ Collection cleared.");
}

wipe();

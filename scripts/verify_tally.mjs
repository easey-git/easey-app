import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getAggregateFromServer, sum, count } from 'firebase/firestore';

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

async function run() {
    console.log("🔍 Verifying Firestore Balance...");
    const coll = collection(db, 'wallet_transactions');

    try {
        const incomeQ = query(coll, where("type", "==", "income"));
        const expenseQ = query(coll, where("type", "==", "expense"));

        console.log("Fetching Aggregations (this may take a moment)...");

        const [incomeSnap, expenseSnap] = await Promise.all([
            getAggregateFromServer(incomeQ, { total: sum('amount'), count: count() }),
            getAggregateFromServer(expenseQ, { total: sum('amount'), count: count() })
        ]);

        const inc = incomeSnap.data();
        const exp = expenseSnap.data();

        console.log("\n📊 FIRESTORE AUDIT REPORT");
        console.log("-------------------------");
        console.log(`Income:   ₹${inc.total.toLocaleString()}  (${inc.count} docs)`);
        console.log(`Expense:  ₹${exp.total.toLocaleString()}  (${exp.count} docs)`);
        console.log(`Net:      ₹${(inc.total - exp.total).toLocaleString()}`);
        console.log("-------------------------");

        console.log("Targets:");
        console.log("Expected Expense: ₹96,822");
        console.log("Expected Income:  ₹65,967");

    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();

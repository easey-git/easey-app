import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
    console.log("🔍 Verifying Firestore Balance (Client-Side Sum)...");
    const coll = collection(db, 'wallet_transactions');

    // Fetch ALL docs (Limit 1000 for safety, but we expect ~130)
    const snapshot = await getDocs(coll);

    let totalIncome = 0;
    let totalExpense = 0;
    let countIncome = 0;
    let countExpense = 0;

    const duplicateCheck = new Map();

    snapshot.forEach(doc => {
        const d = doc.data();
        const amt = d.amount || 0;

        // Key for duplicate check: Date + Amount + Desc
        const key = `${d.date.seconds}_${d.amount}_${d.description}`;
        if (duplicateCheck.has(key)) {
            // console.log("Duplicate found?", key);
        }
        duplicateCheck.set(key, true);

        if (d.type === 'income') {
            totalIncome += amt;
            countIncome++;
        } else {
            totalExpense += amt;
            countExpense++;
        }
    });

    console.log("\n📊 FIRESTORE AUDIT REPORT");
    console.log("-------------------------");
    console.log(`Income:   ₹${totalIncome.toLocaleString()}  (${countIncome} docs)`);
    console.log(`Expense:  ₹${totalExpense.toLocaleString()}  (${countExpense} docs)`);
    console.log(`Net:      ₹${(totalIncome - totalExpense).toLocaleString()}`);
    console.log("-------------------------");
    console.log("Target Income:  ₹65,967.95");
    console.log("Target Expense: ₹96,822.00");
}

run();

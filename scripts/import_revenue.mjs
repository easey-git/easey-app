import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function parseAmount(amountStr) {
    if (!amountStr) return 0;
    const cleanStr = amountStr.replace(/[₹,\s"]/g, '');
    return parseFloat(cleanStr) || 0;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        date.setHours(0, 0, 0, 0);
        return date;
    }
    return null;
}

async function run() {
    const filePath = join(__dirname, 'balance-sheet - revenue.csv');
    if (!existsSync(filePath)) {
        console.error("❌ File not found: balance-sheet - revenue.csv");
        return;
    }

    const content = readFileSync(filePath, 'utf8');

    // Revenue CSV - Strictly NO HEADER based on file analysis
    const records = parse(content, {
        columns: false,
        skip_empty_lines: true,
        from_line: 1 // Force read from line 1
    });

    const transactions = [];

    records.forEach(row => {
        // Revenue Format: Col 0 (Date), Col 1 (Desc), Col 2 (Amount)
        const dateObj = parseDate(row[0]);
        if (!dateObj) return;

        const amt = parseAmount(row[2]);
        if (amt > 0 && row[1]) {
            transactions.push({
                amount: amt,
                description: row[1],
                category: 'Income',
                type: 'income',
                date: dateObj
            });
        }
    });

    // Verification
    const total = transactions.reduce((acc, t) => acc + t.amount, 0);
    console.log(`\n📄 Revenue Script Report`);
    console.log(`-----------------------`);
    console.log(`Transactions: ${transactions.length}`);
    console.log(`Total Value:  ₹${total.toLocaleString('en-IN')}`);
    console.log(`Target Value: ₹65,967.95`);

    // Allow slight float mismatch (0.01)
    if (Math.abs(total - 65967.95) > 1) {
        console.warn(`\n⚠️ Mismatch detected! Script found ₹${total}, expected ₹65,967.95.`);
        console.log("Check CSV format or columns.");
        return;
    } else {
        console.log(`\n✅ Tally MATCHES! Ready to write.`);
    }

    if (process.argv.includes('--dry-run')) {
        console.log("Dry run mode. Exiting.");
        return;
    }

    console.log("Writing to Firestore...");
    const CHUNK_SIZE = 400;
    for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        transactions.slice(i, i + CHUNK_SIZE).forEach(tx => {
            batch.set(doc(collection(db, 'wallet_transactions')), {
                ...tx,
                date: Timestamp.fromDate(tx.date),
                createdAt: serverTimestamp()
            });
        });
        await batch.commit();
        console.log(`Written batch ${i / CHUNK_SIZE + 1}`);
    }
    console.log("Done.");
}

run();

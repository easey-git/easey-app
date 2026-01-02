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
    const filePath = join(__dirname, 'balance-sheet - spends.csv');
    if (!existsSync(filePath)) {
        console.error("❌ File not found: balance-sheet - spends.csv");
        return;
    }

    const content = readFileSync(filePath, 'utf8');

    // Header Detection (Spends CSV has header "Date,Platform...")
    const headerCheck = content.split('\n')[0];
    const hasHeader = isNaN(parseInt(headerCheck.trim().charAt(0)));

    const records = parse(content, {
        columns: false,
        skip_empty_lines: true,
        from_line: hasHeader ? 2 : 1
    });

    const transactions = [];

    records.forEach(row => {
        // Spends Format: Col 0 (Date), Col 1 (Desc), Col 2 (Amount)
        const dateObj = parseDate(row[0]);
        if (!dateObj) return;

        const amt = parseAmount(row[2]);
        if (amt > 0 && row[1]) {
            transactions.push({
                amount: amt,
                description: row[1],
                category: 'Business',
                type: 'expense',
                date: dateObj
            });
        }
    });

    // Verification
    const total = transactions.reduce((acc, t) => acc + t.amount, 0);
    console.log(`\n📄 Spends Script Report`);
    console.log(`-----------------------`);
    console.log(`Transactions: ${transactions.length}`);
    console.log(`Total Value:  ₹${total.toLocaleString('en-IN')}`);
    console.log(`Target Value: ₹96,822`);

    // Allow slight mismatch due to rounding (±2)
    if (Math.abs(total - 96822) > 2) {
        console.warn(`\n⚠️ Mismatch detected! Script found ₹${total}, expected ₹96,822.`);
        console.log("Check CSV format or columns.");
        return;
    } else {
        console.log(`\n✅ Tally MATCHES (within rounding tolerance)! Ready to write.`);
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

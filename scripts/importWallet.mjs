import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration from src/config/firebase.js
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

// Helper to parse currency string "₹1,000" -> 1000
function parseAmount(amountStr) {
    if (!amountStr) return 0;
    // Remove "₹", ",", and spaces. Handle negative?
    const cleanStr = amountStr.replace(/[₹,\s"]/g, '');
    return parseFloat(cleanStr) || 0;
}

// Helper to parse date "03/11/2025" (DD/MM/YYYY) -> Date object
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        // new Date(Year, MonthIndex, Day)
        const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        date.setHours(0, 0, 0, 0); // User requested 00:00:00
        return date;
    }
    return null;
}

async function run() {
    const spendsPath = join(__dirname, 'balance-sheet - spends.csv');
    const potentialRevenuePaths = [
        join(__dirname, 'balance-sheet - revenue.csv'),
        join(__dirname, 'revenue.csv'),
    ];

    let revenuePath = null;
    for (const p of potentialRevenuePaths) {
        if (existsSync(p)) {
            revenuePath = p;
            break;
        }
    }

    const allTransactions = [];

    const processFile = (filePath, type) => {
        if (!filePath || !existsSync(filePath)) {
            return;
        }

        console.log(`Processing ${basename(filePath)} as ${type}...`);
        const content = readFileSync(filePath, 'utf8');

        // Parse CSV
        const headerCheck = content.split('\n')[0];
        // If first char is a number (e.g. "2"), it's data -> start line 1.
        // If it's "D" (Date), it's header -> start line 2.
        const firstChar = headerCheck.trim().charAt(0);
        const hasHeader = isNaN(parseInt(firstChar));

        console.log(`Processing ${basename(filePath)} as ${type}... (Header: ${hasHeader})`);

        const records = parse(content, {
            columns: false,
            skip_empty_lines: true,
            from_line: hasHeader ? 2 : 1
        });

        records.forEach(row => {
            // User Specification: Date (A), Desc (B), Amount (C)
            const dateStr = row[0];
            const desc = row[1];
            const amountStr = row[2];

            const dateObj = parseDate(dateStr);
            if (!dateObj) return;

            const amt = parseAmount(amountStr);

            if (amt > 0 && desc) {
                allTransactions.push({
                    amount: amt,
                    description: desc,
                    category: type === 'expense' ? 'Business' : 'Income',
                    type: type,
                    date: dateObj
                });
            }
        });
    };

    processFile(potentialRevenuePaths.find(p => existsSync(p)), 'income');
    // processFile(spendsPath, 'expense'); // Disable Spends to avoid re-importing duplicates if user didn't clear


    // --- DEBUGGING START ---
    const totalAmount = allTransactions.reduce((acc, tx) => acc + tx.amount, 0);
    console.log(`\n================================`);
    console.log(`🔎 AUDIT REPORT`);
    console.log(`================================`);
    console.log(`Total Transactions Parsed: ${allTransactions.length}`);
    console.log(`Total Calculated Value:    ₹${totalAmount.toLocaleString('en-IN')}`);
    console.log(`Expected Sheet Value:      ~₹96,822`);
    console.log(`Discrepancy:               ₹${(96822 - totalAmount).toLocaleString('en-IN')}`);
    console.log(`--------------------------------`);

    console.log("Checking Top 10 Largest Transactions:");
    const sorted = [...allTransactions].sort((a, b) => b.amount - a.amount);
    sorted.slice(0, 10).forEach((t, i) => {
        console.log(` ${i + 1}. [${t.date.toLocaleDateString()}] ₹${t.amount.toLocaleString()} - ${t.description}`);
    });

    // Check for potential duplicate logic / double counting vs single counting
    const duplicates = allTransactions.filter((tx, i) =>
        allTransactions.findIndex(t => t.date.getTime() === tx.date.getTime() && t.amount === tx.amount && t.description === tx.description) !== i
    );
    console.log(`\nPotential duplicates found in parsing (parsed same row twice?): ${duplicates.length}`);
    if (duplicates.length > 0) {
        console.log("Sample Duplicate:", duplicates[0]);
    }

    console.log(`================================\n`);

    if (process.argv.includes('--dry-run')) {
        return;
    }
    // --- DEBUGGING END ---

    console.log(`Parsed ${allTransactions.length} total transactions. Writing to Firestore...`);

    // Write to Firestore in batches
    if (allTransactions.length === 0) {
        console.log("No transactions to write.");
        return;
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < allTransactions.length; i += CHUNK_SIZE) {
        const chunk = allTransactions.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(tx => {
            const docRef = doc(collection(db, 'wallet_transactions'));
            batch.set(docRef, {
                ...tx,
                date: Timestamp.fromDate(tx.date),
                createdAt: serverTimestamp()
            });
        });

        try {
            await batch.commit();
            console.log(`✅ Committed batch ${i / CHUNK_SIZE + 1} (${chunk.length} items)`);
        } catch (error) {
            console.error("❌ Error writing batch:", error.message);
            process.exit(1);
        }
    }
    console.log("Import process complete.");
}

run().catch(console.error);

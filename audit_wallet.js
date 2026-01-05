const admin = require('firebase-admin');

// Initialize Firebase Admin (attempts to use Application Default Credentials)
try {
    admin.initializeApp({
        projectId: 'easey-db'
    });
} catch (e) {
    if (!admin.apps.length) {
        console.error("Failed to initialize admin:", e);
        process.exit(1);
    }
}

const db = admin.firestore();

const expected = [
    { date: '2025-12-04', amount: 599 },
    { date: '2025-12-06', amount: 1198 },
    { date: '2025-12-09', amount: 2995 },
    { date: '2025-12-10', amount: 4892 },
    { date: '2025-12-11', amount: 2995 },
    { date: '2025-12-12', amount: 599 },
    { date: '2025-12-13', amount: 599 },
    { date: '2025-12-15', amount: 2596 },
    { date: '2025-12-16', amount: 3195 },
    { date: '2025-12-17', amount: 3245 },
    { date: '2025-12-18', amount: 1298 },
    { date: '2025-12-19', amount: 1298 },
    { date: '2025-12-22', amount: 2696 },
    { date: '2025-12-23', amount: 5392 },
    { date: '2025-12-24', amount: 649 },
    { date: '2025-12-25', amount: 2097 },
    { date: '2025-12-26', amount: 2097 },
    { date: '2025-12-27', amount: 2796 },
    { date: '2025-12-29', amount: 3495 },
    { date: '2025-12-30', amount: 1448 },
    { date: '2025-12-31', amount: 1398 },
    { date: '2026-01-02', amount: 699 },
    { date: '2026-01-03', amount: 699 }
];

async function runAudit() {
    console.log("Starting Audit for DEL Incomes...");

    try {
        const snapshot = await db.collection('wallet_transactions')
            .where('type', '==', 'income')
            .where('description', 'in', ['DEL', 'Delhivery']) // Check both variations
            .get();

        const found = [];
        let dbTotal = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const dateObj = data.date.toDate();
            // Format to YYYY-MM-DD
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const amount = parseFloat(data.amount);
            dbTotal += amount;

            found.push({
                id: doc.id,
                date: dateStr,
                amount: amount,
                used: false
            });
        });

        console.log(`\nDB Total for DEL: ₹${dbTotal}`);
        const expectedTotal = expected.reduce((acc, curr) => acc + curr.amount, 0);
        console.log(`Expected Total:   ₹${expectedTotal}`);
        console.log(`Difference:       ₹${expectedTotal - dbTotal}`);

        console.log("\n--- Missing Transactions ---");

        const missing = [];

        expected.forEach(exp => {
            // Find a match in found list
            // We look for same amount and same date (allowing small mismatch if needed, but strict here first)

            // Note: DB dates might be in UTC or Local, causing off-by-one day. 
            // We'll try to find exact date match first, then +/- 1 day if not found.

            let matchIndex = found.findIndex(f =>
                !f.used &&
                f.amount === exp.amount &&
                f.date === exp.date
            );

            if (matchIndex === -1) {
                // Try loose date matching (+/- 1 day) just in case of timezone issues
                matchIndex = found.findIndex(f => {
                    if (f.used || f.amount !== exp.amount) return false;
                    const fDate = new Date(f.date);
                    const eDate = new Date(exp.date);
                    const diffTime = Math.abs(fDate - eDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays <= 1;
                });
            }

            if (matchIndex !== -1) {
                found[matchIndex].used = true;
            } else {
                missing.push(exp);
                console.log(`[MISSING] Date: ${exp.date}, Amount: ₹${exp.amount}`);
            }
        });

        if (missing.length === 0) {
            console.log("No missing transactions found based on the provided list!");

            // If totals mismatch but no missing items, check for duplicates in DB or extra items
            const extraInDb = found.filter(f => !f.used);
            if (extraInDb.length > 0) {
                console.log("\n--- Extra Transactions in DB (Not in your list) ---");
                extraInDb.forEach(e => console.log(`[EXTRA] ID: ${e.id}, Date: ${e.date}, Amount: ₹${e.amount}`));
            }
        }

    } catch (error) {
        console.error("Error during audit:", error);
    }
}

runAudit();

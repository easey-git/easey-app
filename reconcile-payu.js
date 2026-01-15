// PayU transactions from your dashboard (excluding refunded ones)
const payuTransactions = [
    { date: '14 Jan\'26 07:19:01 PM', id: '26852865700', email: '8787895711@fastrr.com', amount: 599 },
    { date: '13 Jan\'26 05:41:29 PM', id: '26837877926', email: 'gincyalexk@gmail.com', amount: 599 },
    { date: '8 Jan\'26 10:09:06 PM', id: '26771551887', email: 'ananya06.nayak@gmail.com', amount: 599 },
    { date: '7 Jan\'26 10:32:58 PM', id: '26757385770', email: '7264868041@fastrr.com', amount: 599 },
    { date: '6 Jan\'26 07:12:23 PM', id: '26739750424', email: '9163469869@fastrr.com', amount: 699 },
    { date: '4 Jan\'26 06:04:42 PM', id: '26710195587', email: 'draparnaavinash@gmail.com', amount: 699 },
    { date: '4 Jan\'26 03:03:39 PM', id: '26707667402', email: 'neetusingh193y@gmail.com', amount: 599 },
    { date: '1 Jan\'26 08:46:12 PM', id: '26667804285', email: 'rishabhgarmentshub@gmail.com', amount: 649 },
    { date: '30 Dec\'25 08:47:33 PM', id: '26636861229', email: '7063943972@fastrr.com', amount: 599 },
    { date: '30 Dec\'25 04:47:13 PM', id: '26633091972', email: 'cheenukathuria22@gmail.com', amount: 599 },
    { date: '17 Dec\'25 05:47:04 PM', id: '26459654174', email: '9004716932@fastrr.com', amount: 1 },
    { date: '17 Dec\'25 02:57:07 PM', id: '26457606265', email: '9004716932@fastrr.com', amount: 1 },
    { date: '15 Dec\'25 12:45:52 PM', id: '26429276537', email: '9511852434@fastrr.com', amount: 649 },
    { date: '12 Dec\'25 10:45:06 PM', id: '26397558911', email: 'palsweta0005@gmail.com', amount: 599 },
    { date: '11 Dec\'25 06:12:50 PM', id: '26379561247', email: 'ektasaxena166@gmail.com', amount: 599 },
    { date: '11 Dec\'25 11:39:12 AM', id: '26374300442', email: '7738943259@fastrr.com', amount: 599 },
    { date: '10 Dec\'25 03:32:38 PM', id: '26363434883', email: 'sodelphina07@gmail.com', amount: 599 },
    { date: '7 Dec\'25 03:08:50 PM', id: '26321931860', email: 'vidyajethwani44@gmail.com', amount: 649 },
    { date: '7 Dec\'25 12:10:15 PM', id: '26319373922', email: '7306211669@fastrr.com', amount: 649 },
    { date: '4 Dec\'25 04:49:19 PM', id: '26282078787', email: 'arpana.ravi396@gmail.com', amount: 599 },
    { date: '4 Dec\'25 12:47:19 PM', id: '26279071150', email: 'harsha.saroj3631@gmail.com', amount: 649 },
    { date: '4 Dec\'25 12:11:23 PM', id: '26278609146', email: 'salonikolmbekar82@gmail.com', amount: 649 },
    { date: '3 Dec\'25 03:07:59 PM', id: '26266769529', email: 'neetdadhich08@gmail.com', amount: 569 },
    { date: '2 Dec\'25 11:20:28 PM', id: '26259611846', email: 'rajni22mahajan@gmail.com', amount: 569 },
    { date: '2 Dec\'25 06:49:48 PM', id: '26255852467', email: 'ritusaroha515@gmail.com', amount: 569 },
    { date: '30 Nov\'25 12:58:05 AM', id: '26218862032', email: 'palandeusha@gmail.com', amount: 569 },
    { date: '26 Nov\'25 11:26:42 PM', id: '26178271493', email: '9867034655@fastrr.com', amount: 599 },
    { date: '24 Nov\'25 08:10:38 PM', id: '26150628087', email: '9840168607@fastrr.com', amount: 599 },
    { date: '23 Nov\'25 09:20:56 PM', id: '26139178151', email: '9528845126@fastrr.com', amount: 399 },
    { date: '8 Nov\'25 01:17:52 PM', id: '25935285418', email: '9653431015@fastrr.com', amount: 1 },
];

// Firebase PayU entries (from the output)
const firebaseEntries = [
    { amount: 1198, date: '12/12/2025' },
    { amount: 569, date: '12/4/2025' },
    { amount: 699, date: '1/7/2026' },
    { amount: 2, date: '12/18/2025' },
    { amount: 649, date: '1/2/2026' },
    { amount: 599, date: '1/9/2026' },
    { amount: 1298, date: '12/8/2025' },
    { amount: 599, date: '1/8/2026' },
    { amount: 1298, date: '1/5/2026' },
    { amount: 599, date: '12/15/2025' },
    { amount: 569, date: '12/1/2025' },
    { amount: 399.95, date: '11/24/2025' },
    { amount: 599, date: '11/25/2025' },
    { amount: 1897, date: '12/5/2025' },
    { amount: 1138, date: '12/3/2025' },
    { amount: 599, date: '11/27/2025' },
    { amount: 1198, date: '12/31/2025' },
    { amount: 599, date: '1/14/2026' },
    { amount: 649, date: '12/16/2025' },
];

console.log('═'.repeat(100));
console.log('🔍 COMPLETE RECONCILIATION ANALYSIS');
console.log('═'.repeat(100));

// Calculate totals
const payuTotal = payuTransactions.reduce((sum, tx) => sum + tx.amount, 0);
const firebaseTotal = firebaseEntries.reduce((sum, entry) => sum + entry.amount, 0);

console.log('\n📊 TOTALS:');
console.log(`PayU Dashboard: ₹${payuTotal.toLocaleString()}`);
console.log(`Firebase Total: ₹${firebaseTotal.toLocaleString()}`);
console.log(`Difference: ₹${(payuTotal - firebaseTotal).toFixed(2)}`);

// Group PayU by amount
const payuByAmount = {};
payuTransactions.forEach(tx => {
    if (!payuByAmount[tx.amount]) payuByAmount[tx.amount] = [];
    payuByAmount[tx.amount].push(tx);
});

console.log('\n═'.repeat(100));
console.log('📋 PayU BREAKDOWN BY AMOUNT:');
console.log('═'.repeat(100));

const amounts = Object.keys(payuByAmount).map(Number).sort((a, b) => b - a);
let payuBreakdownTotal = 0;

amounts.forEach(amount => {
    const count = payuByAmount[amount].length;
    const subtotal = amount * count;
    payuBreakdownTotal += subtotal;
    console.log(`₹${amount.toString().padEnd(4)} × ${count.toString().padStart(2)} = ₹${subtotal.toString().padStart(6)}`);
});

console.log('─'.repeat(100));
console.log(`TOTAL:        ₹${payuBreakdownTotal.toString().padStart(6)}`);

// Now let's try to match Firebase entries to PayU transactions
console.log('\n═'.repeat(100));
console.log('🔎 MATCHING FIREBASE ENTRIES TO PAYU TRANSACTIONS:');
console.log('═'.repeat(100));

const usedPayuTransactions = new Set();
const matchedEntries = [];
const unmatchedEntries = [];

firebaseEntries.forEach(fbEntry => {
    let matched = false;

    // Try exact single match first
    for (let i = 0; i < payuTransactions.length; i++) {
        if (!usedPayuTransactions.has(i) && payuTransactions[i].amount === fbEntry.amount) {
            matchedEntries.push({
                firebase: fbEntry,
                payu: [payuTransactions[i]],
                type: 'exact'
            });
            usedPayuTransactions.add(i);
            matched = true;
            break;
        }
    }

    if (!matched) {
        unmatchedEntries.push(fbEntry);
    }
});

console.log(`\n✅ Exact Matches: ${matchedEntries.length}`);
matchedEntries.forEach((match, idx) => {
    console.log(`${idx + 1}. Firebase ₹${match.firebase.amount} (${match.firebase.date}) = PayU ₹${match.payu[0].amount} (${match.payu[0].date})`);
});

console.log(`\n❓ Unmatched Firebase Entries (likely grouped): ${unmatchedEntries.length}`);
unmatchedEntries.forEach((entry, idx) => {
    console.log(`${idx + 1}. ₹${entry.amount} on ${entry.date}`);
});

// Calculate what's accounted for
const matchedTotal = matchedEntries.reduce((sum, m) => sum + m.firebase.amount, 0);
const unmatchedFirebaseTotal = unmatchedEntries.reduce((sum, e) => sum + e.amount, 0);

console.log('\n═'.repeat(100));
console.log('💰 ACCOUNTING:');
console.log('═'.repeat(100));
console.log(`Exact matches total: ₹${matchedTotal.toFixed(2)}`);
console.log(`Grouped entries total: ₹${unmatchedFirebaseTotal.toFixed(2)}`);
console.log(`Firebase total: ₹${firebaseTotal.toFixed(2)}`);

// Find unused PayU transactions
const unusedPayu = payuTransactions.filter((_, idx) => !usedPayuTransactions.has(idx));
const unusedPayuTotal = unusedPayu.reduce((sum, tx) => sum + tx.amount, 0);

console.log(`\nPayU transactions not in exact matches: ${unusedPayu.length}`);
console.log(`Their total: ₹${unusedPayuTotal.toLocaleString()}`);

console.log('\n═'.repeat(100));
console.log('🔍 DETAILED ANALYSIS OF GROUPED ENTRIES:');
console.log('═'.repeat(100));

// Analyze the 399.95 discrepancy
console.log('\n⚠️  FOUND ISSUE: Firebase has ₹399.95 but PayU has ₹399');
console.log('This ₹0.95 difference might be a fee or adjustment.');

// Check if all amounts add up
console.log('\n═'.repeat(100));
console.log('📊 FINAL RECONCILIATION:');
console.log('═'.repeat(100));

console.log('\nPayU Dashboard (30 transactions):');
console.log(`  Total: ₹${payuTotal.toLocaleString()}`);

console.log('\nFirebase (19 entries):');
console.log(`  Total: ₹${firebaseTotal.toFixed(2)}`);
console.log(`  Note: Entry #12 is ₹399.95 instead of ₹399 (+₹0.95)`);

const adjustedFirebaseTotal = firebaseTotal - 0.95;
console.log(`\nAdjusted Firebase Total (removing ₹0.95): ₹${adjustedFirebaseTotal.toFixed(2)}`);
console.log(`\n❌ MISSING AMOUNT: ₹${(payuTotal - adjustedFirebaseTotal).toFixed(2)}`);

// Try to find which transactions are missing
console.log('\n═'.repeat(100));
console.log('🔎 FINDING MISSING TRANSACTIONS:');
console.log('═'.repeat(100));

// The difference should be explainable by missing transactions
const difference = payuTotal - adjustedFirebaseTotal;
console.log(`\nWe need to find ₹${difference.toFixed(2)} in missing transactions`);

// Check if it's a specific transaction
const possibleMissing = payuTransactions.filter(tx =>
    Math.abs(tx.amount - difference) < 1 ||
    Math.abs(tx.amount - (difference / 2)) < 1
);

if (possibleMissing.length > 0) {
    console.log('\n💡 Possible missing transaction(s):');
    possibleMissing.forEach(tx => {
        console.log(`  - ₹${tx.amount} on ${tx.date} (ID: ${tx.id})`);
    });
}

// Check for double transactions
const doubleDiff = difference / 2;
const possibleDouble = payuTransactions.filter(tx => Math.abs(tx.amount - doubleDiff) < 1);
if (possibleDouble.length > 0) {
    console.log(`\n💡 Or it could be TWO transactions of ₹${doubleDiff.toFixed(2)} each:`);
    possibleDouble.forEach(tx => {
        console.log(`  - ₹${tx.amount} on ${tx.date} (ID: ${tx.id})`);
    });
}

console.log('\n═'.repeat(100));

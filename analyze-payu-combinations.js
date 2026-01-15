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

console.log('🔍 ANALYZING FIREBASE ENTRIES TO FIND MATCHING COMBINATIONS\n');
console.log('═'.repeat(100));

// Group PayU transactions by amount
const byAmount = {};
payuTransactions.forEach(tx => {
    if (!byAmount[tx.amount]) byAmount[tx.amount] = [];
    byAmount[tx.amount].push(tx);
});

console.log('📊 PayU Transactions by Amount:');
console.log('─'.repeat(100));
for (const [amount, txs] of Object.entries(byAmount)) {
    console.log(`₹${amount}: ${txs.length} transactions`);
    txs.forEach(tx => console.log(`  - ${tx.date} | ${tx.id} | ${tx.email}`));
}

console.log('\n═'.repeat(100));
console.log('🔎 MATCHING FIREBASE ENTRIES TO PAYU COMBINATIONS:\n');

firebaseEntries.forEach((fbEntry, index) => {
    console.log(`${index + 1}. Firebase Entry: ₹${fbEntry.amount} on ${fbEntry.date}`);

    // Try to find combinations that match this amount
    const matches = [];

    // Single transaction match
    const singleMatch = payuTransactions.find(tx => tx.amount === fbEntry.amount);
    if (singleMatch) {
        matches.push({
            type: 'Single',
            transactions: [singleMatch],
            total: fbEntry.amount
        });
    }

    // Two transaction combinations
    for (let i = 0; i < payuTransactions.length; i++) {
        for (let j = i + 1; j < payuTransactions.length; j++) {
            if (payuTransactions[i].amount + payuTransactions[j].amount === fbEntry.amount) {
                matches.push({
                    type: 'Double',
                    transactions: [payuTransactions[i], payuTransactions[j]],
                    total: fbEntry.amount
                });
            }
        }
    }

    // Three transaction combinations
    for (let i = 0; i < payuTransactions.length; i++) {
        for (let j = i + 1; j < payuTransactions.length; j++) {
            for (let k = j + 1; k < payuTransactions.length; k++) {
                if (payuTransactions[i].amount + payuTransactions[j].amount + payuTransactions[k].amount === fbEntry.amount) {
                    matches.push({
                        type: 'Triple',
                        transactions: [payuTransactions[i], payuTransactions[j], payuTransactions[k]],
                        total: fbEntry.amount
                    });
                }
            }
        }
    }

    if (matches.length > 0) {
        console.log(`   ✅ Possible matches found:`);
        matches.slice(0, 3).forEach((match, idx) => {
            console.log(`   ${idx + 1}. ${match.type} combination:`);
            match.transactions.forEach(tx => {
                console.log(`      - ₹${tx.amount} | ${tx.date} | ID: ${tx.id}`);
            });
        });
        if (matches.length > 3) {
            console.log(`   ... and ${matches.length - 3} more possible combinations`);
        }
    } else {
        console.log(`   ❌ No exact match found (might include fees/adjustments)`);
    }
    console.log('─'.repeat(100));
});

// Specific check for 649 amounts
console.log('\n═'.repeat(100));
console.log('💰 SPECIFIC CHECK: All ₹649 Transactions\n');

const tx649 = payuTransactions.filter(tx => tx.amount === 649);
console.log(`Found ${tx649.length} transactions of ₹649:\n`);
tx649.forEach((tx, idx) => {
    console.log(`${idx + 1}. Date: ${tx.date}`);
    console.log(`   PayU ID: ${tx.id}`);
    console.log(`   Email: ${tx.email}`);
    console.log('');
});

// Check which 649 entries are in Firebase
const fb649 = firebaseEntries.filter(e => e.amount === 649);
console.log(`Firebase has ${fb649.length} entry/entries of ₹649:`);
fb649.forEach(e => console.log(`  - ₹${e.amount} on ${e.date}`));

// Check for 1298 (2 × 649)
const fb1298 = firebaseEntries.filter(e => e.amount === 1298);
console.log(`\nFirebase has ${fb1298.length} entry/entries of ₹1,298 (2 × ₹649):`);
fb1298.forEach(e => console.log(`  - ₹${e.amount} on ${e.date}`));

console.log('\n═'.repeat(100));
console.log('📋 SUMMARY:\n');
console.log(`Total ₹649 transactions in PayU: ${tx649.length}`);
console.log(`Single ₹649 entries in Firebase: ${fb649.length}`);
console.log(`Double ₹649 entries (₹1,298) in Firebase: ${fb1298.length}`);
console.log(`\nAccounted for: ${fb649.length + (fb1298.length * 2)} out of ${tx649.length} transactions`);

if (fb649.length + (fb1298.length * 2) < tx649.length) {
    console.log(`\n⚠️  Missing: ${tx649.length - fb649.length - (fb1298.length * 2)} transaction(s) of ₹649`);
}

console.log('═'.repeat(100));

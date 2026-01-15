const { execSync } = require('child_process');
const axios = require('axios');

// PayU transactions from your dashboard
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

async function checkPayUTransactions() {
    try {
        console.log('🔐 Getting access token from gcloud...\n');

        // Get access token from gcloud
        const token = execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();

        console.log('✅ Access token obtained\n');
        console.log('🔍 Fetching wallet transactions from Firestore...\n');

        // Fetch all wallet transactions using Firestore REST API
        let allDocuments = [];
        let pageToken = null;
        let pageCount = 0;

        do {
            pageCount++;
            let url = `https://firestore.googleapis.com/v1/projects/easey-db/databases/(default)/documents/wallet_transactions?pageSize=300`;

            if (pageToken) {
                url += `&pageToken=${pageToken}`;
            }

            console.log(`📄 Fetching page ${pageCount}...`);

            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data.documents) {
                allDocuments = allDocuments.concat(response.data.documents);
                console.log(`   Found ${response.data.documents.length} documents on this page`);
            }

            pageToken = response.data.nextPageToken;

        } while (pageToken);

        console.log(`\n📊 Total transactions in Firebase: ${allDocuments.length}\n`);

        // Parse Firestore documents
        const parseFirestoreValue = (value) => {
            if (value.stringValue !== undefined) return value.stringValue;
            if (value.integerValue !== undefined) return parseInt(value.integerValue);
            if (value.doubleValue !== undefined) return parseFloat(value.doubleValue);
            if (value.booleanValue !== undefined) return value.booleanValue;
            if (value.timestampValue !== undefined) return new Date(value.timestampValue);
            return null;
        };

        const transactions = allDocuments.map(doc => {
            const fields = doc.fields || {};
            const parsed = {};

            for (const [key, value] of Object.entries(fields)) {
                parsed[key] = parseFirestoreValue(value);
            }

            return {
                id: doc.name.split('/').pop(),
                ...parsed
            };
        });

        // Filter for PayU transactions
        const firebasePayUTransactions = transactions.filter(tx => {
            const desc = (tx.description || '').toLowerCase();
            const cat = (tx.category || '').toLowerCase();

            return desc.includes('payu') ||
                desc.includes('payment gateway') ||
                cat.includes('payu') ||
                cat === 'payment gateway';
        });

        console.log(`💳 PayU-related transactions in Firebase: ${firebasePayUTransactions.length}\n`);

        // Display Firebase PayU transactions
        if (firebasePayUTransactions.length > 0) {
            console.log('Firebase PayU Transactions:');
            console.log('═'.repeat(100));
            firebasePayUTransactions.forEach(tx => {
                console.log(`Date: ${tx.date ? new Date(tx.date).toLocaleString() : 'N/A'}`);
                console.log(`Amount: ₹${tx.amount} | Type: ${tx.type} | Category: ${tx.category}`);
                console.log(`Description: ${tx.description}`);
                console.log('─'.repeat(100));
            });
        }

        // Calculate totals
        const payuTotal = payuTransactions.reduce((sum, tx) => sum + tx.amount, 0);
        const firebaseTotal = firebasePayUTransactions
            .filter(tx => tx.type === 'income')
            .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

        console.log('\n📈 SUMMARY:');
        console.log('═'.repeat(100));
        console.log(`PayU Dashboard Total (30 successful transactions): ₹${payuTotal.toLocaleString()}`);
        console.log(`Firebase PayU Income Total: ₹${firebaseTotal.toLocaleString()}`);
        console.log(`Difference: ₹${Math.abs(payuTotal - firebaseTotal).toLocaleString()}`);
        console.log('═'.repeat(100));

        // Check for missing transactions by PayU ID
        console.log('\n🔎 Checking for missing PayU IDs in Firebase...\n');

        const missingTransactions = [];

        payuTransactions.forEach(payuTx => {
            const found = firebasePayUTransactions.some(fbTx =>
                fbTx.description && fbTx.description.includes(payuTx.id)
            );

            if (!found) {
                missingTransactions.push(payuTx);
            }
        });

        if (missingTransactions.length > 0) {
            console.log(`⚠️  MISSING TRANSACTIONS: ${missingTransactions.length}`);
            console.log('═'.repeat(100));
            missingTransactions.forEach(tx => {
                console.log(`Date: ${tx.date}`);
                console.log(`PayU ID: ${tx.id}`);
                console.log(`Email: ${tx.email}`);
                console.log(`Amount: ₹${tx.amount}`);
                console.log('─'.repeat(100));
            });

            console.log(`\n💰 Total missing amount: ₹${missingTransactions.reduce((sum, tx) => sum + tx.amount, 0).toLocaleString()}`);
        } else {
            console.log('✅ All PayU transactions found in Firebase!');
        }

        // Get wallet stats
        console.log('\n📊 Fetching wallet stats...\n');

        const statsUrl = `https://firestore.googleapis.com/v1/projects/easey-db/databases/(default)/documents/wallet_stats/global`;
        const statsResponse = await axios.get(statsUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (statsResponse.data.fields) {
            const stats = {};
            for (const [key, value] of Object.entries(statsResponse.data.fields)) {
                stats[key] = parseFirestoreValue(value);
            }

            console.log('💰 WALLET STATS:');
            console.log('═'.repeat(100));
            console.log(`Total Income: ₹${(stats.income || 0).toLocaleString()}`);
            console.log(`Total Expense: ₹${(stats.expense || 0).toLocaleString()}`);
            console.log(`Balance: ₹${(stats.balance || 0).toLocaleString()}`);
            console.log('═'.repeat(100));

            // Check if descriptionBreakdown exists
            if (statsResponse.data.fields.descriptionBreakdown) {
                console.log('\n📋 Income Breakdown by Description:');
                console.log('─'.repeat(100));

                const descBreakdown = statsResponse.data.fields.descriptionBreakdown.mapValue.fields.income.mapValue.fields;

                for (const [desc, amountValue] of Object.entries(descBreakdown)) {
                    const amount = parseFirestoreValue(amountValue);
                    console.log(`  ${desc}: ₹${amount.toLocaleString()}`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

checkPayUTransactions();

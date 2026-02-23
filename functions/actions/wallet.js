const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../config");

/**
 * Generate keywords for prefix search
 */
function generateKeywords(description = '', category = '', amount = '') {
    const text = `${description} ${category} ${amount}`.toLowerCase();
    const words = text.split(/\s+/);
    const keywords = new Set();
    words.forEach(w => { if (w.length > 0) keywords.add(w); });

    // Prefix search for description
    const descWords = (description || '').toLowerCase().split(/\s+/);
    descWords.forEach(w => {
        let current = '';
        for (let i = 0; i < w.length; i++) {
            current += w[i];
            if (current.length >= 2) keywords.add(current);
        }
    });
    return Array.from(keywords);
}

/**
 * Add a transaction and atomically update multiple stats shards
 */
exports.addTransaction = onCall(async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const { amount, description, category, type, date } = request.data;

    // 2. Validation
    if (!amount || isNaN(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Invalid amount');
    if (!description) throw new HttpsError('invalid-argument', 'Description required');
    if (!['income', 'expense'].includes(type)) throw new HttpsError('invalid-argument', 'Invalid type');

    // 3. Integer Math (Store as Paise/Cents)
    // Using Math.round to avoid any float issues from the client
    const amountInCents = Math.round(parseFloat(amount) * 100);
    const timestamp = date ? admin.firestore.Timestamp.fromDate(new Date(date)) : admin.firestore.FieldValue.serverTimestamp();
    const isoDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const monthKey = isoDate.substring(0, 7); // YYYY-MM

    try {
        await db.runTransaction(async (transaction) => {
            const statsRef = db.doc('wallet_stats/global');
            const dailyStatsRef = db.doc(`wallet_stats/daily_${isoDate}`);
            const monthlyStatsRef = db.doc(`wallet_stats/monthly_${monthKey}`);

            const keywords = generateKeywords(description, category, amount.toString());
            const newTxRef = db.collection('wallet_transactions').doc();

            // Prepare update object
            const increment = admin.firestore.FieldValue.increment;
            const statsUpdate = {};
            const histUpdate = {};

            if (type === 'income') {
                statsUpdate.balance = increment(amountInCents);
                statsUpdate.income = increment(amountInCents);
                statsUpdate[`categoryBreakdown.income.${category}`] = increment(amountInCents);

                histUpdate.income = increment(amountInCents);
                histUpdate.balance = increment(amountInCents);
            } else {
                statsUpdate.balance = increment(-amountInCents);
                statsUpdate.expense = increment(amountInCents);
                statsUpdate[`categoryBreakdown.expense.${category}`] = increment(amountInCents);

                histUpdate.expense = increment(amountInCents);
                histUpdate.balance = increment(-amountInCents);
            }

            // Write Transaction
            transaction.set(newTxRef, {
                amount: amountInCents,
                description,
                category: category || 'Misc',
                type,
                date: timestamp,
                keywords,
                createdByName: request.auth.token.name || request.auth.token.email,
                createdByUid: request.auth.uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Update Global Stats
            transaction.set(statsRef, statsUpdate, { merge: true });

            // Update History Shards (Daily/Monthly)
            transaction.set(dailyStatsRef, { ...histUpdate, date: isoDate }, { merge: true });
            transaction.set(monthlyStatsRef, { ...histUpdate, month: monthKey }, { merge: true });
        });

        return { success: true };
    } catch (error) {
        console.error("Wallet Add Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Delete a transaction and reverse its effect on all stats
 */
exports.deleteTransaction = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');

    const { transactionId } = request.data;
    if (!transactionId) throw new HttpsError('invalid-argument', 'Transaction ID required');

    try {
        await db.runTransaction(async (transaction) => {
            const txRef = db.doc(`wallet_transactions/${transactionId}`);
            const txSnap = await transaction.get(txRef);

            if (!txSnap.exists) throw new HttpsError('not-found', 'Transaction not found');

            const txData = txSnap.data();
            const amount = txData.amount;
            const type = txData.type;
            const category = txData.category;
            const txDate = txData.date.toDate();
            const isoDate = txDate.toISOString().split('T')[0];
            const monthKey = isoDate.substring(0, 7);

            const statsRef = db.doc('wallet_stats/global');
            const dailyStatsRef = db.doc(`wallet_stats/daily_${isoDate}`);
            const monthlyStatsRef = db.doc(`wallet_stats/monthly_${monthKey}`);

            const increment = admin.firestore.FieldValue.increment;
            const statsUpdate = {};
            const histUpdate = {};

            if (type === 'income') {
                statsUpdate.balance = increment(-amount);
                statsUpdate.income = increment(-amount);
                statsUpdate[`categoryBreakdown.income.${category}`] = increment(-amount);

                histUpdate.income = increment(-amount);
                histUpdate.balance = increment(-amount);
            } else {
                statsUpdate.balance = increment(amount);
                statsUpdate.expense = increment(-amount);
                statsUpdate[`categoryBreakdown.expense.${category}`] = increment(-amount);

                histUpdate.expense = increment(-amount);
                histUpdate.balance = increment(amount);
            }

            transaction.delete(txRef);
            transaction.set(statsRef, statsUpdate, { merge: true });
            transaction.set(dailyStatsRef, histUpdate, { merge: true });
            transaction.set(monthlyStatsRef, histUpdate, { merge: true });
        });

        return { success: true };
    } catch (error) {
        console.error("Wallet Delete Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

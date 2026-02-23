import { collection, doc, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { ActivityLogService } from './activityLogService';

const TRANSACTION_COLLECTION = 'wallet_transactions';

export const WalletService = {

    /**
     * Add a transaction via Cloud Function
     */
    addTransaction: async (transactionData, userId, userEmail) => {
        try {
            const addTx = httpsCallable(functions, 'addTransaction');
            const result = await addTx(transactionData);

            // Log local activity if desired
            if (userId) {
                ActivityLogService.log(
                    userId,
                    userEmail,
                    'ADD_TRANSACTION',
                    `Added ${transactionData.type} of ${transactionData.amount}`,
                    { ...transactionData }
                );
            }

            return result.data;
        } catch (error) {
            console.error("WalletService.addTransaction failed:", error);
            throw error;
        }
    },

    /**
     * Delete a transaction via Cloud Function
     */
    deleteTransaction: async (transactionId, userId, userEmail) => {
        try {
            const deleteTx = httpsCallable(functions, 'deleteTransaction');
            await deleteTx({ transactionId });

            if (userId) {
                ActivityLogService.log(
                    userId,
                    userEmail,
                    'DELETE_TRANSACTION',
                    `Deleted transaction ${transactionId}`
                );
            }

            return true;
        } catch (error) {
            console.error("WalletService.deleteTransaction failed:", error);
            throw error;
        }
    },

    /**
     * Heavy Operation: Scans ALL transactions and rebuilds the stats doc.
     * Scalable: Uses batching to prevent Out-Of-Memory crashes on large datasets.
     */
    recalculateAllStats: async () => {
        try {
            let newStats = {
                balance: 0,
                income: 0,
                expense: 0,
                categoryBreakdown: {
                    income: {},
                    expense: {}
                }
            };

            let lastDoc = null;
            let hasMore = true;
            const BATCH_SIZE = 500;
            let processedCount = 0;

            while (hasMore) {
                let qConstraints = [orderBy('date'), limit(BATCH_SIZE)];
                if (lastDoc) {
                    qConstraints.push(startAfter(lastDoc));
                }

                const q = query(collection(db, TRANSACTION_COLLECTION), ...qConstraints);
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }

                snapshot.forEach(doc => {
                    const data = doc.data();
                    // Handle conversion from legacy string or double if any remain
                    let amount = 0;
                    if (typeof data.amount === 'number') {
                        amount = Math.round(data.amount); // Already integer
                    } else if (typeof data.amount === 'string') {
                        amount = Math.round(parseFloat(data.amount) * 100);
                    }

                    const type = data.type;
                    const category = data.category || 'Misc';

                    if (type === 'income') {
                        newStats.income += amount;
                        newStats.balance += amount;
                        newStats.categoryBreakdown.income[category] = (newStats.categoryBreakdown.income[category] || 0) + amount;
                    } else {
                        newStats.expense += amount;
                        newStats.balance -= amount;
                        newStats.categoryBreakdown.expense[category] = (newStats.categoryBreakdown.expense[category] || 0) + amount;
                    }
                });

                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                processedCount += snapshot.size;
                if (snapshot.size < BATCH_SIZE) hasMore = false;
            }

            const statsRef = doc(db, 'wallet_stats', 'global');
            const { runTransaction } = await import('firebase/firestore');
            await runTransaction(db, async (transaction) => {
                transaction.set(statsRef, newStats);
            });
            return newStats;
        } catch (error) {
            console.error("Recalculate failed:", error);
            throw error;
        }
    },

    /**
     * MIGRATION UTILITY
     * Loops through all transactions and adds 'keywords' array for search.
     */
    migrateSearchIndex: async (onProgress) => {
        const { writeBatch } = await import('firebase/firestore');
        console.log("Starting Search Index Migration...");
        let lastDoc = null;
        let hasMore = true;
        const BATCH_SIZE = 500;
        let processedCount = 0;

        while (hasMore) {
            let qConstraints = [orderBy('date', 'desc'), limit(BATCH_SIZE)];
            if (lastDoc) {
                qConstraints.push(startAfter(lastDoc));
            }

            const q = query(collection(db, TRANSACTION_COLLECTION), ...qConstraints);
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                hasMore = false;
                break;
            }

            const batch = writeBatch(db);
            let operationsInBatch = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const displayAmount = (data.amount || 0) / 100;
                const keywords = generateKeywords(data.description, data.category, displayAmount.toString());

                batch.update(doc.ref, { keywords });
                operationsInBatch++;
            });

            if (operationsInBatch > 0) {
                await batch.commit();
            }

            lastDoc = snapshot.docs[snapshot.docs.length - 1];
            processedCount += snapshot.size;
            if (onProgress) onProgress(processedCount);
            console.log(`Migrated ${processedCount} documents...`);
        }
        console.log("Migration Complete.");
    }
};

// --- HELPER FUNCTIONS ---

const generateKeywords = (description = '', category = '', amountStr = '') => {
    const text = `${description} ${category} ${amountStr}`.toLowerCase();
    const words = text.split(/\s+/);
    const keywords = new Set();
    words.forEach(w => { if (w.length > 0) keywords.add(w); });

    const descWords = (description || '').toLowerCase().split(/\s+/);
    descWords.forEach(w => {
        let current = '';
        for (let i = 0; i < w.length; i++) {
            current += w[i];
            if (current.length >= 2) keywords.add(current);
        }
    });

    return Array.from(keywords);
};

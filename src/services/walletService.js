import { collection, doc, runTransaction, getDocs, query, serverTimestamp, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '../config/firebase';

const STATS_DOC_ID = 'global';
const STATS_COLLECTION = 'wallet_stats';
const TRANSACTION_COLLECTION = 'wallet_transactions';

// Schema for Stats Doc:
// {
//    balance: number,
//    income: number,
//    expense: number,
//    categoryBreakdown: {
//       income: { [category: string]: number },
//       expense: { [category: string]: number }
//    }
// }

export const WalletService = {

    /**
     * Add a transaction and atomically update global stats
     */
    addTransaction: async (transactionData) => {
        try {
            await runTransaction(db, async (transaction) => {
                // 1. Create Ref for new Transaction
                const newTxRef = doc(collection(db, TRANSACTION_COLLECTION));

                // 2. Get Stats Doc
                const statsRef = doc(db, STATS_COLLECTION, STATS_DOC_ID);
                const statsSnap = await transaction.get(statsRef);

                let stats = statsSnap.exists()
                    ? statsSnap.data()
                    : { balance: 0, income: 0, expense: 0, categoryBreakdown: { income: {}, expense: {} } };

                // Ensure structure exists
                if (!stats.categoryBreakdown) stats.categoryBreakdown = { income: {}, expense: {} };
                if (!stats.categoryBreakdown.income) stats.categoryBreakdown.income = {};
                if (!stats.categoryBreakdown.expense) stats.categoryBreakdown.expense = {};

                // Description Breakdown (New Feature)
                if (!stats.descriptionBreakdown) stats.descriptionBreakdown = { income: {}, expense: {} };
                if (!stats.descriptionBreakdown.income) stats.descriptionBreakdown.income = {};
                if (!stats.descriptionBreakdown.expense) stats.descriptionBreakdown.expense = {};

                // 3. Calculate New Stats
                const amount = parseFloat(transactionData.amount);
                const type = transactionData.type; // 'income' | 'expense'
                const category = transactionData.category || 'Misc';
                const description = transactionData.description || 'Unknown';

                if (type === 'income') {
                    stats.income = (stats.income || 0) + amount;
                    stats.balance = (stats.balance || 0) + amount;
                    stats.categoryBreakdown.income[category] = (stats.categoryBreakdown.income[category] || 0) + amount;
                    stats.descriptionBreakdown.income[description] = (stats.descriptionBreakdown.income[description] || 0) + amount;
                } else {
                    stats.expense = (stats.expense || 0) + amount;
                    stats.balance = (stats.balance || 0) - amount;
                    stats.categoryBreakdown.expense[category] = (stats.categoryBreakdown.expense[category] || 0) + amount;
                    stats.descriptionBreakdown.expense[description] = (stats.descriptionBreakdown.expense[description] || 0) + amount;
                }

                // 4. Commit Writes
                transaction.set(newTxRef, { ...transactionData, date: serverTimestamp() });
                transaction.set(statsRef, stats);
            });
            return true;
        } catch (error) {
            console.error("WalletService.addTransaction failed:", error);
            throw error;
        }
    },

    /**
     * Delete a transaction and reverse its effect on global stats
     * Safe: Reads the actual transaction record within the atomic window to ensure accurate reversal.
     */
    deleteTransaction: async (transactionId) => {
        try {
            await runTransaction(db, async (transaction) => {
                const txRef = doc(db, TRANSACTION_COLLECTION, transactionId);
                const statsRef = doc(db, STATS_COLLECTION, STATS_DOC_ID);

                // Parallel reads for performance
                const [txSnap, statsSnap] = await Promise.all([
                    transaction.get(txRef),
                    transaction.get(statsRef)
                ]);

                if (!txSnap.exists()) {
                    throw new Error("Transaction does not exist!");
                }

                if (!statsSnap.exists()) {
                    throw new Error("Stats document missing. Please use Sync to rebuild.");
                }

                // Use the SOURCE OF TRUTH (Database) not the UI passed data
                const txData = txSnap.data();
                let stats = statsSnap.data();

                // Ensure structure exists
                if (!stats.categoryBreakdown) stats.categoryBreakdown = { income: {}, expense: {} };
                if (!stats.categoryBreakdown.income) stats.categoryBreakdown.income = {};
                if (!stats.categoryBreakdown.expense) stats.categoryBreakdown.expense = {};

                // Description Breakdown
                if (!stats.descriptionBreakdown) stats.descriptionBreakdown = { income: {}, expense: {} };


                const amount = parseFloat(txData.amount);
                const type = txData.type;
                const category = txData.category || 'Misc';
                const description = txData.description || 'Unknown';

                if (type === 'income') {
                    stats.income = Math.max(0, (stats.income || 0) - amount);
                    stats.balance = (stats.balance || 0) - amount;

                    const currentCatTotal = stats.categoryBreakdown.income[category] || 0;
                    stats.categoryBreakdown.income[category] = Math.max(0, currentCatTotal - amount);

                    const currentDescTotal = stats.descriptionBreakdown.income[description] || 0;
                    stats.descriptionBreakdown.income[description] = Math.max(0, currentDescTotal - amount);
                } else {
                    stats.expense = Math.max(0, (stats.expense || 0) - amount);
                    stats.balance = (stats.balance || 0) + amount;

                    const currentCatTotal = stats.categoryBreakdown.expense[category] || 0;
                    stats.categoryBreakdown.expense[category] = Math.max(0, currentCatTotal - amount);

                    const currentDescTotal = stats.descriptionBreakdown.expense[description] || 0;
                    stats.descriptionBreakdown.expense[description] = Math.max(0, currentDescTotal - amount);
                }

                transaction.delete(txRef);
                transaction.set(statsRef, stats);
            });
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
                },
                descriptionBreakdown: {
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
                    const amount = parseFloat(data.amount) || 0;
                    const type = data.type;
                    const category = data.category || 'Misc';
                    const description = data.description || 'Unknown';

                    if (type === 'income') {
                        newStats.income += amount;
                        newStats.balance += amount;
                        newStats.categoryBreakdown.income[category] = (newStats.categoryBreakdown.income[category] || 0) + amount;
                        newStats.descriptionBreakdown.income[description] = (newStats.descriptionBreakdown.income[description] || 0) + amount;
                    } else {
                        newStats.expense += amount;
                        newStats.balance -= amount;
                        newStats.categoryBreakdown.expense[category] = (newStats.categoryBreakdown.expense[category] || 0) + amount;
                        newStats.descriptionBreakdown.expense[description] = (newStats.descriptionBreakdown.expense[description] || 0) + amount;
                    }
                });

                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                processedCount += snapshot.size;
                // Safety break to prevent infinite loops in weird edge cases
                if (snapshot.size < BATCH_SIZE) hasMore = false;
            }

            // Write direct to doc
            await runTransaction(db, async (transaction) => {
                const statsRef = doc(db, STATS_COLLECTION, STATS_DOC_ID);
                transaction.set(statsRef, newStats);
            });
            return newStats;
        } catch (error) {
            console.error("Recalculate failed:", error);
            throw error;
        }
    }
};

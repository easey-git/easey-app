import { collection, doc, runTransaction, getDocs, query, serverTimestamp, orderBy, limit, startAfter, increment, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ActivityLogService } from './activityLogService';

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
    addTransaction: async (transactionData, userId, userEmail) => {
        try {
            await runTransaction(db, async (transaction) => {
                // 1. Create Ref for new Transaction
                const newTxRef = doc(collection(db, TRANSACTION_COLLECTION));

                // 2. Get Stats Doc
                const statsRef = doc(db, STATS_COLLECTION, STATS_DOC_ID);
                const statsSnap = await transaction.get(statsRef);

                // 3. Increment Stats (Atomic)
                const amount = parseFloat(transactionData.amount);
                const type = transactionData.type; // 'income' | 'expense'
                const category = transactionData.category || 'Misc';

                // Note: We deliberately DO NOT store descriptionBreakdown in the global stats doc anymore.
                // It causes "Document Too Large" errors as descriptions vary wildly.

                if (type === 'income') {
                    transaction.update(statsRef, {
                        income: increment(amount),
                        balance: increment(amount),
                        [`categoryBreakdown.income.${category}`]: increment(amount)
                    });
                } else {
                    transaction.update(statsRef, {
                        expense: increment(amount),
                        balance: increment(-amount),
                        [`categoryBreakdown.expense.${category}`]: increment(amount)
                    });
                }

                // 4. Commit Writes
                const keywords = generateKeywords(transactionData.description, transactionData.category, transactionData.amount);
                transaction.set(newTxRef, { ...transactionData, keywords, date: serverTimestamp() });
            });

            // Log Activity
            if (userId) {
                ActivityLogService.log(
                    userId,
                    userEmail,
                    'ADD_TRANSACTION',
                    `Added ${transactionData.type} of ${transactionData.amount}`,
                    { ...transactionData }
                );
            }

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
    deleteTransaction: async (transactionId, userId, userEmail) => {
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

            // Log Activity
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
    },

    /**
     * MIGRATION UTILITY
     * Loops through all transactions and adds 'keywords' array for search.
     * Use this ONCE to enable search on existing data.
     */
    migrateSearchIndex: async (onProgress) => {
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
                // Check if migration allows skipping? for now force update to ensure consistency
                const keywords = generateKeywords(data.description, data.category, data.amount);

                // Only update if needed
                // if (JSON.stringify(data.keywords) !== JSON.stringify(keywords)) {
                batch.update(doc.ref, { keywords });
                operationsInBatch++;
                // }
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

const generateKeywords = (description = '', category = '', amount = '') => {
    // Combine fields for broader search
    const text = `${description} ${category} ${amount}`.toLowerCase();

    // Split by spaces
    const words = text.split(/\s+/);

    const keywords = new Set();

    // Add whole words
    words.forEach(w => {
        if (w.length > 0) keywords.add(w);
    });

    // Add substrings for prefix search (similar to Algolia)
    // IMPORTANT: Firestore has a limit on array size & index size. 
    // We limit to prefixes of the description words only, max length 20.
    const descWords = (description || '').toLowerCase().split(/\s+/);
    descWords.forEach(w => {
        // Add progressive prefixes: "Server" -> "se", "ser", "serv", "serve", "server"
        // Minimum 2 chars
        let current = '';
        for (let i = 0; i < w.length; i++) {
            current += w[i];
            if (current.length >= 2) keywords.add(current);
        }
    });

    return Array.from(keywords);
};

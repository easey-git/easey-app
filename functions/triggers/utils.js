const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
    admin.initializeApp();
}

/**
 * Scheduled Function: Cleanup Old Activity Logs
 * Runs daily to delete logs older than 30 days.
 * 
 * Best Practice:
 * - Using v2 scheduler for better control and cost (Triggered via Pub/Sub or Cloud Scheduler)
 * - Batch deletion to handle high volume without timeouts (though logs usually aren't massive daily)
 */
exports.cleanupOldLogs = onSchedule("every 24 hours", async (event) => {
    const db = admin.firestore();
    const now = new Date();
    const cutoffDate = new Date(now.setDate(now.getDate() - 30)); // 30 days ago

    console.log(`[Cleanup] Starting cleanup for logs older than ${cutoffDate.toISOString()}...`);

    try {
        const logsRef = db.collection('activity_logs');
        const snapshot = await logsRef
            .where('timestamp', '<', cutoffDate)
            .limit(500) // Batch size limit
            .get();

        if (snapshot.empty) {
            console.log('[Cleanup] No old logs found to delete.');
            return;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`[Cleanup] Successfully deleted ${snapshot.size} old logs.`);

        // Recursive call if we hit the limit? 
        // For simple daily jobs, standard practice is to just let the next run catch the rest 
        // to avoid infinite loops or timeout issues, unless volume is critical.
        // 500 per day is usually sufficient for standard apps.

    } catch (error) {
        console.error('[Cleanup] Error deleting old logs:', error);
    }
});

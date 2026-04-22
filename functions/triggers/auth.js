// Using v1 for Auth triggers as v2 for these isn't available in this SDK version
const { user } = require("firebase-functions/v1/auth");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, auth } = require("../config");

/**
 * TRIGGER: Authentication User Deleted
 * GOAL: Two-way sync - ensure the Firestore profile is also removed.
 */
exports.cleanupUserData = user().onDelete(async (userRecord) => {
    const uid = userRecord.uid;
    console.log(`Auth user deleted: ${uid}, cleaning up Firestore profile...`);

    try {
        await db.collection("users").doc(uid).delete();
        console.log(`Successfully deleted user document for ${uid}`);
    } catch (error) {
        console.error(`Error deleting user document for ${uid}:`, error);
    }
});

/**
 * TRIGGER: Scheduled Audit (Every 60 minutes)
 * GOAL: Ensure perfect consistency between Auth and Firestore.
 */
exports.auditUserStatus = onSchedule('every 60 minutes', async (event) => {
    const listUsersResult = await auth.listUsers(1000);
    const batch = db.batch();
    let updates = 0;

    for (const userRecord of listUsersResult.users) {
        const userRef = db.collection("users").doc(userRecord.uid);
        // We blindly set the disabled status to match Auth. This ensures Firestore is always correct eventually.
        batch.set(userRef, { disabled: userRecord.disabled }, { merge: true });
        updates++;
    }

    if (updates > 0) {
        await batch.commit();
        console.log(`Audited ${updates} users for status consistency.`);
    }
});

const functions = require("firebase-functions");
const { db, auth } = require("../config");

/**
 * TRIGGER: Authentication User Deleted
 * GOAL: Two-way sync - ensure the Firestore profile is also removed.
 */
exports.cleanupUserData = functions.auth.user().onDelete(async (user) => {
    const uid = user.uid;
    console.log(`Auth user deleted: ${uid}, cleaning up Firestore profile...`);

    try {
        await db.collection("users").doc(uid).delete();
        console.log(`Successfully deleted user document for ${uid}`);
    } catch (error) {
        console.error(`Error deleting user document for ${uid}:`, error);
    }
});

/**
 * TRIGGER: Scheduled Audit (Every 24h)
 * GOAL: Ensure perfect consistency between Auth and Firestore.
 * This catches any manual changes made in the Console (like disabling a user).
 */
exports.auditUserStatus = functions.pubsub.schedule('every 60 minutes').onRun(async (context) => {
    const listUsersResult = await auth.listUsers(1000);
    const batch = db.batch();
    let updates = 0;

    for (const user of listUsersResult.users) {
        const userRef = db.collection("users").doc(user.uid);
        // We blindly set the disabled status to match Auth. This ensures Firestore is always correct eventually.
        batch.set(userRef, { disabled: user.disabled }, { merge: true });
        updates++;
    }

    if (updates > 0) {
        await batch.commit();
        console.log(`Audited ${updates} users for status consistency.`);
    }
});



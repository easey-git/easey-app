const functions = require("firebase-functions");
const { db } = require("../config");

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

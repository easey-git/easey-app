const functions = require("firebase-functions");
const { auth } = require("../config");

/**
 * TRIGGER: Firestore User Document Deleted
 * GOAL: Two-way sync - ensure the Auth credentials are also removed.
 */
exports.deleteAuthUser = functions.firestore
    .document("users/{userId}")
    .onDelete(async (snap, context) => {
        const uid = context.params.userId;
        console.log(`Firestore profile deleted: ${uid}, cleaning up Auth user...`);

        try {
            await auth.deleteUser(uid);
            console.log(`Successfully deleted Auth user for ${uid}`);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                console.log(`Auth user ${uid} was already deleted. Skipping.`);
            } else {
                console.error(`Error deleting Auth user for ${uid}:`, error);
            }
        }
    });

const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { auth } = require("../config");

/**
 * TRIGGER: Firestore User Document Deleted
 * GOAL: Two-way sync - ensure the Auth credentials are also removed.
 */
exports.deleteAuthUser = onDocumentDeleted("users/{userId}", async (event) => {
    const uid = event.params.userId;
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

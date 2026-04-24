const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { auth, db } = require("../config");

/**
 * ACTION: Toggle User Status (Disable/Enable)
 * 
 * This callable function allows an admin to disable or enable a user account.
 * It also updates the Firestore user document to reflect the 'disabled' status locally.
 */
exports.toggleUserStatus = onCall({
    region: 'us-central1',
    cors: true
}, async (request) => {
    // 1. Security Check: Ensure the caller is an authenticated admin
    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    try {
        const callerUid = request.auth.uid;
        const callerRef = await db.collection("users").doc(callerUid).get();
        const callerData = callerRef.data();

        if (!callerData || callerData.role !== 'admin') {
            throw new HttpsError(
                'permission-denied',
                'Only admins can manage user status.'
            );
        }

        const { uid, disabled } = request.data;

        if (!uid) {
            throw new HttpsError('invalid-argument', 'The function must be called with a "uid" argument.');
        }

        // 2. Update Auth (The Source of Truth)
        await auth.updateUser(uid, {
            disabled: disabled
        });

        // 3. Update Firestore (Sync status for UI display)
        await db.collection("users").doc(uid).set({
            disabled: disabled
        }, { merge: true });

        console.log(`Successfully ${disabled ? 'disabled' : 'enabled'} user ${uid}`);
        return { success: true, message: `User ${disabled ? 'disabled' : 'enabled'} successfully.` };

    } catch (error) {
        console.error("Error managing user:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'Unable to update user status.');
    }
});

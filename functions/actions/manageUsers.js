const functions = require("firebase-functions");
const { auth, db } = require("../config");

/**
 * ACTION: Toggle User Status (Disable/Enable)
 * 
 * This callable function allows an admin to disable or enable a user account.
 * It also updates the Firestore user document to reflect the 'disabled' status locally.
 * 
 * Usage from Client:
 * const toggleUserStatus = httpsCallable(functions, 'toggleUserStatus');
 * await toggleUserStatus({ uid: 'user_id', disabled: true });
 */
exports.toggleUserStatus = functions.https.onCall(async (data, context) => {
    // 1. Security Check: Ensure the caller is an authenticated admin
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    // Optional: Check if the caller has 'admin' role in custom claims or Firestore
    // For now, we assume the AdminPanelScreen is guarded, but standard practice is to verify here too.
    const callerUid = context.auth.uid;
    const callerRef = await db.collection("users").doc(callerUid).get();
    const callerData = callerRef.data();

    if (callerData.role !== 'admin') {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only admins can manage user status.'
        );
    }

    const { uid, disabled } = data;

    if (!uid) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "uid" argument.');
    }

    try {
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
        throw new functions.https.HttpsError('internal', 'Unable to update user status.', error);
    }
});

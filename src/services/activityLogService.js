import { collection, serverTimestamp, doc, updateDoc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const LOGS_COLLECTION = 'activity_logs';
const USERS_COLLECTION = 'users';

export const ActivityLogService = {
    /**
     * Log an activity
     * @param {string} userId 
     * @param {string} userEmail 
     * @param {string} action - Short uppercase code e.g. 'LOGIN', 'VIEW_SCREEN', 'EDIT_ORDER'
     * @param {string} description - Human readable description
     * @param {object} meta - Additional metadata
     */
    log: async (userId, userEmail, action, description, meta = {}) => {
        if (!userId) return;

        try {
            // 1. Create Log Entry (CRITICAL - must always succeed)
            const logRef = doc(collection(db, LOGS_COLLECTION));
            const batch = writeBatch(db);
            batch.set(logRef, {
                userId,
                userEmail,
                action,
                description,
                meta,
                timestamp: serverTimestamp()
            });
            await batch.commit();

            // 2. Update User Presence (OPTIONAL - fire and forget)
            // Run separately to avoid blocking activity log if user doc doesn't exist
            try {
                const userRef = doc(db, USERS_COLLECTION, userId);
                await updateDoc(userRef, {
                    lastActive: serverTimestamp(),
                    lastAction: action,
                    isOnline: true
                });
            } catch (userError) {
                // User doc might not exist yet - that's okay, log was still created
                console.warn("User presence update failed (non-critical):", userError.code);
            }

        } catch (error) {
            console.error("CRITICAL: Failed to log activity:", error.code, error.message);
        }
    },

    /**
     * Update Heartbeat
     * @param {string} userId 
     */
    heartbeat: async (userId) => {
        if (!userId) return;
        try {
            const userRef = doc(db, USERS_COLLECTION, userId);
            // Use setDoc with merge to handle missing user documents gracefully
            await setDoc(userRef, {
                lastActive: serverTimestamp(),
                isOnline: true
            }, { merge: true });
        } catch (err) {
            console.warn("Heartbeat failed:", err.code);
        }
    }
};

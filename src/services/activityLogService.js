import { collection, serverTimestamp, doc, updateDoc, writeBatch } from 'firebase/firestore';
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
            const batch = writeBatch(db);
            const logRef = doc(collection(db, LOGS_COLLECTION));
            const userRef = doc(db, USERS_COLLECTION, userId);

            // 1. Create Log Entry
            batch.set(logRef, {
                userId,
                userEmail,
                action,
                description,
                meta,
                timestamp: serverTimestamp()
            });

            // 2. Update User Presence (Atomic side-effect)
            batch.update(userRef, {
                lastActive: serverTimestamp(),
                lastAction: action,
                isOnline: true
            });

            await batch.commit();

        } catch (error) {
            console.error("Failed to log activity:", error);
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
            // We only update if it's been a while? No, Firestone writes are cheap enough for a 5-min heartbeat or on-action.
            // Let's just update.
            await updateDoc(userRef, {
                lastActive: serverTimestamp(),
                isOnline: true
            });
        } catch (err) {
            console.warn("Heartbeat failed", err);
        }
    }
};

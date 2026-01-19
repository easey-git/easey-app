import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
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
            await addDoc(collection(db, LOGS_COLLECTION), {
                userId,
                userEmail,
                action,
                description,
                meta,
                timestamp: serverTimestamp()
            });

            // Update user's last active timestamp
            const userRef = doc(db, USERS_COLLECTION, userId);
            await updateDoc(userRef, {
                lastActive: serverTimestamp(),
                lastAction: action,
                isOnline: true // Optimistically set online
            });

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

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import Constants from 'expo-constants';

// --- Constants ---
export const ANDROID_CHANNEL_ID = 'easey_default_v1'; // Must match app.json metaData
const ANDROID_CHANNEL_NAME = 'Default Notification';

// --- Configuration ---
if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}

const getMessaging = () => {
    if (Platform.OS === 'web' || Constants.appOwnership === 'expo') {
        return null;
    }
    try {
        return require('@react-native-firebase/messaging').default;
    } catch (e) {
        console.warn('Firebase messaging not available', e);
        return null;
    }
};

const messaging = getMessaging();

// --- Initialization ---
if (messaging) {
    // Handle Foreground Messages
    // Firebase does NOT show notifications in foreground by default.
    // We must manually trigger a local notification to ensure sound/alert works.
    messaging().onMessage(async remoteMessage => {
        console.log('FCM Message Received (Foreground):', remoteMessage);

        const { notification, data } = remoteMessage;

        if (notification) {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: notification.title,
                    body: notification.body,
                    sound: 'default',
                    data: data,
                },
                trigger: null, // Immediate
            });
        }
    });

    // Background handler is required by RNFirebase
    messaging().setBackgroundMessageHandler(async remoteMessage => {
        console.log('FCM Message Received (Background):', remoteMessage);
        // Handled specifically by Native System using app.json channel config
    });
}

// --- Public API ---

export async function registerForPushNotificationsAsync(userId, role) {
    const messaging = getMessaging();

    if (!messaging) {
        console.log("Messaging not initialized (Web or Expo Go)");
        return null;
    }

    if (Platform.OS === 'android') {
        // Create the notification channel.
        // This is IDEMPOTENT. If usage changes (sound/importance), you MUST change the CHANNEL_ID.
        try {
            await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
                name: ANDROID_CHANNEL_NAME,
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
                sound: 'default', // Explicitly request default sound
            });
        } catch (error) {
            console.error("Failed to create notification channel:", error);
        }
    }

    // Request Permissions
    let finalStatus;
    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
    } catch (error) {
        console.error("Error requesting notification permissions:", error);
        return null;
    }

    if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
    }

    // Get FCM token
    let token;
    try {
        token = await messaging().getToken();
    } catch (error) {
        console.error("Error fetching FCM token:", error);
        return null;
    }

    // Save token to Firestore
    if (token) {
        try {
            const tokenData = {
                token: token,
                updatedAt: serverTimestamp(),
                platform: Platform.OS,
                channelId: ANDROID_CHANNEL_ID // Debug capability
            };

            if (userId) {
                tokenData.userId = userId;
            }
            if (role) {
                tokenData.role = role;
            }

            await setDoc(doc(db, 'push_tokens', token), tokenData, { merge: true });
        } catch (error) {
            console.error('Error saving push token to Firestore:', error);
        }
    }

    return token;
}

export async function sendLocalNotification(title, body, data = {}) {
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: 'default',
            data,
        },
        trigger: null,
    });
}

export async function unregisterPushNotificationsAsync() {
    const messaging = getMessaging();
    if (!messaging) return;

    try {
        const token = await messaging().getToken();
        if (token) {
            await deleteDoc(doc(db, 'push_tokens', token));
        }
    } catch (error) {
        console.error('Error removing push token:', error);
    }
}

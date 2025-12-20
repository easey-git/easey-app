import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import Constants from 'expo-constants';

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

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

// Handle foreground FCM messages
if (messaging) {
    messaging().onMessage(async remoteMessage => {
        // FCM handles the notification display automatically
        // We don't need to manually schedule it
    });

    messaging().setBackgroundMessageHandler(async remoteMessage => {
        // Background messages are handled by FCM automatically
    });
}

export async function registerForPushNotificationsAsync(userId) {
    const messaging = getMessaging();

    if (!messaging) {
        return;
    }

    let token;

    if (Platform.OS === 'android') {
        // Create a single notification channel
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default',
        });
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        alert('Failed to get push token for push notification!');
        return;
    }

    // Get FCM token
    token = await messaging().getToken();

    // Save token to Firestore
    if (token) {
        try {
            const tokenData = {
                token: token,
                updatedAt: serverTimestamp(),
                platform: Platform.OS
            };

            if (userId) {
                tokenData.userId = userId;
            }

            await setDoc(doc(db, 'push_tokens', token), tokenData, { merge: true });
        } catch (error) {
            console.error('Error saving push token:', error);
        }
    }

    return token;
}

export async function sendLocalNotification(title, body) {
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: 'default',
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

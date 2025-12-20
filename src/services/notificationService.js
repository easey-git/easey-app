import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import Constants from 'expo-constants';

// Configure how notifications behave when the app is in the foreground
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

// Handle FCM messages when app is in foreground
const messaging = getMessaging();

if (messaging) {
    messaging().onMessage(async remoteMessage => {
        // Display notification using Expo Notifications
        await Notifications.scheduleNotificationAsync({
            content: {
                title: remoteMessage.notification?.title || 'New Notification',
                body: remoteMessage.notification?.body || '',
                sound: 'live.mp3',
                channelId: 'custom-sound-v5',
                data: remoteMessage.data,
            },
            trigger: null, // Show immediately
        });
    });

    // Handle background messages
    messaging().setBackgroundMessageHandler(async remoteMessage => {
        // Background message handled by FCM
    });
}

export async function registerForPushNotificationsAsync(userId) {
    const messaging = getMessaging();

    if (!messaging) {
        return;
    }

    let token;

    if (Platform.OS === 'android') {
        // Create notification channel with custom sound
        await Notifications.setNotificationChannelAsync('custom-sound-v5', {
            name: 'Live Notifications',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'live.mp3',
            enableVibrate: true,
            enableLights: true,
        });

        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    // Request permission (works on both Android and iOS)
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

    // Get FCM token (works in production builds)
    token = await messaging().getToken();

    // Save token to Firestore
    if (token) {
        try {
            // Use token as doc ID to prevent duplicates
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
            sound: 'default', // Uses the default OS notification sound
        },
        trigger: null, // Send immediately
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

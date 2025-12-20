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
        console.log('FCM Message received in foreground:', remoteMessage);

        // Display notification using Expo Notifications
        await Notifications.scheduleNotificationAsync({
            content: {
                title: remoteMessage.notification?.title || 'New Notification',
                body: remoteMessage.notification?.body || '',
                sound: 'live.mp3',
                channelId: 'custom-sound-v3',
                data: remoteMessage.data,
            },
            trigger: null, // Show immediately
        });
    });

    // Handle background messages
    messaging().setBackgroundMessageHandler(async remoteMessage => {
        console.log('FCM Message handled in background:', remoteMessage);
    });
}

export async function registerForPushNotificationsAsync(userId) {
    const messaging = getMessaging();

    if (!messaging) {
        console.log('Push notifications are not supported in this environment (Web or Expo Go).');
        return;
    }

    let token;

    if (Platform.OS === 'android') {
        // Cleanup old channel to keep settings clean
        await Notifications.deleteNotificationChannelAsync('custom-sound-v2');

        await Notifications.setNotificationChannelAsync('custom-sound-v3', {
            name: 'Live Notifications',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'live.mp3', // Must match the file in assets/sounds/
        });

        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    // Request permission (works on both Android and iOS)
    console.log('Requesting notification permission...');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    console.log('Notification permission status:', finalStatus);

    if (finalStatus !== 'granted') {
        console.log('Notification permission denied!');
        alert('Failed to get push token for push notification!');
        return;
    }

    // Get FCM token (works in production builds)
    console.log('Getting FCM token...');
    token = await messaging().getToken();
    console.log('FCM Token:', token ? token.substring(0, 20) + '...' : 'NULL');

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
            console.log('FCM token saved to Firestore successfully');

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

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// Configure how notifications behave when the app is in the foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export async function registerForPushNotificationsAsync(userId) {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('custom-sound', {
            name: 'Custom Sound',
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

    // Get the token that uniquely identifies this device
    token = (await Notifications.getExpoPushTokenAsync({
        projectId: '194232ae-d544-4928-92bf-6cd52d54e1e5'
    })).data;


    // Save token to Firestore
    if (token) {
        try {
            // Use token as doc ID to prevent duplicates
            // If userId is provided, save it, otherwise just save the token
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
    try {
        const token = (await Notifications.getExpoPushTokenAsync({
            projectId: '194232ae-d544-4928-92bf-6cd52d54e1e5'
        })).data;
        if (token) {
            await deleteDoc(doc(db, 'push_tokens', token));

        }
    } catch (error) {
        console.error('Error removing push token:', error);
    }
}

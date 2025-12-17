import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PreferencesContext = createContext({
    isThemeDark: true,
    toggleTheme: () => { },
    notificationsEnabled: true,
    toggleNotifications: () => { },
    biometricsEnabled: false,
    toggleBiometrics: () => { },
});

export const PreferencesProvider = ({ children }) => {
    const [isThemeDark, setIsThemeDark] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [biometricsEnabled, setBiometricsEnabled] = useState(false);
    const [preferencesLoaded, setPreferencesLoaded] = useState(false);

    useEffect(() => {
        // Load preferences on mount
        const loadPreferences = async () => {
            try {
                const theme = await AsyncStorage.getItem('isThemeDark');
                const notifs = await AsyncStorage.getItem('notificationsEnabled');
                const bio = await AsyncStorage.getItem('biometricsEnabled');

                if (theme !== null) setIsThemeDark(theme === 'true');
                if (notifs !== null) setNotificationsEnabled(notifs === 'true');
                if (bio !== null) setBiometricsEnabled(bio === 'true');
            } catch (e) {
                console.error("Failed to load preferences", e);
            } finally {
                setPreferencesLoaded(true);
            }
        };
        loadPreferences();
    }, []);

    const toggleTheme = async () => {
        try {
            const newVal = !isThemeDark;
            setIsThemeDark(newVal);
            await AsyncStorage.setItem('isThemeDark', String(newVal));
        } catch (e) {
            console.error("Failed to save theme", e);
        }
    };

    const toggleNotifications = async () => {
        try {
            const newVal = !notificationsEnabled;
            setNotificationsEnabled(newVal);
            await AsyncStorage.setItem('notificationsEnabled', String(newVal));
        } catch (e) {
            console.error("Failed to save notifications", e);
        }
    };

    const toggleBiometrics = async () => {
        try {
            const newVal = !biometricsEnabled;
            setBiometricsEnabled(newVal);
            await AsyncStorage.setItem('biometricsEnabled', String(newVal));
        } catch (e) {
            console.error("Failed to save biometrics", e);
        }
    };

    return (
        <PreferencesContext.Provider value={{
            isThemeDark,
            toggleTheme,
            notificationsEnabled,
            toggleNotifications,
            biometricsEnabled,
            toggleBiometrics,
            preferencesLoaded,
        }}>
            {children}
        </PreferencesContext.Provider>
    );
};

export const usePreferences = () => useContext(PreferencesContext);

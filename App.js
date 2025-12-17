import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, adaptNavigationTheme, MD3DarkTheme, MD3LightTheme, Text, Button, Surface } from 'react-native-paper';
import { StatusBar, ActivityIndicator, View, AppState } from 'react-native';
import { useFonts } from 'expo-font';
import * as LocalAuthentication from 'expo-local-authentication';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import StatsScreen from './src/screens/StatsScreen';
import FirestoreViewerScreen from './src/screens/FirestoreViewerScreen';
import LoginScreen from './src/screens/LoginScreen';
import { theme } from './src/theme/theme';
import { PreferencesProvider, usePreferences } from './src/context/PreferencesContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SoundProvider } from './src/context/SoundContext';
import { registerForPushNotificationsAsync, unregisterPushNotificationsAsync } from './src/services/notificationService';

const Stack = createNativeStackNavigator();

const { LightTheme, DarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

const CombinedDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...DarkTheme.colors,
    ...theme.colors, // Custom overrides
  },
};

const CombinedLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...LightTheme.colors,
    primary: theme.colors.primary, // Keep brand primary
    secondary: theme.colors.secondary,
  },
};

function AppNavigator() {
  const { user, loading } = useAuth();
  const { isThemeDark, biometricsEnabled, preferencesLoaded } = usePreferences();
  const [isLocked, setIsLocked] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const activeTheme = isThemeDark ? CombinedDarkTheme : CombinedLightTheme;

  // Handle Lock State
  useEffect(() => {
    if (preferencesLoaded) {
      if (!biometricsEnabled) {
        setIsLocked(false);
      }
    }
  }, [preferencesLoaded, biometricsEnabled]);

  // Trigger Biometrics if Locked
  const authenticate = async () => {
    if (isAuthenticating) return;

    setIsAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // Fallback or just unlock if hardware became unavailable (edge case)
        // For security, we might want to force logout, but for now let's just log
        console.log('Biometrics not available');
        setIsAuthenticating(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Easey CRM',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Allow PIN/Pattern if biometrics fail
      });

      if (result.success) {
        setIsLocked(false);
      }
    } catch (e) {
      console.log('Auth failed', e);
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    if (user && biometricsEnabled && isLocked && preferencesLoaded) {
      // Small delay to ensure UI is ready and avoid race conditions
      const timer = setTimeout(() => {
        authenticate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, biometricsEnabled, isLocked, preferencesLoaded]);

  // Re-lock on Background with Grace Period
  const backgroundTime = React.useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'background') {
        // App went to background, record time
        backgroundTime.current = Date.now();
      } else if (nextAppState === 'active') {
        // App came to foreground
        if (backgroundTime.current > 0) {
          const elapsed = Date.now() - backgroundTime.current;
          // If more than 1 minute (60000ms) has passed, lock the app
          if (elapsed > 60000 && user && biometricsEnabled) {
            setIsLocked(true);
          }
          // Reset background time
          backgroundTime.current = 0;
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user, biometricsEnabled]);

  // Show loading screen while checking auth state or preferences
  if (loading || !preferencesLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: activeTheme.colors.background }}>
        <ActivityIndicator size="large" color={activeTheme.colors.primary} />
      </View>
    );
  }

  // Show Lock Screen
  if (user && biometricsEnabled && isLocked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: activeTheme.colors.background }}>
        <StatusBar barStyle={isThemeDark ? "light-content" : "dark-content"} backgroundColor={activeTheme.colors.background} />
        <Surface style={{ padding: 32, borderRadius: 16, alignItems: 'center', elevation: 4 }} elevation={4}>
          <Text variant="headlineMedium" style={{ marginBottom: 16, fontWeight: 'bold' }}>Locked</Text>
          <Text variant="bodyMedium" style={{ marginBottom: 24, textAlign: 'center' }}>Please authenticate to continue</Text>
          <Button
            mode="contained"
            onPress={authenticate}
            loading={isAuthenticating}
            disabled={isAuthenticating}
            icon="fingerprint"
          >
            Unlock
          </Button>
        </Surface>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: activeTheme.colors.background }}>
      <NavigationContainer theme={activeTheme}>
        <StatusBar barStyle={isThemeDark ? "light-content" : "dark-content"} backgroundColor={activeTheme.colors.background} />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'fade_from_bottom',
            contentStyle: { backgroundColor: activeTheme.colors.background }
          }}
        >
          {!user ? (
            // Unauthenticated Stack
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            // Authenticated Stack
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen
                name="DatabaseManager"
                component={FirestoreViewerScreen}
                options={{ title: 'Database' }}
              />
              <Stack.Screen
                name="Stats"
                component={StatsScreen}
                options={{ title: 'Analytics' }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: 'Settings' }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

function Main() {
  const { isThemeDark, notificationsEnabled } = usePreferences();
  const { user } = useAuth();
  const [fontsLoaded] = useFonts({
    'MaterialCommunityIcons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
  });

  useEffect(() => {
    if (user) {
      if (notificationsEnabled) {
        registerForPushNotificationsAsync(user.uid);
      } else {
        unregisterPushNotificationsAsync();
      }
    }
  }, [user, notificationsEnabled]);

  if (!fontsLoaded) {
    return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
  }

  const activeTheme = isThemeDark ? CombinedDarkTheme : CombinedLightTheme;

  return (
    <PaperProvider theme={activeTheme}>
      <AppNavigator />
    </PaperProvider>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <SoundProvider>
          <Main />
        </SoundProvider>
      </AuthProvider>
    </PreferencesProvider>
  );
}

import { SafeAreaProvider } from 'react-native-safe-area-context';
import './src/ignoreWarnings';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, adaptNavigationTheme, MD3DarkTheme, MD3LightTheme, Text, Button, Surface } from 'react-native-paper';
import { StatusBar, ActivityIndicator, View, AppState, LogBox } from 'react-native';
import { useFonts } from 'expo-font';
import * as LocalAuthentication from 'expo-local-authentication';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import StatsScreen from './src/screens/StatsScreen';
import FirestoreViewerScreen from './src/screens/FirestoreViewerScreen';
import LoginScreen from './src/screens/LoginScreen';
import WhatsAppManagerScreen from './src/screens/WhatsAppManagerScreen';
import MetaScreen from './src/screens/MetaScreen';
import NotesScreen from './src/screens/NotesScreen';
import WalletScreen from './src/screens/WalletScreen';
import LogisticsScreen from './src/screens/LogisticsScreen';
import ActivityLogScreen from './src/screens/ActivityLogScreen';
import { PayUScreen } from './src/screens/PayUScreen';

import AdminPanelScreen from './src/screens/AdminPanelScreen';

import { theme } from './src/theme/theme';
import { PreferencesProvider, usePreferences } from './src/context/PreferencesContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SoundProvider } from './src/context/SoundContext';
import { registerForPushNotificationsAsync, unregisterPushNotificationsAsync } from './src/services/notificationService';
import { AccessDenied } from './src/components/AccessDenied';

import { DrawerProvider } from './src/context/DrawerContext';
import { MobileDrawer } from './src/components/MobileDrawer';
import { Sidebar } from './src/components/Sidebar';
import { useResponsive } from './src/hooks/useResponsive';
import { useDrawer } from './src/context/DrawerContext';

// Wrapper to protect Admin Panel route at navigation level
const AdminPanelWrapper = (props) => {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return <AccessDenied title="Admin Restricted" message="Only administrators can access this area." />;
  }
  return <AdminPanelScreen {...props} />;
};

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

function AppStack() {
  const { user, loading } = useAuth();
  const { isThemeDark, biometricsEnabled, preferencesLoaded } = usePreferences();
  const [isLocked, setIsLocked] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { isDesktop } = useResponsive();
  const { isSidebarPinned } = useDrawer();

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
        setIsAuthenticating(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Easey',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
      }
    } catch (e) {
      console.error("Biometric authentication error:", e);
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    if (user && biometricsEnabled && isLocked && preferencesLoaded) {
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
        backgroundTime.current = Date.now();
      } else if (nextAppState === 'active') {
        if (backgroundTime.current > 0) {
          const elapsed = Date.now() - backgroundTime.current;
          if (elapsed > 60000 && user && biometricsEnabled) {
            setIsLocked(true);
          }
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
    <View style={{ flex: 1, backgroundColor: activeTheme.colors.background, position: 'relative' }}>
      <StatusBar barStyle={isThemeDark ? "light-content" : "dark-content"} backgroundColor={activeTheme.colors.background} />
      {user && isDesktop && <Sidebar floating />}
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
              name="WhatsAppManager"
              component={WhatsAppManagerScreen}
              options={{ title: 'WhatsApp' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Settings' }}
            />
            <Stack.Screen
              name="AdminPanel"
              component={AdminPanelWrapper}
              options={{ title: 'Admin Panel' }}
            />
            <Stack.Screen
              name="Meta"
              component={MetaScreen}
              options={{ title: 'Meta Account' }}
            />
            <Stack.Screen
              name="Notes"
              component={NotesScreen}
              options={{ title: 'Notes' }}
            />
            <Stack.Screen
              name="Wallet"
              component={WalletScreen}
            />
            <Stack.Screen
              name="Logistics"
              component={LogisticsScreen}
              options={{ title: 'Logistics' }}
            />
            <Stack.Screen
              name="ActivityLog"
              component={ActivityLogScreen}
              options={{ title: 'Activity Logs' }}
            />
            <Stack.Screen
              name="PayU"
              component={PayUScreen}
              options={{ title: 'PayU Dash' }}
            />


          </>
        )}
      </Stack.Navigator>
      {/* Global Mobile Drawer - Persists across screens */}
      {user && <MobileDrawer />}
    </View >
  );
}

function Main() {
  const { isThemeDark, notificationsEnabled } = usePreferences();
  const { user, role } = useAuth();
  const [fontsLoaded] = useFonts({
    'MaterialCommunityIcons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
  });

  useEffect(() => {
    if (user) {
      if (notificationsEnabled) {
        registerForPushNotificationsAsync(user.uid, role).catch(err => console.error("Push registration failed:", err.message));
      } else {
        unregisterPushNotificationsAsync().catch(() => { });
      }
    }
  }, [user, role, notificationsEnabled]);

  if (!fontsLoaded) {
    return <ActivityIndicator size="large" style={{ flex: 1, justifyContent: 'center' }} />;
  }

  const activeTheme = isThemeDark ? CombinedDarkTheme : CombinedLightTheme;

  return (
    <NavigationContainer theme={activeTheme}>
      <PaperProvider theme={activeTheme}>
        <AppStack />
      </PaperProvider>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <SoundProvider>
          <DrawerProvider>
            <SafeAreaProvider>
              <Main />
            </SafeAreaProvider>
          </DrawerProvider>
        </SoundProvider>
      </AuthProvider>
    </PreferencesProvider>
  );
}

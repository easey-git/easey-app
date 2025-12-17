import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, adaptNavigationTheme, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { StatusBar, ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
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
  const { isThemeDark } = usePreferences();

  const activeTheme = isThemeDark ? CombinedDarkTheme : CombinedLightTheme;

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: activeTheme.colors.background }}>
        <ActivityIndicator size="large" color={activeTheme.colors.primary} />
      </View>
    );
  }

  return (
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

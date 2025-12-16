import React from 'react';
import { NavigationContainer, DarkTheme as NavigationDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, adaptNavigationTheme } from 'react-native-paper';
import { StatusBar } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import CustomersScreen from './src/screens/CustomersScreen';
import AddCustomerScreen from './src/screens/AddCustomerScreen';
import CustomerDetailScreen from './src/screens/CustomerDetailScreen';

import StatsScreen from './src/screens/StatsScreen';
import OrderManagementScreen from './src/screens/DatabaseManagerScreen';

import { theme } from './src/theme/theme';

const { DarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDarkTheme, // We force dark
  reactNavigationDark: NavigationDarkTheme,
});

const CombinedTheme = {
  ...DarkTheme,
  ...theme,
  colors: {
    ...DarkTheme.colors,
    ...theme.colors,
  },
};

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <PaperProvider theme={CombinedTheme}>
      <NavigationContainer theme={CombinedTheme}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#000000', // Black Header as requested
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            headerShadowVisible: false, // Clean look, no shadow line
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Easey CRM' }}
          />
          <Stack.Screen
            name="Stats"
            component={StatsScreen}
            options={{ title: 'Live Dashboard' }}
          />
          <Stack.Screen
            name="DatabaseManager"
            component={OrderManagementScreen}
            options={{ title: 'Manage Data' }}
          />
          <Stack.Screen
            name="Customers"
            component={CustomersScreen}
            options={{ title: 'Customers' }}
          />
          <Stack.Screen
            name="AddCustomer"
            component={AddCustomerScreen}
            options={{ title: 'Add Customer' }}
          />
          <Stack.Screen
            name="CustomerDetail"
            component={CustomerDetailScreen}
            options={{ title: 'Customer Details' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

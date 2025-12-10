import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import HomeScreen from './src/screens/HomeScreen';
import CustomersScreen from './src/screens/CustomersScreen';
import AddCustomerScreen from './src/screens/AddCustomerScreen';
import CustomerDetailScreen from './src/screens/CustomerDetailScreen';

const Stack = createNativeStackNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6366f1',
    secondary: '#8b5cf6',
  },
};

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#6366f1',
            },
            headerTintColor: '#fff',
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Easey CRM' }}
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

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Searchbar, FAB, List, Avatar, Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CustomersScreen({ navigation }) {
    const [customers, setCustomers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadCustomers();
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            loadCustomers();
        });
        return unsubscribe;
    }, [navigation]);

    const loadCustomers = async () => {
        try {
            const stored = await AsyncStorage.getItem('customers');
            if (stored) {
                setCustomers(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Failed to load customers:', error);
        }
    };

    const filteredCustomers = customers.filter(customer =>
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone.includes(searchQuery)
    );

    const renderCustomer = ({ item }) => (
        <List.Item
            title={item.name}
            description={item.phone}
            left={props => (
                <Avatar.Text
                    {...props}
                    label={item.name.charAt(0).toUpperCase()}
                    size={48}
                />
            )}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => navigation.navigate('CustomerDetail', { customer: item })}
            style={styles.listItem}
        />
    );

    return (
        <View style={styles.container}>
            <Searchbar
                placeholder="Search customers"
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.searchBar}
            />

            {filteredCustomers.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text variant="headlineMedium">📋</Text>
                    <Text variant="titleLarge" style={styles.emptyText}>
                        {searchQuery ? 'No customers found' : 'No customers yet'}
                    </Text>
                    <Text variant="bodyMedium" style={styles.emptySubtext}>
                        {searchQuery ? 'Try different keywords' : 'Tap + to add your first customer'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredCustomers}
                    renderItem={renderCustomer}
                    keyExtractor={(item) => item.id}
                    style={styles.list}
                />
            )}

            <FAB
                icon="plus"
                style={styles.fab}
                onPress={() => navigation.navigate('AddCustomer')}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    searchBar: {
        margin: 16,
    },
    list: {
        flex: 1,
    },
    listItem: {
        backgroundColor: '#fff',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        color: '#666',
        textAlign: 'center',
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
});

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, DataTable, useTheme, Appbar, Searchbar, IconButton, Menu, Divider, Provider } from 'react-native-paper';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

const DatabaseManagerScreen = ({ navigation }) => {
    const [orders, setOrders] = useState([]);
    const [page, setPage] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [searchQuery, setSearchQuery] = useState('');
    const theme = useTheme();

    useEffect(() => {
        // Standard CRM Query: Latest orders first
        const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setOrders(ordersData);
        });

        return () => unsubscribe();
    }, []);

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, "orders", id));
        } catch (error) {
            console.error("Error deleting order: ", error);
        }
    };

    const from = page * itemsPerPage;
    const to = Math.min((page + 1) * itemsPerPage, orders.length);

    return (
        <View style={styles.container}>
            {/* Standard CRM Header */}
            <Appbar.Header style={{ backgroundColor: '#fff', elevation: 0, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
                <Appbar.Content title="Orders" titleStyle={{ fontWeight: 'bold', fontSize: 20 }} />
                <Appbar.Action icon="refresh" onPress={() => { }} />
                <Appbar.Action icon="filter-variant" onPress={() => { }} />
            </Appbar.Header>

            {/* Search Toolbar */}
            <View style={styles.toolbar}>
                <Searchbar
                    placeholder="Search orders..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={styles.searchbar}
                    inputStyle={{ fontSize: 14 }}
                />
            </View>

            {/* Standard Data Table */}
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                <View style={{ minWidth: '100%' }}>
                    <DataTable>
                        <DataTable.Header>
                            <DataTable.Title style={{ flex: 2 }}>Customer</DataTable.Title>
                            <DataTable.Title numeric>Amount</DataTable.Title>
                            <DataTable.Title style={{ flex: 1.5 }}>Status</DataTable.Title>
                            <DataTable.Title style={{ flex: 0.5 }}>Actions</DataTable.Title>
                        </DataTable.Header>

                        {orders.slice(from, to).map((item) => (
                            <DataTable.Row key={item.id}>
                                <DataTable.Cell style={{ flex: 2 }}>
                                    <View>
                                        <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>{item.customerName || 'Guest'}</Text>
                                        <Text variant="labelSmall" style={{ color: '#666' }}>#{item.orderNumber || item.id.slice(0, 4)}</Text>
                                    </View>
                                </DataTable.Cell>
                                <DataTable.Cell numeric>
                                    <Text variant="bodySmall">₹{item.totalPrice}</Text>
                                </DataTable.Cell>
                                <DataTable.Cell style={{ flex: 1.5 }}>
                                    <View style={[styles.badge, { backgroundColor: item.status === 'Paid' ? '#e6fffa' : '#fff5f5' }]}>
                                        <Text style={{ color: item.status === 'Paid' ? '#2c7a7b' : '#c53030', fontSize: 10, fontWeight: 'bold' }}>
                                            {item.status || 'PENDING'}
                                        </Text>
                                    </View>
                                </DataTable.Cell>
                                <DataTable.Cell style={{ flex: 0.5 }}>
                                    <IconButton icon="dots-vertical" size={16} onPress={() => handleDelete(item.id)} />
                                </DataTable.Cell>
                            </DataTable.Row>
                        ))}

                        <DataTable.Pagination
                            page={page}
                            numberOfPages={Math.ceil(orders.length / itemsPerPage)}
                            onPageChange={(page) => setPage(page)}
                            label={`${from + 1}-${to} of ${orders.length}`}
                            numberOfItemsPerPageList={[10, 20, 50]}
                            numberOfItemsPerPage={itemsPerPage}
                            onItemsPerPageChange={setItemsPerPage}
                            showFastPaginationControls
                            selectPageDropdownLabel={'Rows per page'}
                        />
                    </DataTable>
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    toolbar: {
        padding: 12,
        backgroundColor: '#fff',
    },
    searchbar: {
        elevation: 0,
        backgroundColor: '#f5f5f5',
        height: 40,
        borderRadius: 8,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    }
});

export default DatabaseManagerScreen;

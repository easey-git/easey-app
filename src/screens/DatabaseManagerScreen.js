import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, DataTable, useTheme, Appbar, Searchbar, IconButton, SegmentedButtons } from 'react-native-paper';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

const DatabaseManagerScreen = ({ navigation }) => {
    const [data, setData] = useState([]);
    const [viewType, setViewType] = useState('orders'); // 'orders' or 'checkouts'
    const [page, setPage] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [searchQuery, setSearchQuery] = useState('');
    const theme = useTheme();

    useEffect(() => {
        const collectionName = viewType === 'orders' ? 'orders' : 'checkouts';
        const q = query(collection(db, collectionName), orderBy("updatedAt", "desc"), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setData(fetchedData);
        });

        return () => unsubscribe();
    }, [viewType]);

    const handleDelete = async (id) => {
        try {
            const collectionName = viewType === 'orders' ? 'orders' : 'checkouts';
            await deleteDoc(doc(db, collectionName, id));
        } catch (error) {
            console.error("Error deleting document: ", error);
        }
    };

    const from = page * itemsPerPage;
    const to = Math.min((page + 1) * itemsPerPage, data.length);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.Content title="Data Manager" titleStyle={{ fontWeight: 'bold', fontSize: 20, color: theme.colors.onSurface }} />
            </Appbar.Header>

            <View style={{ padding: 16 }}>
                <SegmentedButtons
                    value={viewType}
                    onValueChange={setViewType}
                    buttons={[
                        { value: 'orders', label: 'Orders', icon: 'package-variant' },
                        { value: 'checkouts', label: 'Live Carts', icon: 'cart-outline' },
                    ]}
                />
            </View>

            {/* Standard Data Table */}
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                <View style={{ minWidth: '100%' }}>
                    <DataTable>
                        <DataTable.Header>
                            <DataTable.Title style={{ flex: 2 }} textStyle={{ color: theme.colors.onSurfaceVariant }}>Customer</DataTable.Title>
                            <DataTable.Title numeric textStyle={{ color: theme.colors.onSurfaceVariant }}>Amount</DataTable.Title>
                            <DataTable.Title style={{ flex: 1.5 }} textStyle={{ color: theme.colors.onSurfaceVariant }}>Status</DataTable.Title>
                            <DataTable.Title style={{ flex: 0.5 }} textStyle={{ color: theme.colors.onSurfaceVariant }}>Actions</DataTable.Title>
                        </DataTable.Header>

                        {data.slice(from, to).map((item) => (
                            <DataTable.Row key={item.id}>
                                <DataTable.Cell style={{ flex: 2 }}>
                                    <View>
                                        <Text variant="bodySmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{item.customerName || 'Guest'}</Text>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                            {viewType === 'orders' ? `#${item.orderNumber || item.id.slice(0, 4)}` : item.phone || 'No Phone'}
                                        </Text>
                                    </View>
                                </DataTable.Cell>
                                <DataTable.Cell numeric>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>₹{viewType === 'orders' ? item.totalPrice : item.amount}</Text>
                                </DataTable.Cell>
                                <DataTable.Cell style={{ flex: 1.5 }}>
                                    <View style={[styles.badge, {
                                        backgroundColor:
                                            item.status === 'Paid' ? theme.colors.secondaryContainer :
                                                item.eventType === 'ABANDONED' ? theme.colors.errorContainer : theme.colors.primaryContainer
                                    }]}>
                                        <Text style={{
                                            color:
                                                item.status === 'Paid' ? theme.colors.onSecondaryContainer :
                                                    item.eventType === 'ABANDONED' ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer,
                                            fontSize: 10, fontWeight: 'bold'
                                        }}>
                                            {viewType === 'orders' ? (item.status || 'PENDING') : (item.eventType || 'ACTIVE')}
                                        </Text>
                                    </View>
                                </DataTable.Cell>
                                <DataTable.Cell style={{ flex: 0.5 }}>
                                    <IconButton icon="delete" size={20} iconColor={theme.colors.error} onPress={() => handleDelete(item.id)} />
                                </DataTable.Cell>
                            </DataTable.Row>
                        ))}

                        <DataTable.Pagination
                            page={page}
                            numberOfPages={Math.ceil(data.length / itemsPerPage)}
                            onPageChange={(page) => setPage(page)}
                            label={`${from + 1}-${to} of ${data.length}`}
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
    },
    toolbar: {
        padding: 12,
    },
    searchbar: {
        elevation: 0,
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

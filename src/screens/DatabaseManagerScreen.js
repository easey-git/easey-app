import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, DataTable, useTheme, Appbar, SegmentedButtons, IconButton, Portal, Modal, Surface, Button, Divider, Avatar } from 'react-native-paper';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

const OrderManagementScreen = ({ navigation }) => {
    const [data, setData] = useState([]);
    const [viewType, setViewType] = useState('orders'); // 'orders' or 'checkouts'
    const [page, setPage] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [selectedItem, setSelectedItem] = useState(null);
    const [visible, setVisible] = useState(false);
    const theme = useTheme();

    const showModal = (item) => {
        setSelectedItem(item);
        setVisible(true);
    };
    const hideModal = () => setVisible(false);

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
            hideModal();
        } catch (error) {
            console.error("Error deleting document: ", error);
        }
    };

    const from = page * itemsPerPage;
    const to = Math.min((page + 1) * itemsPerPage, data.length);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.Content title="Order Management" titleStyle={{ fontWeight: 'bold', fontSize: 20, color: theme.colors.onSurface }} />
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
                            <DataTable.Title style={{ flex: 0.5 }} textStyle={{ color: theme.colors.onSurfaceVariant }}>View</DataTable.Title>
                        </DataTable.Header>

                        {data.slice(from, to).map((item) => (
                            <DataTable.Row key={item.id} onPress={() => showModal(item)}>
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
                                    <IconButton icon="chevron-right" size={20} iconColor={theme.colors.onSurfaceVariant} onPress={() => showModal(item)} />
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

            {/* Comprehensive Details Modal */}
            <Portal>
                <Modal visible={visible} onDismiss={hideModal} contentContainerStyle={{ padding: 20 }}>
                    {selectedItem && (
                        <Surface style={[styles.modalContent, { backgroundColor: theme.colors.surface }]} elevation={4}>
                            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                        {viewType === 'orders' ? `Order #${selectedItem.orderNumber}` : 'Cart Details'}
                                    </Text>
                                    <IconButton icon="close" onPress={hideModal} />
                                </View>

                                <Divider style={{ marginBottom: 16 }} />

                                {/* Customer Section */}
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 }}>Customer</Text>
                                <View style={styles.detailRow}>
                                    <Avatar.Icon size={40} icon="account" style={{ backgroundColor: theme.colors.surfaceVariant }} />
                                    <View style={{ marginLeft: 12 }}>
                                        <Text variant="bodyLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{selectedItem.customerName}</Text>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{selectedItem.email}</Text>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{selectedItem.phone}</Text>
                                    </View>
                                </View>

                                {/* Address Section */}
                                {selectedItem.city && (
                                    <>
                                        <Divider style={{ marginVertical: 16 }} />
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 }}>Shipping Address</Text>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                                            {selectedItem.address1 ? `${selectedItem.address1}, ` : ''}
                                            {selectedItem.city}, {selectedItem.province} {selectedItem.zip}
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>{selectedItem.country}</Text>
                                    </>
                                )}

                                {/* Items Section */}
                                <Divider style={{ marginVertical: 16 }} />
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 }}>Items</Text>
                                {selectedItem.items && selectedItem.items.map((item, index) => (
                                    <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ flex: 1, color: theme.colors.onSurface }}>{item.quantity}x {item.name}</Text>
                                        <Text style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{item.price}</Text>
                                    </View>
                                ))}

                                {/* Totals Section */}
                                <Divider style={{ marginVertical: 16 }} />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>Total</Text>
                                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                        ₹{viewType === 'orders' ? selectedItem.totalPrice : selectedItem.amount}
                                    </Text>
                                </View>

                                {/* Actions */}
                                <Button
                                    mode="contained"
                                    buttonColor={theme.colors.error}
                                    style={{ marginTop: 24 }}
                                    icon="delete"
                                    onPress={() => handleDelete(selectedItem.id)}
                                >
                                    Delete Record
                                </Button>
                            </ScrollView>
                        </Surface>
                    )}
                </Modal>
            </Portal>
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
    },
    modalContent: { borderRadius: 12, padding: 20, maxHeight: '80%' },
    detailRow: { flexDirection: 'row', alignItems: 'center' }
});

export default OrderManagementScreen;

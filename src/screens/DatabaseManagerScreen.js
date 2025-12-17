import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Text, useTheme, Appbar, IconButton, Portal, Modal, Surface, Button, Divider, Avatar, Searchbar } from 'react-native-paper';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

const OrderManagementScreen = ({ navigation }) => {
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [visible, setVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const theme = useTheme();

    const showModal = (item) => {
        setSelectedItem(item);
        setVisible(true);
    };
    const hideModal = () => setVisible(false);

    const fetchOrders = () => {
        const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedData = snapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    ...d,
                    // Helper for search
                    searchStr: `${d.orderNumber || ''} ${d.customerName || ''} ${d.phone || ''} ${d.email || ''}`.toLowerCase()
                };
            });
            setData(fetchedData);
            setFilteredData(fetchedData);
            setRefreshing(false);
        });

        return unsubscribe;
    };

    useEffect(() => {
        const unsubscribe = fetchOrders();
        return () => unsubscribe();
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        // The onSnapshot listener will automatically update, this is just for UX
        // If you want to force a re-fetch, you'd call fetchOrders() again here
        // but onSnapshot handles real-time updates, so a timeout is sufficient for UX.
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    // Handle Search
    const onSearch = (query) => {
        setSearchQuery(query);
        if (query.trim() === '') {
            setFilteredData(data);
        } else {
            const filtered = data.filter(item =>
                item.searchStr.includes(query.toLowerCase())
            );
            setFilteredData(filtered);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, "orders", id));
            hideModal();
        } catch (error) {
            console.error("Error deleting order:", error);
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const renderOrderCard = ({ item }) => (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <TouchableOpacity onPress={() => showModal(item)} activeOpacity={0.8}>
                <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar.Icon
                            size={32}
                            icon="package-variant-closed"
                            style={{ backgroundColor: theme.colors.secondaryContainer }}
                            color={theme.colors.onSecondaryContainer}
                        />
                        <View style={{ marginLeft: 12 }}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                Order #{item.orderNumber}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                {formatDate(item.createdAt)}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, {
                        backgroundColor: item.status === 'Paid' ? '#e6fffa' : '#ebf8ff'
                    }]}>
                        <Text style={{
                            color: item.status === 'Paid' ? '#2c7a7b' : '#2b6cb0',
                            fontSize: 10, fontWeight: 'bold'
                        }}>
                            {item.status || 'PAID'}
                        </Text>
                    </View>
                </View>

                <Divider style={{ marginVertical: 12 }} />

                <View style={styles.cardBody}>
                    <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{item.customerName || 'Guest Customer'}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                            {item.items ? `${item.items.length} Items` : 'No items'} • {item.city || 'No Location'}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                            ₹{item.totalPrice}
                        </Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Total</Text>
                    </View>
                </View>
            </TouchableOpacity>
        </Surface>
    );

    const EmptyState = () => (
        <View style={styles.emptyState}>
            <Avatar.Icon
                size={80}
                icon={searchQuery ? "magnify" : "package-variant"}
                style={{ backgroundColor: theme.colors.surfaceVariant }}
                color={theme.colors.onSurfaceVariant}
            />
            <Text variant="titleMedium" style={{ marginTop: 16, fontWeight: 'bold', color: theme.colors.onSurface }}>
                {searchQuery ? 'No Orders Found' : 'No Orders Yet'}
            </Text>
            <Text variant="bodyMedium" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                {searchQuery
                    ? `No orders match "${searchQuery}"`
                    : 'Orders will appear here once customers complete their purchase'}
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="Orders" titleStyle={{ fontWeight: 'bold', fontSize: 20, color: theme.colors.onSurface }} />
                <Appbar.Action icon="filter-variant" onPress={() => { }} />
            </Appbar.Header>

            <View style={{ padding: 16, paddingBottom: 8 }}>
                <Searchbar
                    placeholder="Search orders, customers..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderColor: theme.colors.outlineVariant }}
                    inputStyle={{ minHeight: 0 }}
                />
            </View>

            <FlatList
                data={filteredData}
                renderItem={renderOrderCard}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16, paddingTop: 8 }}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                showsVerticalScrollIndicator={false}
            />

            {/* Comprehensive Details Modal */}
            <Portal>
                <Modal visible={visible} onDismiss={hideModal} contentContainerStyle={{ padding: 20 }}>
                    {selectedItem && (
                        <Surface style={[styles.modalContent, { backgroundColor: theme.colors.surface }]} elevation={4}>
                            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                        Order #{selectedItem.orderNumber}
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
                                        ₹{selectedItem.totalPrice}
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
    container: { flex: 1 },
    card: {
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardBody: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    modalContent: { borderRadius: 12, padding: 20, maxHeight: '80%' },
    detailRow: { flexDirection: 'row', alignItems: 'center' }
});

export default OrderManagementScreen;

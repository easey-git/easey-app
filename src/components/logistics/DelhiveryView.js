import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, FlatList } from 'react-native';
import { Text, Searchbar, Chip, useTheme, Card, ActivityIndicator } from 'react-native-paper';
import { fetchDelhiveryOrders, fetchDelhiveryBalance } from '../../services/delhiveryService';

export const DelhiveryView = () => {
    const theme = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [allOrders, setAllOrders] = useState([]);

    const [balance, setBalance] = useState(null);
    const [balanceLoading, setBalanceLoading] = useState(false);

    useEffect(() => {
        loadOrders();
        loadBalance();
    }, []);

    const loadBalance = async () => {
        setBalanceLoading(true);
        const bal = await fetchDelhiveryBalance();
        if (bal !== null) setBalance(bal);
        setBalanceLoading(false);
    };

    const loadOrders = async () => {
        setLoading(true);
        try {
            const data = await fetchDelhiveryOrders([]);
            if (data?.results) {
                const mapped = data.results.map(pkg => ({
                    id: pkg.order_number || 'N/A',
                    awb: pkg.awb_number || 'N/A',
                    date: pkg.manifest_at ? new Date(pkg.manifest_at).toLocaleDateString() : 'N/A',
                    status: pkg.shipment_status || 'Unknown',
                    location: pkg.origin_address?.city || 'N/A',
                    update: pkg.last_update || 'N/A',
                }));
                setAllOrders(mapped);
            } else {
                setAllOrders([]);
            }
        } catch (err) {
            console.error("Failed to load orders", err);
            setAllOrders([]);
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = (status) => {
        setSelectedStatuses(prev =>
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
    };

    // Debounce search query to prevent lag on typing
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300); // 300ms delay is industry standard

        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery]);

    // Filter orders based on selected statuses and debounced search query
    const filteredOrders = React.useMemo(() => {
        let filtered = allOrders;

        // Filter by status - exact match
        if (selectedStatuses.length > 0) {
            filtered = filtered.filter(order =>
                selectedStatuses.includes(order.status)
            );
        }

        // Filter by debounced search query
        if (debouncedSearchQuery.trim()) {
            const query = debouncedSearchQuery.toLowerCase();
            filtered = filtered.filter(order =>
                order.id.toLowerCase().includes(query) ||
                order.awb.toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [allOrders, selectedStatuses, debouncedSearchQuery]);

    const statusCounts = React.useMemo(() => {
        const counts = {};
        allOrders.forEach(order => {
            const s = order.status;
            if (s && s !== 'Unknown') {
                counts[s] = (counts[s] || 0) + 1;
            }
        });
        return counts;
    }, [allOrders]);


    const getStatusColor = (status) => {
        const s = status?.toUpperCase() || '';
        if (s.includes('DELIVERED')) return '#4CAF50';
        if (s.includes('READY')) return '#2196F3';
        if (s.includes('TRANSIT')) return '#FF9800';
        if (s.includes('CANCEL') || s.includes('RTO')) return '#F44336';
        return theme.colors.outline;
    };

    const renderOrder = React.useCallback(({ item }) => (
        <OrderItem item={item} theme={theme} getStatusColor={getStatusColor} />
    ), [theme]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Balance Card */}
            <Card style={{ margin: 16, marginBottom: 8, backgroundColor: theme.colors.elevation.level2 }} mode="contained">
                <Card.Content style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Delhivery Balance</Text>
                        {balanceLoading ? (
                            <ActivityIndicator size="small" color={theme.colors.primary} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
                        ) : (
                            <Text variant="headlineMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                                ₹{balance ? Number(balance).toLocaleString('en-IN') : '--'}
                            </Text>
                        )}
                    </View>
                    <Chip icon="wallet" style={{ backgroundColor: theme.colors.surface }}>Wallet</Chip>
                </Card.Content>
            </Card>

            {/* Search */}
            <Searchbar
                placeholder="Search by AWB or Order ID"
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={[styles.searchbar, { backgroundColor: theme.colors.elevation.level2 }]}
                iconColor={theme.colors.onSurfaceVariant}
                placeholderTextColor={theme.colors.onSurfaceVariant}
            />

            {/* Status Chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsContainer}
                contentContainerStyle={styles.chipsContent}
            >
                <Chip
                    selected={selectedStatuses.length === 0}
                    onPress={() => setSelectedStatuses([])}
                    style={styles.chip}
                    compact
                    showSelectedCheck={false}
                >
                    All ({allOrders.length})
                </Chip>
                {Object.keys(statusCounts).sort().map(status => (
                    <Chip
                        key={status}
                        selected={selectedStatuses.includes(status)}
                        onPress={() => toggleStatus(status)}
                        style={styles.chip}
                        compact
                    >
                        {status} ({statusCounts[status]})
                    </Chip>
                ))}
            </ScrollView>

            {/* Orders List */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>Loading shipments...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredOrders}
                    renderItem={renderOrder}
                    keyExtractor={item => item.awb}
                    contentContainerStyle={styles.listContent}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={15}
                    updateCellsBatchingPeriod={30}
                    initialNumToRender={10}
                    windowSize={11}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text variant="titleMedium" style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                                No shipments found
                            </Text>
                        </View>
                    }
                />
            )}
        </View>
    );
};

// Memoized Item Component prevents re-renders of all items when one things changes
const OrderItem = React.memo(({ item, theme, getStatusColor }) => (
    <Card style={[styles.orderCard, { backgroundColor: theme.colors.surface }]} mode="outlined">
        <Card.Content style={styles.cardContent}>
            <View style={styles.orderRow}>
                <View style={styles.orderInfo}>
                    <Text variant="titleMedium" style={[styles.orderId, { color: theme.colors.onSurface }]}>{item.id}</Text>
                    <Text variant="bodySmall" style={[styles.awb, { color: theme.colors.onSurfaceVariant }]}>AWB: {item.awb}</Text>
                </View>
                <View style={styles.statusContainer}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                    <Text variant="bodySmall" style={[styles.statusText, { color: theme.colors.onSurface }]}>{item.status}</Text>
                </View>
            </View>
            <View style={styles.orderDetails}>
                <Text variant="bodySmall" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>📍 {item.location}</Text>
                <Text variant="bodySmall" style={[styles.detailText, { color: theme.colors.onSurfaceVariant }]}>📅 {item.date}</Text>
            </View>
            {item.update !== 'N/A' && (
                <Text variant="bodySmall" style={[styles.updateText, { color: theme.colors.outline }]}>{item.update}</Text>
            )}
        </Card.Content>
    </Card>
));

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    searchbar: {
        margin: 16,
        elevation: 0,
    },
    chipsContainer: {
        flexGrow: 0,
        marginBottom: 8,
    },
    chipsContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    chip: {
        marginRight: 8,
    },
    listContent: {
        padding: 16,
        paddingTop: 8,
    },
    orderCard: {
        marginBottom: 12,
    },
    cardContent: {
        padding: 16,
    },
    orderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    orderInfo: {
        flex: 1,
    },
    orderId: {
        fontWeight: '600',
        marginBottom: 4,
    },
    awb: {},
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
    },
    orderDetails: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 8,
    },
    detailText: {
        fontSize: 12,
    },
    updateText: {
        fontSize: 11,
        fontStyle: 'italic',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {},
});

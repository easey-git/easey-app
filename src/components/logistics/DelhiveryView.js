import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Surface, Button, DataTable, Chip, useTheme, Card, IconButton, Checkbox, Menu, TextInput, Divider } from 'react-native-paper';
import { fetchDelhiveryOrders } from '../../services/delhiveryService';

export const DelhiveryView = () => {
    const theme = useTheme();
    const [page, setPage] = useState(0);
    const [statusFilterVisible, setStatusFilterVisible] = useState(false);
    const [selectedStatuses, setSelectedStatuses] = useState([]);

    // Exact statuses from the user's screenshot
    const DELHIVERY_STATUSES = [
        "Ready To Ship",
        "Ready for pickup",
        "In-Transit",
        "Out for delivery",
        "Delivered",
        "RTO - In Transit",
        "RTO - Returned",
        "Cancelled",
        "Lost"
    ];

    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState([]);

    // Fetch orders on mount or when filters change
    React.useEffect(() => {
        const loadOrders = async () => {
            setLoading(true);
            try {
                // In a real app, we would pass the selectedStatuses and page to the API
                // For now, we fetch generic data.
                const data = await fetchDelhiveryOrders(selectedStatuses);
                console.log("DEBUG: Raw API Data received in View:", JSON.stringify(data)); // Force log

                if (data) {
                    // Check for different possible response structures
                    // Debug logs showed structure: { result_count: 50, results: [...] }
                    const packages = data.results || data.packages || data.data || [];

                    if (packages.length > 0) {
                        // Map API response to our UI model
                        const mappedOrders = packages.map(pkg => ({
                            id: pkg.order_number || pkg.ref_id || 'N/A',
                            awb: pkg.awb_number || pkg.waybill || 'N/A',
                            manifestDate: pkg.manifest_at ? new Date(pkg.manifest_at).toLocaleDateString() : 'N/A',
                            status: pkg.shipment_status || pkg.status || 'Unknown',
                            pickup: pkg.origin_address?.city || pkg.pickup_location_name || 'Warehouse',
                            lastUpdate: pkg.last_update || 'N/A',
                            paymentMode: pkg.payment_mode || 'Prepaid'
                        }));
                        setOrders(mappedOrders);
                    } else {
                        console.log("API returned data but no packages found/mapped");
                        setOrders([]);
                    }
                } else {
                    console.log("No API data found (null response)");
                    setOrders([]);
                }
            } catch (err) {
                console.error("Failed to load orders", err);
            } finally {
                setLoading(false);
            }
        };

        loadOrders();
    }, [selectedStatuses, page]);

    const toggleStatus = (status) => {
        if (selectedStatuses.includes(status)) {
            setSelectedStatuses(selectedStatuses.filter(s => s !== status));
        } else {
            setSelectedStatuses([...selectedStatuses, status]);
        }
    };

    const getStatusColor = (status) => {
        // Industry standard colors
        const s = status?.toUpperCase() || '';
        if (s.includes('DELIVERED')) return '#E8F5E9'; // Green
        if (s.includes('READY')) return '#E3F2FD'; // Blue
        if (s.includes('TRANSIT')) return '#FFF3E0'; // Orange
        if (s.includes('CANCEL')) return '#FFEBEE'; // Red
        if (s.includes('RTO')) return '#FFEBEE'; // Red
        return '#F5F5F5'; // Grey
    };

    const getStatusTextColor = (status) => {
        const s = status?.toUpperCase() || '';
        if (s.includes('DELIVERED')) return '#2E7D32';
        if (s.includes('READY')) return '#1565C0';
        if (s.includes('TRANSIT')) return '#EF6C00';
        if (s.includes('CANCEL')) return '#C62828';
        if (s.includes('RTO')) return '#C62828';
        return '#616161';
    };

    const renderOrderItem = (item) => (
        <View key={item.id} style={styles.rowItem}>
            {/* Checkbox Column */}
            <View style={{ width: 40, justifyContent: 'center' }}>
                <Checkbox status="unchecked" color={theme.colors.primary} />
            </View>

            {/* Order Details Column */}
            <View style={{ flex: 2, justifyContent: 'center' }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                    {item.id}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                    AWB: {item.awb}
                </Text>
            </View>

            {/* Date Column */}
            <View style={{ flex: 1.5, justifyContent: 'center' }}>
                <Text variant="bodyMedium">{item.manifestDate}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Manifested</Text>
            </View>

            {/* Status Column */}
            <View style={{ flex: 1.5, justifyContent: 'center', alignItems: 'flex-start' }}>
                <View style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(item.status) }
                ]}>
                    <Text style={[
                        styles.statusText,
                        { color: getStatusTextColor(item.status) }
                    ]}>
                        {item.status}
                    </Text>
                </View>
                <Text variant="labelSmall" style={{ color: theme.colors.outline, marginTop: 4 }}>
                    {item.lastUpdate}
                </Text>
            </View>

            {/* Location Column */}
            <View style={{ flex: 1.5, justifyContent: 'center' }}>
                <Text variant="bodyMedium">{item.pickup}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Pickup</Text>
            </View>

            {/* Actions Column */}
            <View style={{ width: 50, justifyContent: 'center', alignItems: 'flex-end' }}>
                <IconButton icon="pencil-outline" size={20} iconColor={theme.colors.secondary} onPress={() => { }} />
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: '#1a1a1a' }}>Logistics Hub</Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.outline }}>
                        {orders.length > 0 ? `Showing 1 - ${orders.length} of ${orders.length}` : 'Loading shipments...'}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Button icon="cloud-download-outline" mode="outlined" style={styles.actionButton}>Export</Button>
                    <Button icon="plus" mode="contained" buttonColor="#000" style={styles.actionButton}>Create</Button>
                </View>
            </View>

            {/* Filters */}
            <View style={styles.filterContainer}>
                <Surface style={styles.searchBar} elevation={0}>
                    <IconButton icon="magnify" size={20} style={{ margin: 0 }} />
                    <TextInput
                        placeholder="Search by AWB or Order ID"
                        style={styles.searchInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        placeholderTextColor={theme.colors.outline}
                        dense
                    />
                </Surface>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                    <Button mode="outlined" compact icon="filter-variant" onPress={() => setStatusFilterVisible(true)}>
                        Status
                    </Button>
                    <Button mode="outlined" compact icon="calendar-range">
                        Date Range
                    </Button>
                </ScrollView>
            </View>

            {/* List Header */}
            <Surface style={styles.listHeader} elevation={0}>
                <View style={{ width: 40 }} />
                <Text style={[styles.columnHeader, { flex: 2 }]}>ORDER DETAILS</Text>
                <Text style={[styles.columnHeader, { flex: 1.5 }]}>DATE</Text>
                <Text style={[styles.columnHeader, { flex: 1.5 }]}>STATUS</Text>
                <Text style={[styles.columnHeader, { flex: 1.5 }]}>LOCATION</Text>
                <View style={{ width: 50 }} />
            </Surface>

            {/* Main List */}
            <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                    {loading ? (
                        <Text style={{ padding: 20, textAlign: 'center', color: theme.colors.outline }}>Syncing with Delhivery...</Text>
                    ) : (
                        orders.map(item => renderOrderItem(item))
                    )}

                    {!loading && orders.length === 0 && (
                        <View style={styles.emptyState}>
                            <IconButton icon="package-variant-closed" size={48} iconColor="#ddd" />
                            <Text variant="titleMedium" style={{ color: theme.colors.outline }}>No shipments found</Text>
                        </View>
                    )}
                </ScrollView>
            </View>

            {/* Status Filter Menu */}
            <Menu
                visible={statusFilterVisible}
                onDismiss={() => setStatusFilterVisible(false)}
                anchor={{ x: 100, y: 150 }} // Approximate anchor, or attach to button ref
            >
                {DELHIVERY_STATUSES.map(status => (
                    <Menu.Item
                        key={status}
                        onPress={() => toggleStatus(status)}
                        title={status}
                        trailingIcon={selectedStatuses.includes(status) ? "check" : undefined}
                    />
                ))}
            </Menu>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F7F9FC', // Very light premium grey background
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    actionButton: {
        borderRadius: 8,
    },
    filterContainer: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16,
        alignItems: 'center'
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        width: 300,
        height: 40,
        paddingRight: 8,
    },
    searchInput: {
        flex: 1,
        height: 40,
        backgroundColor: 'transparent',
        fontSize: 14,
    },
    listHeader: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
        marginBottom: 8,
    },
    columnHeader: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9E9E9E',
        letterSpacing: 0.5,
    },
    rowItem: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingVertical: 16,
        paddingHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#EEF0F4',
        // Premium shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    statusText: {
        fontSize: 11,
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
    }
});

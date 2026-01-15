import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Surface, Button, DataTable, Chip, useTheme, Card, IconButton, Checkbox, Menu, TextInput, Divider } from 'react-native-paper';
import { fetchDelhiveryOrders } from '../../services/delhiveryService';

export const DelhiveryView = () => {
    const theme = useTheme();
    const [page, setPage] = useState(0);
    const [selectedFilter, setSelectedFilter] = useState('Pending');

    // Exact statuses from the user's request
    const DELHIVERY_FILTERS = [
        "Pending",
        "Ready to Ship",
        "Ready for Pickup",
        "In-Transit",
        "Out for Delivery",
        "Delivered",
        "RTO In-Transit",
        "RTO-Returned",
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
                // Fetch based on selected filter
                const data = await fetchDelhiveryOrders(selectedFilter, 1);
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
    }, [selectedFilter, page]);

    const getStatusColor = (status) => {
        const s = status?.toUpperCase() || '';
        // Use simpler transparent styling or theme-aware colors specifically for dark mode support if needed
        // For now, these industry standard light pastels work well on dark if the text is dark, 
        // OR we can make them distinct. 
        // A better approach for dark mode is generally using the `tertiaryContainer` or similar, 
        // but specific semantic colors are better.
        // Let's keep them but ensure the container doesn't look weird.

        if (s.includes('DELIVERED')) return theme.dark ? '#1b5e20' : '#E8F5E9'; // Dk Green / Lt Green
        if (s.includes('READY')) return theme.dark ? '#0d47a1' : '#E3F2FD'; // Dk Blue / Lt Blue
        if (s.includes('TRANSIT')) return theme.dark ? '#e65100' : '#FFF3E0'; // Dk Orange / Lt Orange
        if (s.includes('CANCEL')) return theme.dark ? '#b71c1c' : '#FFEBEE'; // Dk Red / Lt Red
        if (s.includes('RTO')) return theme.dark ? '#b71c1c' : '#FFEBEE';
        return theme.colors.surfaceVariant;
    };

    const getStatusTextColor = (status) => {
        const s = status?.toUpperCase() || '';
        if (theme.dark) return '#ffffff'; // White text on dark semantic backgrounds

        if (s.includes('DELIVERED')) return '#2E7D32';
        if (s.includes('READY')) return '#1565C0';
        if (s.includes('TRANSIT')) return '#EF6C00';
        if (s.includes('CANCEL')) return '#C62828';
        if (s.includes('RTO')) return '#C62828';
        return theme.colors.onSurfaceVariant;
    };

    const renderOrderItem = (item) => (
        <View key={item.id} style={[styles.rowItem, {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant
        }]}>
            {/* Order Details Column */}
            <View style={{ flex: 2, justifyContent: 'center' }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                    {item.id}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                    AWB: {item.awb}
                </Text>
            </View>

            {/* Date Column */}
            <View style={{ flex: 1.5, justifyContent: 'center' }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{item.manifestDate}</Text>
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
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{item.pickup}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Pickup</Text>
            </View>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onBackground }}>Logistics Hub</Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.outline }}>
                        {orders.length > 0 ? `Showing 1 - ${orders.length} of ${orders.length}` : 'Loading shipments...'}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Button icon="cloud-download-outline" mode="outlined" style={styles.actionButton}>Export</Button>
                </View>
            </View>

            {/* Filters */}
            <View style={styles.filterContainer}>
                <Surface style={[styles.searchBar, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                    <IconButton icon="magnify" size={20} style={{ margin: 0 }} iconColor={theme.colors.onSurfaceVariant} />
                    <TextInput
                        placeholder="Search by AWB or Order ID"
                        style={styles.searchInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        placeholderTextColor={theme.colors.outline}
                        textColor={theme.colors.onSurface}
                        dense
                    />
                </Surface>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingVertical: 4 }}>
                    {DELHIVERY_FILTERS.map(filter => (
                        <Chip
                            key={filter}
                            selected={selectedFilter === filter}
                            onPress={() => setSelectedFilter(filter)}
                            showSelectedOverlay
                            style={{
                                backgroundColor: selectedFilter === filter ? theme.colors.primaryContainer : theme.colors.surface,
                                borderColor: theme.colors.outlineVariant,
                                borderWidth: 1
                            }}
                            textStyle={{ color: selectedFilter === filter ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}
                        >
                            {filter}
                        </Chip>
                    ))}
                </ScrollView>
            </View>

            {/* List Header */}
            <Surface style={[styles.listHeader, { borderBottomColor: theme.colors.outlineVariant, backgroundColor: theme.colors.background }]} elevation={0}>
                <Text style={[styles.columnHeader, { flex: 2, color: theme.colors.outline }]}>ORDER DETAILS</Text>
                <Text style={[styles.columnHeader, { flex: 1.5, color: theme.colors.outline }]}>DATE</Text>
                <Text style={[styles.columnHeader, { flex: 1.5, color: theme.colors.outline }]}>STATUS</Text>
                <Text style={[styles.columnHeader, { flex: 1.5, color: theme.colors.outline }]}>LOCATION</Text>
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
                            <IconButton icon="package-variant-closed" size={48} iconColor={theme.colors.outlineVariant} />
                            <Text variant="titleMedium" style={{ color: theme.colors.outline }}>No shipments found</Text>
                        </View>
                    )}
                </ScrollView>
            </View>

        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
        borderRadius: 8,
        borderWidth: 1,
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
        borderBottomWidth: 1,
        marginBottom: 8,
    },
    columnHeader: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    rowItem: {
        flexDirection: 'row',
        paddingVertical: 16,
        paddingHorizontal: 16,
        marginBottom: 8,
        borderRadius: 12,
        borderWidth: 1,
        // Premium shadow with Platform specific handling
        ...Platform.select({
            web: {
                boxShadow: '0px 2px 8px rgba(0,0,0,0.03)'
            },
            default: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.03,
                shadowRadius: 8,
                elevation: 2,
            }
        }),
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

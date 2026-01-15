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
        switch (status) {
            case 'Delivered': return '#E8F5E9'; // Light Green
            case 'Ready for pickup': return '#E0F7FA'; // Light Cyan
            case 'RTO - In Transit': return '#FFEBEE'; // Light Red
            default: return theme.colors.elevation.level2;
        }
    };

    const getStatusTextColor = (status) => {
        switch (status) {
            case 'Delivered': return '#2E7D32';
            case 'Ready for pickup': return '#0097A7';
            case 'RTO - In Transit': return '#C62828';
            default: return theme.colors.onSurface;
        }
    };

    return (
        <View style={styles.container}>
            {/* Header / Top Toolbar */}
            <View style={styles.header}>
                <View style={{ flex: 1 }}>
                    <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>All Shipments</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Showing 1 - 50 of 344</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button icon="download" mode="outlined" onPress={() => { }}>Download</Button>
                    <Button icon="plus" mode="contained" buttonColor="#000" onPress={() => { }}>Create Order</Button>
                </View>
            </View>

            {/* Filters Row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
                <Surface style={styles.searchContainer} elevation={0}>
                    <IconButton icon="magnify" size={20} style={{ margin: 0 }} />
                    <TextInput
                        placeholder="Search AWB..."
                        style={styles.searchInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        dense
                    />
                </Surface>

                <Menu
                    visible={statusFilterVisible}
                    onDismiss={() => setStatusFilterVisible(false)}
                    anchor={
                        <Button
                            mode="outlined"
                            icon="menu-down"
                            contentStyle={{ flexDirection: 'row-reverse' }}
                            onPress={() => setStatusFilterVisible(true)}
                        >
                            {selectedStatuses.length > 0 ? `${selectedStatuses.length} Statuses` : 'Shipment Status'}
                        </Button>
                    }
                >
                    {DELHIVERY_STATUSES.map(status => (
                        <Menu.Item
                            key={status}
                            onPress={() => toggleStatus(status)}
                            title={
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Checkbox status={selectedStatuses.includes(status) ? 'checked' : 'unchecked'} />
                                    <Text>{status}</Text>
                                </View>
                            }
                        />
                    ))}
                    <Divider />
                    <Menu.Item onPress={() => setStatusFilterVisible(false)} title="Done" titleStyle={{ textAlign: 'center', color: theme.colors.primary, fontWeight: 'bold' }} />
                </Menu>

                <Button mode="outlined" icon="menu-down" contentStyle={{ flexDirection: 'row-reverse' }} onPress={() => { }}>
                    Manifested Date
                </Button>
                <Button mode="outlined" icon="menu-down" contentStyle={{ flexDirection: 'row-reverse' }} onPress={() => { }}>
                    Pickup Location
                </Button>
            </ScrollView>

            {/* Main Data Table mimicking specific columns */}
            <Card style={styles.card} mode="outlined">
                <DataTable>
                    <DataTable.Header>
                        <DataTable.Title style={{ flex: 0.5 }}><Checkbox status="unchecked" /></DataTable.Title>
                        <DataTable.Title style={{ flex: 2 }}>Order ID & AWB</DataTable.Title>
                        <DataTable.Title style={{ flex: 1.5 }} numberOfLines={2}>Manifest Date</DataTable.Title>
                        <DataTable.Title style={{ flex: 1.5 }}>Status</DataTable.Title>
                        <DataTable.Title style={{ flex: 1.5 }}>Pickup</DataTable.Title>
                        <DataTable.Title numeric>Actions</DataTable.Title>
                    </DataTable.Header>

                    {orders.map((item) => (
                        <DataTable.Row key={item.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.surfaceVariant }}>
                            <DataTable.Cell style={{ flex: 0.5 }}><Checkbox status="unchecked" /></DataTable.Cell>

                            <DataTable.Cell style={{ flex: 2 }}>
                                <View style={{ justifyContent: 'center' }}>
                                    <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{item.id}</Text>
                                    <Text variant="bodySmall" style={{ marginTop: 2 }}>{item.awb}</Text>
                                </View>
                            </DataTable.Cell>

                            <DataTable.Cell style={{ flex: 1.5 }}>
                                <Text variant="bodySmall">{item.manifestDate}</Text>
                            </DataTable.Cell>

                            <DataTable.Cell style={{ flex: 1.5 }}>
                                <Chip
                                    textStyle={{ fontSize: 10, lineHeight: 14, color: getStatusTextColor(item.status) }}
                                    style={{ backgroundColor: getStatusColor(item.status), height: 24, borderRadius: 4 }}
                                >
                                    {item.status}
                                </Chip>
                            </DataTable.Cell>

                            <DataTable.Cell style={{ flex: 1.5 }}>
                                <View>
                                    <Text variant="bodySmall" numberOfLines={1}>{item.pickup}</Text>
                                </View>
                            </DataTable.Cell>

                            <DataTable.Cell numeric>
                                <IconButton icon="pencil-outline" size={20} onPress={() => { }} />
                            </DataTable.Cell>
                        </DataTable.Row>
                    ))}

                    <DataTable.Pagination
                        page={page}
                        numberOfPages={3}
                        onPageChange={(p) => setPage(p)}
                        label="1-50 of 344"
                        optionsPerPage={[50, 100]}
                        itemsPerPage={50}
                        setItemsPerPage={() => { }}
                        showFastPaginationControls
                        selectPageDropdownLabel={'Rows per page'}
                    />
                </DataTable>
            </Card>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        gap: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    filtersRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        paddingVertical: 8,
        height: 60, // Fixed height specifically for horizontal scroll stability
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        paddingRight: 8,
        width: 220,
        height: 40,
    },
    searchInput: {
        flex: 1,
        height: 40,
        backgroundColor: 'transparent',
        fontSize: 14,
    },
    card: {
        flex: 1, // Take remaining space
        borderRadius: 8,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#e0e0e0',
    }
});

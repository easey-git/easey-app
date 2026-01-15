import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, Button, DataTable, Chip, useTheme, Card, IconButton, ProgressBar } from 'react-native-paper';

export const XpressbeesView = () => {
    const theme = useTheme();

    // Data placeholders - Pending API Integration
    const [performance, setPerformance] = useState([]);
    const [orders, setOrders] = useState([]);

    return (
        <View style={styles.container}>
            {/* Header Actions */}
            <View style={styles.header}>
                <View>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>Xpressbees Logistics</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Enterprise Portal</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button mode="outlined" onPress={() => { }}>
                        Manifests
                    </Button>
                    <Button mode="contained" icon="plus" buttonColor="#1c3f94" onPress={() => { }}>
                        Create Order
                    </Button>
                </View>
            </View>

            {/* Performance Metrics */}
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
                <Card.Content>
                    <Text variant="titleMedium" style={{ marginBottom: 16 }}>Delivery Performance Today</Text>
                    {performance.map((metric, index) => (
                        <View key={index} style={{ marginBottom: 12 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text variant="bodyMedium">{metric.label}</Text>
                                <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>{(metric.value * 100).toFixed(0)}%</Text>
                            </View>
                            <ProgressBar progress={metric.value} color={metric.color} style={{ borderRadius: 4, height: 8 }} />
                        </View>
                    ))}
                </Card.Content>
            </Card>

            {/* Orders Table */}
            <Surface style={[styles.tableContainer, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="titleMedium">Active Shipments</Text>
                    <IconButton icon="magnify" size={20} />
                </View>
                <DataTable>
                    <DataTable.Header>
                        <DataTable.Title>AWB</DataTable.Title>
                        <DataTable.Title>Customer</DataTable.Title>
                        <DataTable.Title>State</DataTable.Title>
                        <DataTable.Title numeric>SLA</DataTable.Title>
                    </DataTable.Header>

                    {orders.map((item) => (
                        <DataTable.Row key={item.id} onPress={() => { }}>
                            <DataTable.Cell><Text style={{ color: '#1c3f94', fontWeight: 'bold' }}>{item.awb}</Text></DataTable.Cell>
                            <DataTable.Cell>{item.customer}</DataTable.Cell>
                            <DataTable.Cell>{item.status}</DataTable.Cell>
                            <DataTable.Cell numeric>
                                <Text style={{ color: item.sla === 'On Time' ? '#4CAF50' : '#FF9800' }}>{item.sla}</Text>
                            </DataTable.Cell>
                        </DataTable.Row>
                    ))}
                </DataTable>
            </Surface>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        gap: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    card: {
        borderRadius: 12,
    },
    tableContainer: {
        borderRadius: 12,
        overflow: 'hidden'
    }
});

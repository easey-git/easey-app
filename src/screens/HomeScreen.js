import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, useTheme, Card, Avatar, Button, Appbar, SegmentedButtons, Surface, Icon } from 'react-native-paper';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const HomeScreen = ({ navigation }) => {
    const theme = useTheme();
    const [timeRange, setTimeRange] = useState('today');
    const [stats, setStats] = useState({
        sales: 0,
        orders: 0,
        aov: 0,
        activeCarts: 0
    });
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const getStartDate = (range) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today

        if (range === 'today') return now;

        const date = new Date(now);
        if (range === 'week') {
            date.setDate(date.getDate() - 7);
        } else if (range === 'month') {
            date.setMonth(date.getMonth() - 1);
        }
        return date;
    };

    const fetchStats = useCallback(() => {
        setLoading(true);
        const startDate = getStartDate(timeRange);
        const startTimestamp = Timestamp.fromDate(startDate);

        // 1. Orders Query
        const ordersQuery = query(
            collection(db, "orders"),
            where("createdAt", ">=", startTimestamp),
            orderBy("createdAt", "desc")
        );

        const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
            let totalSales = 0;
            let totalOrders = snapshot.size;

            snapshot.forEach(doc => {
                const data = doc.data();
                totalSales += parseFloat(data.totalPrice || 0);
            });

            setStats(prev => ({
                ...prev,
                sales: totalSales,
                orders: totalOrders,
                aov: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0
            }));
            setLoading(false);
        });

        // 2. Active Carts Query (Last 24h)
        const cartsQuery = query(
            collection(db, "checkouts"),
            where("updatedAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))),
            orderBy("updatedAt", "desc")
        );

        const unsubCarts = onSnapshot(cartsQuery, (snapshot) => {
            // Filter for strictly "active" if needed, but for now count all recent checkouts
            // You might want to filter out 'converted' ones if you flag them
            setStats(prev => ({
                ...prev,
                activeCarts: snapshot.size
            }));
        });

        return () => {
            unsubOrders();
            unsubCarts();
        };
    }, [timeRange]);

    useEffect(() => {
        const unsubscribe = fetchStats();
        return () => unsubscribe && unsubscribe();
    }, [fetchStats]);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        fetchStats();
        setTimeout(() => setRefreshing(false), 1000);
    }, [fetchStats]);

    const menuItems = [
        {
            id: 1,
            title: 'Orders',
            subtitle: 'Manage Orders',
            icon: 'package-variant',
            screen: 'DatabaseManager', // Fixed Name
        },
        {
            id: 2,
            title: 'Analytics',
            subtitle: 'Sales Trends',
            icon: 'chart-bar',
            screen: 'Stats',
        },
        {
            id: 3,
            title: 'Settings',
            subtitle: 'App Configuration',
            icon: 'cog',
            screen: 'Settings',
        },
        {
            id: 4,
            title: 'Database',
            subtitle: 'Raw Data',
            icon: 'database',
            screen: 'FirestoreViewer',
        },
    ];

    return (
        <View style={[styles.container, { backgroundColor: '#000000' }]}>
            <Appbar.Header style={{ backgroundColor: '#000000', elevation: 0 }}>
                <Appbar.Content title="Dashboard" titleStyle={{ fontWeight: 'bold', fontSize: 24, color: '#ffffff' }} />
                <Avatar.Text size={36} label="MK" style={{ backgroundColor: '#333', marginRight: 16 }} color="#fff" />
            </Appbar.Header>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
            >
                {/* Date Filter - Minimalist */}
                <View style={{ marginBottom: 24 }}>
                    <SegmentedButtons
                        value={timeRange}
                        onValueChange={setTimeRange}
                        buttons={[
                            { value: 'today', label: 'Today' },
                            { value: 'week', label: '7 Days' },
                            { value: 'month', label: '30 Days' },
                        ]}
                        theme={{ colors: { secondaryContainer: '#333', onSecondaryContainer: '#fff', outline: '#333' } }}
                        style={{ backgroundColor: '#000' }}
                    />
                </View>

                {/* Stats Grid - Clean Black/Grey */}
                <View style={styles.statsGrid}>
                    <Surface style={styles.statCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#888' }}>Total Sales</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: '#fff', marginTop: 4 }}>
                            ₹{stats.sales.toLocaleString('en-IN')}
                        </Text>
                    </Surface>

                    <Surface style={styles.statCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#888' }}>Orders</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: '#fff', marginTop: 4 }}>
                            {stats.orders}
                        </Text>
                    </Surface>

                    <Surface style={styles.statCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#888' }}>AOV</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: '#fff', marginTop: 4 }}>
                            ₹{stats.aov.toLocaleString('en-IN')}
                        </Text>
                    </Surface>

                    <Surface style={styles.statCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#888' }}>Active Carts</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: '#fff', marginTop: 4 }}>
                            {stats.activeCarts}
                        </Text>
                    </Surface>
                </View>

                <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 16, marginTop: 8, color: '#fff' }}>Quick Actions</Text>

                <View style={styles.menuGrid}>
                    {menuItems.map((item) => (
                        <Surface
                            key={item.id}
                            style={styles.menuCard}
                            elevation={0}
                        >
                            <Button
                                mode="text"
                                contentStyle={{ height: 140, flexDirection: 'column', justifyContent: 'center' }}
                                onPress={() => navigation.navigate(item.screen)}
                                textColor="#fff"
                            >
                                <View style={{ alignItems: 'center' }}>
                                    <Icon source={item.icon} size={32} color="#fff" />
                                    <Text variant="titleMedium" style={{ fontWeight: 'bold', marginTop: 12, color: '#fff' }}>{item.title}</Text>
                                    <Text variant="bodySmall" style={{ color: '#888', marginTop: 4 }}>{item.subtitle}</Text>
                                </View>
                            </Button>
                        </Surface>
                    ))}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 32, justifyContent: 'center', opacity: 0.5 }}>
                    <Icon source="database" size={16} color="#666" />
                    <Text variant="bodySmall" style={{ marginLeft: 8, color: '#666' }}>Firestore Connected</Text>
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 32,
    },
    statCard: {
        width: '48%',
        padding: 20,
        borderRadius: 16,
        backgroundColor: '#1A1A1A', // Dark Grey
        borderWidth: 1,
        borderColor: '#333',
    },
    menuGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    menuCard: {
        width: '48%',
        borderRadius: 16,
        backgroundColor: '#1A1A1A',
        borderWidth: 1,
        borderColor: '#333',
        overflow: 'hidden',
    }
});

export default HomeScreen;

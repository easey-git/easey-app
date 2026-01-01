import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Image, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Text, useTheme, Card, Avatar, Button, Appbar, SegmentedButtons, Surface, Icon } from 'react-native-paper';
import { collection, query, where, onSnapshot, orderBy, Timestamp, getDocs, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useSound } from '../context/SoundContext';
import { ResponsiveContainer } from '../components/ResponsiveContainer';

const HomeScreen = ({ navigation }) => {
    const theme = useTheme();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768;
    const { playSound } = useSound();
    const prevOrdersRef = React.useRef(0);
    const [timeRange, setTimeRange] = useState('today');
    const [stats, setStats] = useState({
        sales: 0,
        orders: 0,
        aov: 0,
        activeCarts: 0
    });
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState({
        firestore: true, // Always true if we can query
        shiprocket: false,
        shopify: false
    });

    // Dynamic Card Widths
    const cardWidth = isDesktop ? '23.5%' : '48%';
    const menuCardWidth = isDesktop ? '23.5%' : '48%';

    // Check webhook health
    useEffect(() => {
        const checkWebhookHealth = async () => {
            try {
                // Check if we have recent Shiprocket data (last 24 hours)
                const shiprocketQuery = query(
                    collection(db, "checkouts"),
                    where("updatedAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))),
                    orderBy("updatedAt", "desc"),
                    limit(1)
                );

                const shiprocketSnapshot = await getDocs(shiprocketQuery);
                setConnectionStatus(prev => ({ ...prev, shiprocket: !shiprocketSnapshot.empty }));

                // Check if we have recent Shopify orders (last 24 hours)
                const shopifyQuery = query(
                    collection(db, "orders"),
                    where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))),
                    orderBy("createdAt", "desc"),
                    limit(1)
                );

                const shopifySnapshot = await getDocs(shopifyQuery);
                setConnectionStatus(prev => ({ ...prev, shopify: !shopifySnapshot.empty }));
            } catch (error) {

            }
        };

        checkWebhookHealth();
        // Re-check every 5 minutes
        const interval = setInterval(checkWebhookHealth, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

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
        prevOrdersRef.current = 0;
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

            // Play sound if new order detected
            if (!loading && totalOrders > prevOrdersRef.current && prevOrdersRef.current > 0) {
                playSound('ORDER_PLACED');
            }
            prevOrdersRef.current = totalOrders;

            setLoading(false);
            // Update Shopify status if we got data
            if (snapshot.size > 0) {
                setConnectionStatus(prev => ({ ...prev, shopify: true }));
            }
        });

        // 2. Active Carts Query (Last 24h)
        const cartsQuery = query(
            collection(db, "checkouts"),
            where("updatedAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))),
            orderBy("updatedAt", "desc")
        );

        const unsubCarts = onSnapshot(cartsQuery, (snapshot) => {
            let activeCount = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                const rawStage = data.latest_stage || '';
                const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date();
                const now = new Date();
                const diffMinutes = Math.abs(now.getTime() - updatedAt.getTime()) / (1000 * 60);

                const isOrdered = rawStage === 'ORDER_PLACED' || rawStage === 'PAYMENT_INITIATED' || rawStage === 'COMPLETED' || !!data.orderId;
                const isAbandoned = !isOrdered && (rawStage === 'CHECKOUT_ABANDONED' || data.eventType === 'ABANDONED' || diffMinutes > 10);

                if (!isOrdered && !isAbandoned) {
                    activeCount++;
                }
            });

            setStats(prev => ({
                ...prev,
                activeCarts: activeCount
            }));
            // Update Shiprocket status if we got data
            if (snapshot.size > 0) {
                setConnectionStatus(prev => ({ ...prev, shiprocket: true }));
            }
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
            title: 'Firebase',
            subtitle: 'Raw Data',
            icon: 'database',
            screen: 'DatabaseManager',
        },
        {
            id: 5,
            title: 'WhatsApp',
            subtitle: 'Automations',
            icon: 'whatsapp',
            screen: 'WhatsAppManager',
        },
        {
            id: 6,
            title: 'Campaigns',
            subtitle: 'Ad Manager',
            icon: 'bullhorn',
            screen: 'Campaigns',
        },
    ];

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ResponsiveContainer>
                <Appbar.Header style={{ backgroundColor: theme.colors.background, elevation: 0, height: 70, paddingHorizontal: 0 }}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', marginLeft: isDesktop ? 0 : -20 }}>
                        <Image
                            source={theme.dark ? require('../../logo/easey-white.png') : require('../../logo/easey-dark.png')}
                            style={{ width: 180, height: 60, resizeMode: 'contain' }}
                        />
                    </View>

                </Appbar.Header>

                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Date Filter - Minimalist */}
                    <View style={{ marginBottom: 24, width: isDesktop ? '50%' : '100%', alignSelf: isDesktop ? 'flex-start' : 'auto' }}>
                        <SegmentedButtons
                            value={timeRange}
                            onValueChange={setTimeRange}
                            buttons={[
                                { value: 'today', label: 'Today' },
                                { value: 'week', label: '7 Days' },
                                { value: 'month', label: '30 Days' },
                            ]}
                            style={{ backgroundColor: theme.colors.elevation.level1, borderRadius: 20 }}
                        />
                    </View>

                    {/* Stats Grid - Clean */}
                    <View style={styles.statsGrid}>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: cardWidth }]} elevation={0}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Total Sales</Text>
                            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                ₹{stats.sales.toLocaleString('en-IN')}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: cardWidth }]} elevation={0}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Orders</Text>
                            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                {stats.orders}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: cardWidth }]} elevation={0}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>AOV</Text>
                            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                ₹{stats.aov.toLocaleString('en-IN')}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: cardWidth }]} elevation={0}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Active Carts</Text>
                            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                {stats.activeCarts}
                            </Text>
                        </Surface>
                    </View>

                    <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 16, marginTop: 8, color: theme.colors.onBackground }}>Quick Actions</Text>

                    <View style={styles.menuGrid}>
                        {menuItems.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                onPress={() => navigation.navigate(item.screen)}
                                activeOpacity={0.7}
                                style={[styles.menuCard, { width: menuCardWidth }]}
                            >
                                <Surface
                                    style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: 16, overflow: 'hidden' }}
                                    elevation={0}
                                >
                                    <View style={{ alignItems: 'center', padding: 20 }}>
                                        <Avatar.Icon
                                            size={48}
                                            icon={item.icon}
                                            style={{ backgroundColor: 'transparent', marginBottom: 12 }}
                                            color={theme.colors.onSurfaceVariant}
                                        />
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>{item.title}</Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.7 }}>{item.subtitle}</Text>
                                    </View>
                                </Surface>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Connection Status Indicators */}
                    <View style={{ marginTop: 32, gap: 8, flexDirection: isDesktop ? 'row' : 'column', justifyContent: isDesktop ? 'space-between' : 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                            <Icon
                                source={connectionStatus.firestore ? "check-circle" : "alert-circle"}
                                size={16}
                                color={connectionStatus.firestore ? "#4ade80" : theme.colors.error}
                            />
                            <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.onBackground }}>
                                Firestore {connectionStatus.firestore ? "Connected" : "Disconnected"}
                            </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                            <Icon
                                source={connectionStatus.shiprocket ? "check-circle" : "alert-circle"}
                                size={16}
                                color={connectionStatus.shiprocket ? "#4ade80" : "#fbbf24"}
                            />
                            <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.onBackground }}>
                                Shiprocket {connectionStatus.shiprocket ? "Active" : "No Data (24h)"}
                            </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                            <Icon
                                source={connectionStatus.shopify ? "check-circle" : "alert-circle"}
                                size={16}
                                color={connectionStatus.shopify ? "#4ade80" : "#fbbf24"}
                            />
                            <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.onBackground }}>
                                Shopify {connectionStatus.shopify ? "Active" : "No Data (24h)"}
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </ResponsiveContainer>
        </View >
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
        // Width is now dynamic
        padding: 20,
        borderRadius: 16,
    },
    menuGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    menuCard: {
        // Width is now dynamic
        borderRadius: 16,
        overflow: 'hidden',
    }
});

export default HomeScreen;

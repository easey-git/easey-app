import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Text, useTheme, Surface, Icon, FAB, SegmentedButtons, Avatar, IconButton, Divider } from 'react-native-paper';
import { collection, query, where, onSnapshot, orderBy, Timestamp, getDocs, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { NotesCard } from '../components/NotesCard';
import { useSound } from '../context/SoundContext';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';

const HomeScreen = ({ navigation }) => {
    const theme = useTheme();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 1024;
    const { playSound } = useSound();
    const { hasPermission } = useAuth(); // Auth Hook
    const prevOrdersRef = React.useRef(0);
    const [timeRange, setTimeRange] = useState('today');
    const [stats, setStats] = useState({
        sales: 0,
        orders: 0,
        aov: 0,
        activeCarts: 0
    });
    const [workQueue, setWorkQueue] = useState({ pending: 0, confirmed: 0 });
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState({
        firestore: true,
        shiprocket: false,
        shopify: false
    });

    const menuCardWidth = isDesktop ? '23%' : '48%';

    // ... (Keep existing Listeners: useEffects for workQuery, checkWebhookHealth, fetchStats) ...
    // Listener for Action Items (Pending/Confirmed Orders)
    useEffect(() => {
        const workQuery = query(
            collection(db, "orders"),
            where("cod_status", "in", ["pending", "confirmed"])
        );

        const unsubscribe = onSnapshot(workQuery, (snapshot) => {
            let pending = 0;
            let confirmed = 0;
            snapshot.forEach(doc => {
                const s = doc.data().cod_status;
                if (s === 'pending') pending++;
                if (s === 'confirmed') confirmed++;
            });
            setWorkQueue({ pending, confirmed });
        });

        return () => unsubscribe();
    }, []);

    // Check webhook health
    useEffect(() => {
        const checkWebhookHealth = async () => {
            try {
                const shiprocketQuery = query(
                    collection(db, "checkouts"),
                    where("updatedAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))),
                    orderBy("updatedAt", "desc"),
                    limit(1)
                );

                const shiprocketSnapshot = await getDocs(shiprocketQuery);
                setConnectionStatus(prev => ({ ...prev, shiprocket: !shiprocketSnapshot.empty }));

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
        const interval = setInterval(checkWebhookHealth, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const getStartDate = (range) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

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

            if (!loading && totalOrders > prevOrdersRef.current && prevOrdersRef.current > 0) {
                playSound('ORDER_PLACED');
            }
            prevOrdersRef.current = totalOrders;

            setLoading(false);
            if (snapshot.size > 0) {
                setConnectionStatus(prev => ({ ...prev, shopify: true }));
            }
        });

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
        { id: 1, title: 'Orders', subtitle: 'Manage Orders', icon: 'package-variant', screen: 'DatabaseManager', permission: 'access_orders' },
        { id: 2, title: 'Analytics', subtitle: 'Sales Trends', icon: 'chart-bar', screen: 'Stats', permission: 'access_analytics' },
        { id: 3, title: 'Settings', subtitle: 'App Configuration', icon: 'cog', screen: 'Settings' }, // Everyone access
        { id: 8, title: 'Wallet', subtitle: 'Expenses & Income', icon: 'wallet-outline', screen: 'Wallet', permission: 'access_wallet' },
        { id: 4, title: 'Firebase', subtitle: 'Raw Data', icon: 'database', screen: 'DatabaseManager', permission: 'access_orders' },
        { id: 5, title: 'WhatsApp', subtitle: 'Automations', icon: 'whatsapp', screen: 'WhatsAppManager', permission: 'access_whatsapp' },
        { id: 6, title: 'Campaigns', subtitle: 'Ad Manager', icon: 'bullhorn', screen: 'Campaigns', permission: 'access_campaigns' },
        { id: 7, title: 'Notes', subtitle: 'Write Stuff', icon: 'notebook', screen: 'Notes' }, // Everyone access
    ];

    const visibleMenuItems = menuItems.filter(item => !item.permission || hasPermission(item.permission));

    return (
        <CRMLayout title="Overview" navigation={navigation} scrollable={true}>
            {/* Header Controls */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 24 }}>
                <SegmentedButtons
                    value={timeRange}
                    onValueChange={setTimeRange}
                    buttons={[
                        { value: 'today', label: 'Today' },
                        { value: 'week', label: '7 Days' },
                        { value: 'month', label: '30 Days' },
                    ]}
                    style={{ backgroundColor: theme.colors.elevation.level1, borderRadius: 20, minWidth: isDesktop ? 300 : '100%' }}
                />
            </View>

            {/* Stats Grid */}
            <View style={[styles.statsGrid, { gap: isDesktop ? 20 : 12 }]}>
                {hasPermission('view_financial_stats') && (
                    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: isDesktop ? undefined : '48%', flex: isDesktop ? 1 : undefined }]} elevation={0}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Total Sales</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                            ₹{stats.sales.toLocaleString('en-IN')}
                        </Text>
                    </Surface>
                )}

                {hasPermission('view_order_stats') && (
                    <>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: isDesktop ? undefined : '48%', flex: isDesktop ? 1 : undefined }]} elevation={0}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Orders</Text>
                            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                                {stats.orders}
                            </Text>
                        </Surface>

                        {/* Work Queue: Pending */}
                        <TouchableOpacity
                            style={{ width: isDesktop ? undefined : '48%', flex: isDesktop ? 1 : undefined }}
                            onPress={() => navigation.navigate('DatabaseManager', { collection: 'orders', filter: { field: 'cod_status', value: 'pending' } })}
                        >
                            <Surface style={[styles.statCard, { backgroundColor: theme.colors.errorContainer, width: '100%' }]} elevation={0}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text variant="labelMedium" style={{ color: theme.colors.onErrorContainer }}>Pending</Text>
                                    <Icon source="clock-alert-outline" size={16} color={theme.colors.onErrorContainer} />
                                </View>
                                <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onErrorContainer, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                                    {workQueue.pending}
                                </Text>
                            </Surface>
                        </TouchableOpacity>

                        {/* Work Queue: Confirmed */}
                        <TouchableOpacity
                            style={{ width: isDesktop ? undefined : '48%', flex: isDesktop ? 1 : undefined }}
                            onPress={() => navigation.navigate('DatabaseManager', { collection: 'orders', filter: { field: 'cod_status', value: 'confirmed' } })}
                        >
                            <Surface style={[styles.statCard, { backgroundColor: theme.colors.secondaryContainer, width: '100%' }]} elevation={0}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text variant="labelMedium" style={{ color: theme.colors.onSecondaryContainer }}>Confirmed</Text>
                                    <Icon source="check-circle-outline" size={16} color={theme.colors.onSecondaryContainer} />
                                </View>
                                <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSecondaryContainer, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                                    {workQueue.confirmed}
                                </Text>
                            </Surface>
                        </TouchableOpacity>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: isDesktop ? undefined : '48%', flex: isDesktop ? 1 : undefined }]} elevation={0}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Active Carts</Text>
                            <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                                {stats.activeCarts}
                            </Text>
                        </Surface>
                    </>
                )}

                {hasPermission('view_financial_stats') && (
                    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant, width: isDesktop ? undefined : '48%', flex: isDesktop ? 1 : undefined }]} elevation={0}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>AOV</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                            ₹{Math.round(stats.aov).toLocaleString('en-IN')}
                        </Text>
                    </Surface>
                )}
            </View>

            {/* Split Content for Desktop */}
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 24 : 16, alignItems: 'stretch' }}>
                {/* Main Work Area (Notes) */}
                <View style={isDesktop ? { flex: 2 } : { width: '100%' }}>
                    <NotesCard style={{ flex: 1, marginBottom: 0 }} />
                </View>

                {/* Sidebar / Widgets Area */}
                <View style={isDesktop ? { flex: 1 } : { width: '100%' }}>
                    {/* On Desktop, show System Status. On Mobile, show App Navigation Grid */}
                    {isDesktop ? (
                        <View style={{ flex: 1 }}>
                            {/* System Status Widget */}
                            <Surface style={{ padding: 24, borderRadius: 16, backgroundColor: theme.colors.surfaceVariant, flex: 1 }} elevation={0}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>System Status</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.outline, marginRight: 8 }}>
                                            {refreshing ? 'Checking...' : 'Live'}
                                        </Text>
                                        <IconButton icon="refresh" size={18} onPress={onRefresh} style={{ margin: 0 }} />
                                    </View>
                                </View>
                                <Divider style={{ marginBottom: 16 }} />
                                <View style={{ gap: 20 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Icon source={connectionStatus.firestore ? "database-check" : "database-off"} size={22} color={connectionStatus.firestore ? "#4ade80" : theme.colors.error} />
                                            <View style={{ marginLeft: 12 }}>
                                                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Database</Text>
                                                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Firestore Cloud</Text>
                                            </View>
                                        </View>
                                        <Text variant="labelSmall" style={{ color: connectionStatus.firestore ? "#4ade80" : theme.colors.error, fontWeight: 'bold' }}>
                                            {connectionStatus.firestore ? "Active" : "Down"}
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Icon source="truck-delivery" size={22} color={connectionStatus.shiprocket ? "#4ade80" : "#fbbf24"} />
                                            <View style={{ marginLeft: 12 }}>
                                                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Logistics</Text>
                                                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Shiprocket API</Text>
                                            </View>
                                        </View>
                                        <Text variant="labelSmall" style={{ color: connectionStatus.shiprocket ? "#4ade80" : "#fbbf24", fontWeight: 'bold' }}>
                                            {connectionStatus.shiprocket ? "Connected" : "Pending"}
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Icon source="store" size={22} color={connectionStatus.shopify ? "#4ade80" : "#fbbf24"} />
                                            <View style={{ marginLeft: 12 }}>
                                                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Storefront</Text>
                                                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Shopify Webhooks</Text>
                                            </View>
                                        </View>
                                        <Text variant="labelSmall" style={{ color: connectionStatus.shopify ? "#4ade80" : "#fbbf24", fontWeight: 'bold' }}>
                                            {connectionStatus.shopify ? "Synced" : "Waiting"}
                                        </Text>
                                    </View>
                                </View>
                            </Surface>


                        </View>
                    ) : (
                        <>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 16, marginTop: 8 }}>Apps</Text>
                            <View style={styles.menuGrid}>
                                {visibleMenuItems.map((item) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        onPress={() => navigation.navigate(item.screen)}
                                        activeOpacity={0.7}
                                        style={[styles.menuCard, { width: menuCardWidth }]}
                                    >
                                        <Surface style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: 16, overflow: 'hidden' }} elevation={0}>
                                            <View style={{ alignItems: 'center', padding: 20 }}>
                                                <Avatar.Icon size={48} icon={item.icon} style={{ backgroundColor: 'transparent', marginBottom: 12 }} color={theme.colors.onSurfaceVariant} />
                                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>{item.title}</Text>
                                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.7 }}>{item.subtitle}</Text>
                                            </View>
                                        </Surface>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}
                </View>
            </View>

            {/* AI Assistant FAB */}
            <FAB
                icon="auto-fix"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                color={theme.colors.onPrimary}
                onPress={() => navigation.navigate('Assistant')}
            />
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 32,
    },
    statCard: {
        padding: 20,
        borderRadius: 16,
    },
    menuGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    menuCard: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    fab: {
        position: 'absolute',
        margin: 24,
        right: 0,
        bottom: 0,
        borderRadius: 16,
        zIndex: 10
    }
});

export default HomeScreen;

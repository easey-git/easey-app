import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, useTheme, Surface, Icon, FAB, SegmentedButtons, IconButton, Divider } from 'react-native-paper';
import { collection, query, where, onSnapshot, orderBy, Timestamp, getDocs, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { NotesCard } from '../components/NotesCard';
import { useSound } from '../context/SoundContext';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { LAYOUT } from '../theme/layout';

const StatCard = ({ label, value, icon, color, onPress, theme }) => (
    <Surface style={[styles.card, { backgroundColor: color || theme.colors.surfaceVariant }]} elevation={0}>
        <TouchableOpacity onPress={onPress} disabled={!onPress} style={styles.cardContent}>
            <View style={styles.cardHeader}>
                <Text variant="labelMedium" style={{ color: color ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant, opacity: 0.8 }}>
                    {label}
                </Text>
                {icon && <Icon source={icon} size={20} color={color ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant} />}
            </View>
            <Text variant="displaySmall" style={{
                fontWeight: '700',
                color: color ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                marginTop: 8,
                fontSize: 28
            }} numberOfLines={1} adjustsFontSizeToFit>
                {value}
            </Text>
        </TouchableOpacity>
    </Surface>
);

const HomeScreen = ({ navigation }) => {
    const theme = useTheme();
    const { isDesktop, isTablet, spacing } = useResponsive();
    const { playSound } = useSound();
    const { hasPermission, isAdmin } = useAuth();
    const prevOrdersRef = React.useRef(0);
    const [timeRange, setTimeRange] = useState('today');
    const [stats, setStats] = useState({ sales: 0, orders: 0, aov: 0, activeCarts: 0 });
    const [workQueue, setWorkQueue] = useState({ pending: 0, confirmed: 0 });
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState({ firestore: true, shiprocket: false, shopify: false });

    // --- DATA FETCHING LOGIC ---
    useEffect(() => {
        const workQuery = query(collection(db, "orders"), where("cod_status", "in", ["pending", "confirmed"]));
        const unsubscribe = onSnapshot(workQuery, (snapshot) => {
            let pending = 0;
            let confirmed = 0;
            snapshot.forEach(doc => {
                const s = doc.data().cod_status;
                if (s === 'pending') pending++;
                if (s === 'confirmed') confirmed++;
            });
            setWorkQueue({ pending, confirmed });
        }, (error) => {
            console.log("WorkQueue Error:", error.code);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const checkWebhookHealth = async () => {
            try {
                const shiprocketQuery = query(collection(db, "checkouts"), where("updatedAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))), orderBy("updatedAt", "desc"), limit(1));
                const shiprocketSnapshot = await getDocs(shiprocketQuery);
                setConnectionStatus(prev => ({ ...prev, shiprocket: !shiprocketSnapshot.empty }));

                const shopifyQuery = query(collection(db, "orders"), where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))), orderBy("createdAt", "desc"), limit(1));
                const shopifySnapshot = await getDocs(shopifyQuery);
                setConnectionStatus(prev => ({ ...prev, shopify: !shopifySnapshot.empty }));
            } catch (error) { }
        };
        checkWebhookHealth();
        const interval = setInterval(checkWebhookHealth, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchStats = useCallback(() => {
        setLoading(true);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let startDate = now;
        if (timeRange === 'week') startDate = new Date(now.setDate(now.getDate() - 7));
        else if (timeRange === 'month') startDate = new Date(now.setMonth(now.getMonth() - 1));

        const startTimestamp = Timestamp.fromDate(startDate);
        const ordersQuery = query(collection(db, "orders"), where("createdAt", ">=", startTimestamp), orderBy("createdAt", "desc"));

        const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
            let totalSales = 0;
            let totalOrders = snapshot.size;
            snapshot.forEach(doc => { totalSales += parseFloat(doc.data().totalPrice || 0); });
            setStats(prev => ({ ...prev, sales: totalSales, orders: totalOrders, aov: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0 }));
            if (!loading && totalOrders > prevOrdersRef.current && prevOrdersRef.current > 0) playSound('ORDER_PLACED');
            prevOrdersRef.current = totalOrders;
            setLoading(false);
            if (snapshot.size > 0) setConnectionStatus(prev => ({ ...prev, shopify: true }));
        }, (error) => {
            console.log("Orders Stats Error:", error.code);
            setLoading(false);
        });

        const cartsQuery = query(collection(db, "checkouts"), where("updatedAt", ">=", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))), orderBy("updatedAt", "desc"));
        const unsubCarts = onSnapshot(cartsQuery, (snapshot) => {
            let activeCount = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                const rawStage = data.latest_stage || '';
                const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date();
                const diffMinutes = Math.abs(new Date().getTime() - updatedAt.getTime()) / (1000 * 60);
                const isOrdered = ['ORDER_PLACED', 'PAYMENT_INITIATED', 'COMPLETED'].includes(rawStage) || !!data.orderId;
                const isAbandoned = !isOrdered && (rawStage === 'CHECKOUT_ABANDONED' || data.eventType === 'ABANDONED' || diffMinutes > 10);
                if (!isOrdered && !isAbandoned) activeCount++;
            });
            setStats(prev => ({ ...prev, activeCarts: activeCount }));
            if (snapshot.size > 0) setConnectionStatus(prev => ({ ...prev, shiprocket: true }));
        }, (error) => {
            console.log("Carts Stats Error:", error.code);
        });

        return () => { unsubOrders(); unsubCarts(); };
    }, [timeRange]);

    useEffect(() => { const unsubscribe = fetchStats(); return () => unsubscribe && unsubscribe(); }, [fetchStats]);

    const onRefresh = React.useCallback(() => { setRefreshing(true); fetchStats(); setTimeout(() => setRefreshing(false), 1000); }, [fetchStats]);

    // --- RENDER HELPERS ---
    const SystemStatusWidget = ({ style }) => (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant, padding: 0 }, style]} elevation={0}>
            <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>System Status</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.outline, marginRight: 8 }}>
                        {refreshing ? '...' : 'Live'}
                    </Text>
                    <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
                        <Icon source="refresh" size={18} color={refreshing ? theme.colors.outline : theme.colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
                {[
                    { label: 'Database', status: connectionStatus.firestore, icon: 'database' },
                    { label: 'Logistics', status: connectionStatus.shiprocket, icon: 'truck-delivery' },
                    { label: 'Storefront', status: connectionStatus.shopify, icon: 'store' }
                ].map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Icon source={item.icon} size={18} color={theme.colors.onSurfaceVariant} />
                            <Text variant="bodySmall">{item.label}</Text>
                        </View>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.status ? '#4ade80' : theme.colors.error }} />
                    </View>
                ))}
            </View>
        </Surface>
    );

    // --- DESKTOP LAYOUT ---
    const DesktopLayout = () => (
        <View style={{ gap: 24 }}>
            {/* Header Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                    <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>Dashboard</Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.outline }}>Welcome back, Mackruize</Text>
                </View>
                <SegmentedButtons
                    value={timeRange}
                    onValueChange={setTimeRange}
                    buttons={[{ value: 'today', label: 'Today' }, { value: 'week', label: '7 Days' }, { value: 'month', label: '30 Days' }]}
                    style={{ minWidth: 320 }}
                />
            </View>

            {/* Main Stats Row - 6 Columns */}
            {/* Main Stats Row - 6 Columns */}
            <View style={{ flexDirection: 'row', gap: 16 }}>
                {hasPermission('view_financial_stats') && <View style={{ flex: 1 }}><StatCard label="Total Sales" value={`₹${stats.sales.toLocaleString('en-IN')}`} icon="currency-inr" theme={theme} /></View>}
                {hasPermission('view_order_stats') && <View style={{ flex: 1 }}><StatCard label="Orders" value={stats.orders} icon="package-variant" theme={theme} /></View>}
                {hasPermission('view_order_stats') && <View style={{ flex: 1 }}><StatCard label="Pending" value={workQueue.pending} icon="clock-alert-outline" color={theme.colors.errorContainer} onPress={() => navigation.navigate('DatabaseManager', { collection: 'orders', filter: { field: 'cod_status', value: 'pending' } })} theme={theme} /></View>}
                {hasPermission('view_order_stats') && <View style={{ flex: 1 }}><StatCard label="Confirmed" value={workQueue.confirmed} icon="check-circle-outline" color={theme.colors.secondaryContainer} onPress={() => navigation.navigate('DatabaseManager', { collection: 'orders', filter: { field: 'cod_status', value: 'confirmed' } })} theme={theme} /></View>}
                {hasPermission('view_financial_stats') && <View style={{ flex: 1 }}><StatCard label="Active Carts" value={stats.activeCarts} icon="cart-outline" theme={theme} /></View>}
                {hasPermission('view_financial_stats') && <View style={{ flex: 1 }}><StatCard label="AOV" value={`₹${stats.aov}`} icon="chart-line" theme={theme} /></View>}
            </View>


            {/* Bottom Section - Aligned */}
            <View style={{ flexDirection: 'row', gap: 24, alignItems: 'stretch' }}>
                <View style={{ flex: 2 }}>
                    <NotesCard style={{ minHeight: 220, flex: 1, marginBottom: 0 }} />
                </View>
                <View style={{ flex: 1 }}>
                    <SystemStatusWidget style={{ flex: 1 }} />
                </View>
            </View>
        </View >
    );

    // --- MOBILE LAYOUT ---
    const MobileLayout = () => (
        <View style={{ gap: 16 }}>
            <SegmentedButtons
                value={timeRange}
                onValueChange={setTimeRange}
                buttons={[{ value: 'today', label: 'Today' }, { value: 'week', label: '7 Days' }, { value: 'month', label: '30 Days' }]}
                style={{ marginBottom: 8 }}
                density="small"
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
                {hasPermission('view_financial_stats') && <View style={{ flex: 1 }}><StatCard label="Total Sales" value={`₹${stats.sales.toLocaleString('en-IN')}`} icon="currency-inr" theme={theme} /></View>}
                {hasPermission('view_order_stats') && <View style={{ flex: 1 }}><StatCard label="Orders" value={stats.orders} icon="package-variant" theme={theme} /></View>}
            </View>

            {hasPermission('view_order_stats') && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><StatCard label="Pending" value={workQueue.pending} color={theme.colors.errorContainer} onPress={() => navigation.navigate('DatabaseManager', { collection: 'orders', filter: { field: 'cod_status', value: 'pending' } })} theme={theme} /></View>
                    <View style={{ flex: 1 }}><StatCard label="Confirmed" value={workQueue.confirmed} color={theme.colors.secondaryContainer} onPress={() => navigation.navigate('DatabaseManager', { collection: 'orders', filter: { field: 'cod_status', value: 'confirmed' } })} theme={theme} /></View>
                </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
                {hasPermission('view_financial_stats') && <View style={{ flex: 1 }}><StatCard label="Active Carts" value={stats.activeCarts} icon="cart-outline" theme={theme} /></View>}
                {hasPermission('view_financial_stats') && <View style={{ flex: 1 }}><StatCard label="AOV" value={`₹${stats.aov}`} icon="chart-line" theme={theme} /></View>}
            </View>

            <Divider style={{ marginVertical: 8 }} />

            <NotesCard style={{ minHeight: 200 }} />
            <SystemStatusWidget />
            <View style={{ height: 80 }} />
        </View>
    );

    return (
        <CRMLayout
            title="Overview"
            navigation={navigation}
            scrollable={true}
            showHeader={!isDesktop}
            floatingButton={
                <FAB
                    icon="auto-fix"
                    style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                    color={theme.colors.onPrimary}
                    onPress={() => navigation.navigate('Assistant')}
                />
            }
        >
            {isDesktop ? <DesktopLayout /> : <MobileLayout />}
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    cardContent: {
        padding: 16,
        height: 110, // Fixed height for consistency
        justifyContent: 'space-between'
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
        borderRadius: 16,
        zIndex: 10
    }
});

export default HomeScreen;

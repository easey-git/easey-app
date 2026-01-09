import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, RefreshControl, Image, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Text, Surface, ActivityIndicator, Icon, List, Divider, Avatar, useTheme, Button, Chip, Portal, Dialog, ProgressBar } from 'react-native-paper';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { collection, query, orderBy, onSnapshot, limit, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCachedAnalytics } from '../services/ga4Service';
import { useSound } from '../context/SoundContext';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';
// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const StatsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission } = useAuth();

    if (!hasPermission('access_analytics')) {
        return <AccessDenied title="Analytics Restricted" message="You need permission to view analytics." />;
    }

    const { playSound } = useSound();
    const screenWidth = Dimensions.get('window').width;
    const [loading, setLoading] = useState(true);
    const [todaysSales, setTodaysSales] = useState(0);
    const [activeCarts, setActiveCarts] = useState(0);
    const [ga4Analytics, setGa4Analytics] = useState({
        overview: {
            activeUsers: 0,
            pageViews: 0,
            events: 0,
            avgSessionDuration: 0
        },
        devices: { desktop: 0, mobile: 0, tablet: 0 },
        locations: [],
        topPages: [],
        topEvents: []
    });
    const [ga4Error, setGa4Error] = useState(null);
    const [recentActivity, setRecentActivity] = useState([]);
    const [rawOrders, setRawOrders] = useState([]);
    const [rawCheckouts, setRawCheckouts] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    // Refs for sound logic
    const lastMaxTimestampRef = React.useRef(0);
    const isFirstLoadRef = React.useRef(true);

    const [chartData, setChartData] = useState({
        labels: ["12am", "2am", "4am", "6am", "8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"],
        datasets: [{ data: new Array(12).fill(0) }]
    });

    useEffect(() => {
        // Get today's date at midnight in local timezone (IST)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. Listen to ORDERS for Revenue & Chart (Continuous Timeline)
        const qOrders = query(
            collection(db, "orders"),
            orderBy("createdAt", "desc"),
            limit(100)
        );

        const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
            let todayTotal = 0;
            setRawOrders(snapshot.docs);
            const buckets = {};

            snapshot.docs.forEach((doc) => {
                const data = doc.data();
                const orderDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                const price = parseFloat(data.totalPrice || 0);

                if (orderDate >= todayStart) {
                    todayTotal += price;
                }

                const hour = orderDate.getHours();
                const bucketHour = Math.floor(hour / 2) * 2;
                const dateStr = orderDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                const timeStr = new Date(orderDate.setHours(bucketHour, 0, 0, 0)).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).toLowerCase();
                const key = `${dateStr} ${timeStr}`;

                if (!buckets[key]) {
                    buckets[key] = {
                        total: 0,
                        count: 0,
                        timestamp: orderDate.setHours(bucketHour, 0, 0, 0),
                        label: timeStr,
                        fullLabel: key
                    };
                }

                buckets[key].total += price;
                buckets[key].count += 1;
            });

            const sortedBuckets = Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);

            if (sortedBuckets.length === 0) {
                sortedBuckets.push({
                    total: 0,
                    count: 0,
                    label: 'Now',
                    fullLabel: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                });
            }

            setTodaysSales(todayTotal);
            setChartData({
                labels: sortedBuckets.map(b => b.label),
                fullLabels: sortedBuckets.map(b => b.fullLabel),
                datasets: [{
                    data: sortedBuckets.map(b => b.total),
                    orderCounts: sortedBuckets.map(b => b.count),
                }]
            });
        });

        // 2. Listen to CHECKOUTS for Active/Abandoned counts & Feed
        const qCheckouts = query(
            collection(db, "checkouts"),
            orderBy("updatedAt", "desc"),
            limit(100)
        );

        const unsubscribeCheckouts = onSnapshot(qCheckouts, (snapshot) => {
            setRawCheckouts(snapshot.docs);

            // Industry Standard Active Cart Calculation
            const now = new Date();
            const uniqueSessions = new Set();

            snapshot.docs.forEach(doc => {
                const data = doc.data();

                // 1. Time Check (30m window standard for "Active")
                const lastActive = data.updatedAt?.toDate ? data.updatedAt.toDate() : now;
                const diffMinutes = (now - lastActive) / (1000 * 60);
                if (diffMinutes > 30) return;

                // 2. Status Check (Exclude explicit Abandoned)
                if (data.eventType === 'ABANDONED' || data.latest_stage === 'CHECKOUT_ABANDONED') return;

                // 3. Identity Resolution (Deduplication)
                // Use the most specific ID available to group events
                const uniqueId = data.cart_token || data.checkout_token || data.id || data.cart_id || data.phoneNormalized || data.email || doc.id;

                if (uniqueId) {
                    uniqueSessions.add(uniqueId);
                }
            });

            setActiveCarts(uniqueSessions.size);
            setLoading(false);
        });

        return () => {
            unsubscribeOrders();
            unsubscribeCheckouts();
        };
    }, []);

    // NEW: Combined Feed Processor (Orders + Checkouts)
    useEffect(() => {
        const updateFeed = () => {
            const now = new Date();
            const combined = [];
            const WINDOW_MINUTES = 2; // Strict 2 min window

            // 1. Process Orders
            if (rawOrders) {
                rawOrders.forEach(doc => {
                    const data = doc.data();
                    const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                    const diff = (now - date) / 1000 / 60;
                    if (diff <= WINDOW_MINUTES) {
                        combined.push({
                            id: doc.id,
                            ...data,
                            status: 'ORDER PLACED',
                            jsDate: date,
                            customerName: data.customerName || 'Customer',
                            totalPrice: data.totalPrice,
                            isOrder: true
                        });
                    }
                });
            }

            // 2. Process Checkouts (Active/Abandoned)
            if (rawCheckouts) {
                rawCheckouts.forEach(doc => {
                    const data = doc.data();
                    const date = data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date();
                    const diff = (now - date) / 1000 / 60;

                    if (diff <= WINDOW_MINUTES) {
                        const stage = data.eventType === 'ABANDONED' ? 'ABANDONED' : (data.stage || 'ACTIVE');
                        combined.push({
                            id: doc.id,
                            ...data,
                            status: stage,
                            jsDate: date,
                            isOrder: false
                        });
                    }
                });
            }

            // 3. Sort & Set
            combined.sort((a, b) => b.jsDate - a.jsDate);

            // Audio Cue
            const currentMax = combined.length > 0 ? combined[0].jsDate.getTime() : 0;
            if (!isFirstLoadRef.current && currentMax > lastMaxTimestampRef.current) {
                playSound('LIVE_FEED');
            }
            lastMaxTimestampRef.current = currentMax;
            isFirstLoadRef.current = false;

            // Animation
            LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
            setRecentActivity(combined);
        };

        const interval = setInterval(updateFeed, 1000);
        updateFeed();

        return () => clearInterval(interval);
    }, [rawOrders, rawCheckouts]);

    // Fetch Comprehensive GA4 Analytics (Standardized Interval of 1 min for full refresh)
    useEffect(() => {
        const fetchGA4Analytics = async () => {
            try {
                const data = await getCachedAnalytics();
                if (data && data.overview) {
                    setGa4Analytics(data);
                    setGa4Error(null);
                } else {
                    setGa4Error('Invalid structure');
                }
            } catch (error) {
                console.error('Error fetching GA4 analytics:', error);
                setGa4Error(error.message);
            }
        };

        fetchGA4Analytics();
        const ga4Interval = setInterval(fetchGA4Analytics, 60000);
        return () => clearInterval(ga4Interval);
    }, []);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    // Format helpers
    const formatDuration = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    const getRelativeTime = (date) => {
        if (!date) return '';
        const now = new Date();
        const diffSeconds = Math.floor((now - date) / 1000);
        if (diffSeconds < 15) return 'Just now';
        if (diffSeconds < 60) return `${diffSeconds}s ago`;
        if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStageConfig = (status) => {
        const s = (status || '').toUpperCase();
        if (s.includes('ABANDONED')) return { icon: 'cart-off', color: theme.colors.error, bg: theme.colors.errorContainer };
        if (s.includes('ORDER') || s.includes('COMPLETED')) return { icon: 'check-circle', color: theme.colors.primary, bg: theme.colors.primaryContainer };
        if (s.includes('PAYMENT')) return { icon: 'credit-card', color: '#2563eb', bg: '#dbeafe' };
        if (s.includes('SHIP')) return { icon: 'truck', color: '#d97706', bg: '#fef3c7' };
        return { icon: 'cart-outline', color: theme.colors.secondary, bg: theme.colors.secondaryContainer };
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <CRMLayout title="Overview" navigation={navigation} scrollable={true} fullWidth={true}>
            {/* 1. HERO METRICS */}
            <View style={styles.sectionContainer}>
                <View style={styles.gridContainer}>
                    {/* Revenue */}
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <View style={[styles.iconBox, { backgroundColor: theme.colors.primaryContainer }]}>
                                <Icon source="currency-inr" size={20} color={theme.colors.onPrimaryContainer} />
                            </View>
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.primary }}>REVENUE</Text>
                        </View>
                        <Text variant="displaySmall" style={{ fontWeight: 'bold' }}>₹{todaysSales.toLocaleString()}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Today's Sales</Text>
                    </Surface>

                    {/* Active Visitors */}
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <View style={[styles.iconBox, { backgroundColor: '#dcfce7' }]}>
                                <Icon source="account-group" size={20} color="#166534" />
                            </View>
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: '#166534' }}>VISITORS</Text>
                        </View>
                        <Text variant="displaySmall" style={{ fontWeight: 'bold' }}>
                            {ga4Analytics?.overview?.activeUsers ?? 0}
                        </Text>
                        {/* Pulse Dot */}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginRight: 4 }} />
                            <Text variant="bodySmall" style={{ color: '#22c55e', fontWeight: 'bold' }}>Live on Site</Text>
                        </View>
                    </Surface>
                </View>

                <View style={[styles.gridContainer, { marginTop: 12 }]}>
                    {/* Active Carts */}
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <View style={[styles.iconBox, { backgroundColor: '#ffedd5' }]}>
                                <Icon source="cart-outline" size={20} color="#c2410c" />
                            </View>
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: '#c2410c' }}>ACTIVE CARTS</Text>
                        </View>
                        <Text variant="displaySmall" style={{ fontWeight: 'bold' }}>{activeCarts}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Potential Orders</Text>
                    </Surface>

                    {/* Events / Engagement */}
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <View style={[styles.iconBox, { backgroundColor: '#f3e8ff' }]}>
                                <Icon source="cursor-default-click-outline" size={20} color="#7e22ce" />
                            </View>
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: '#7e22ce' }}>EVENTS</Text>
                        </View>
                        <Text variant="displaySmall" style={{ fontWeight: 'bold' }}>
                            {ga4Analytics?.overview?.eventCount ?? 0}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Last 30m Actions</Text>
                    </Surface>
                </View>
            </View>

            {/* 2. SALES TREND CHART */}
            <Surface style={[styles.chartContainer, { backgroundColor: theme.colors.surface }]} elevation={0}>
                <View style={{ padding: 16 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Sales Performance</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Hourly breakdown of today's revenue</Text>
                </View>
                <LineChart
                    data={(chartData.datasets[0]?.data || [0]).map((value, index) => ({
                        value: value,
                        label: chartData.labels?.[index] || '',
                        labelTextStyle: { color: theme.colors.outline, fontSize: 10 },
                        orderCount: chartData.datasets[0]?.orderCounts?.[index] || 0,
                        dateLabel: chartData.fullLabels?.[index] || ''
                    }))}
                    height={180}
                    width={screenWidth - 40}
                    thickness={3}
                    color={theme.colors.primary}
                    startFillColor={theme.colors.primary}
                    endFillColor={theme.colors.background}
                    startOpacity={0.2}
                    endOpacity={0.0}
                    spacing={60}
                    initialSpacing={20}
                    noOfSections={4}
                    yAxisColor="transparent"
                    xAxisColor="transparent"
                    yAxisTextStyle={{ color: theme.colors.outline, fontSize: 10 }}
                    rulesType="dashed"
                    rulesColor={theme.colors.outlineVariant}
                    hideDataPoints={false}
                    dataPointsColor={theme.colors.primary}
                    curved
                    areaChart
                    pointerConfig={{
                        pointerStripHeight: 160,
                        pointerStripColor: theme.colors.primary,
                        pointerColor: theme.colors.primary,
                        radius: 6,
                        pointerLabelWidth: 120,
                        pointerLabelHeight: 90,
                        activatePointersOnLongPress: true,
                        autoAdjustPointerLabelPosition: true,
                        pointerLabelComponent: items => {
                            const item = items[0];
                            return (
                                <View style={{ height: 90, width: 120, justifyContent: 'center', backgroundColor: theme.colors.inverseSurface, borderRadius: 8, padding: 8 }}>
                                    <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 10, textAlign: 'center', opacity: 0.8, marginBottom: 2 }}>
                                        {item.dateLabel.replace(item.label, '').trim()}
                                    </Text>
                                    <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 14, fontWeight: 'bold', textAlign: 'center' }}>
                                        ₹{Math.round(item.value).toLocaleString()}
                                    </Text>
                                    <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 10, textAlign: 'center', marginTop: 2, fontWeight: 'bold' }}>
                                        {item.orderCount} {item.orderCount === 1 ? 'Order' : 'Orders'}
                                    </Text>
                                </View>
                            );
                        },
                    }}
                />
            </Surface>

            {/* 3. USER DEMOGRAPHICS */}
            <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 12 }}>Audience Insights</Text>

                {/* Device Breakdown - Centered & Full Width */}
                <Surface style={[styles.insightCard, { backgroundColor: theme.colors.surface, width: '100%', alignItems: 'center' }]} elevation={0}>
                    <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 10 }}>
                        <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>Devices</Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
                        <PieChart
                            data={[
                                { value: ga4Analytics.devices.mobile || 1, color: '#10b981' },
                                { value: ga4Analytics.devices.desktop || 1, color: '#3b82f6' },
                                { value: ga4Analytics.devices.tablet || 1, color: '#f59e0b' }
                            ]}
                            donut
                            radius={70}
                            innerRadius={50}
                        />
                        <View style={{ marginLeft: 40 }}>
                            <View style={[styles.legendRow, { marginBottom: 12 }]}>
                                <View style={[styles.dot, { backgroundColor: '#10b981', width: 12, height: 12, borderRadius: 6 }]} />
                                <Text variant="bodyMedium">Mobile ({ga4Analytics.devices.mobile})</Text>
                            </View>
                            <View style={[styles.legendRow, { marginBottom: 12 }]}>
                                <View style={[styles.dot, { backgroundColor: '#3b82f6', width: 12, height: 12, borderRadius: 6 }]} />
                                <Text variant="bodyMedium">Desktop ({ga4Analytics.devices.desktop})</Text>
                            </View>
                            <View style={[styles.legendRow, { marginBottom: 12 }]}>
                                <View style={[styles.dot, { backgroundColor: '#f59e0b', width: 12, height: 12, borderRadius: 6 }]} />
                                <Text variant="bodyMedium">Tablet ({ga4Analytics.devices.tablet})</Text>
                            </View>
                        </View>
                    </View>
                </Surface>
            </View>

            {/* 4. USER BEHAVIOR & LISTS */}
            <View style={{ paddingHorizontal: 16, marginTop: 24, gap: 16 }}>

                {/* Top Events (New Feature) */}
                <Surface style={styles.listCard} elevation={0}>
                    <View style={styles.cardHeader}>
                        <Icon source="flash" size={18} color="#f59e0b" />
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Top Events</Text>
                    </View>
                    {ga4Analytics.topEvents && ga4Analytics.topEvents.length > 0 ? (
                        ga4Analytics.topEvents.slice(0, 5).map((event, index) => (
                            <View key={index} style={styles.listItem}>
                                <Text variant="bodyMedium" style={{ flex: 1 }}>{event.name}</Text>
                                <Chip compact style={{ height: 24 }} textStyle={{ fontSize: 10, lineHeight: 12 }}>{event.count}</Chip>
                            </View>
                        ))
                    ) : (
                        <Text style={{ padding: 16, color: theme.colors.outline }}>No events recorded</Text>
                    )}
                </Surface>

                {/* Top Pages */}
                <Surface style={styles.listCard} elevation={0}>
                    <View style={styles.cardHeader}>
                        <Icon source="file-document" size={18} color="#3b82f6" />
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Popular Pages</Text>
                    </View>
                    {ga4Analytics.topPages.length > 0 ? (
                        ga4Analytics.topPages.slice(0, 5).map((page, index) => (
                            <View key={index} style={styles.listItem}>
                                <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1, marginRight: 8 }}>{page.page}</Text>
                                <Text variant="labelSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>{page.views} views</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ padding: 16, color: theme.colors.outline }}>No page views</Text>
                    )}
                </Surface>

                {/* Top Locations */}
                <Surface style={styles.listCard} elevation={0}>
                    <View style={styles.cardHeader}>
                        <Icon source="earth" size={18} color="#10b981" />
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Top Locations</Text>
                    </View>
                    {ga4Analytics.locations.length > 0 ? (
                        ga4Analytics.locations.slice(0, 5).map((loc, index) => (
                            <View key={index} style={styles.listItem}>
                                <Text variant="bodyMedium" style={{ flex: 1 }}>{loc.city}, {loc.country}</Text>
                                <Text variant="labelSmall" style={{ fontWeight: 'bold' }}>{loc.users} users</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ padding: 16, color: theme.colors.outline }}>No location data</Text>
                    )}
                </Surface>

            </View>

            {/* 5. LIVE FEEDS (Firebase) */}
            <View style={{ marginTop: 24, paddingBottom: 40 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Live Checkout Feed</Text>
                    <Button
                        compact
                        mode="text"
                        onPress={() => navigation.navigate('DatabaseManager', { collection: 'checkouts' })}
                    >
                        History
                    </Button>
                </View>

                {recentActivity.map((item) => (
                    <View key={item.id} style={{ overflow: 'hidden' }}>
                        <List.Item
                            title={item.customerName || item.first_name || item.phone || 'Visitor'}
                            titleStyle={{ fontWeight: 'bold', fontSize: 15 }}
                            descriptionStyle={{ fontSize: 13 }}
                            style={{ paddingHorizontal: 16, backgroundColor: theme.colors.background }}
                            description={() => (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                                    {(() => {
                                        const config = getStageConfig(item.status);
                                        return (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: config.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                                <Icon source={config.icon} size={12} color={config.color} />
                                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: config.color, marginLeft: 4, textTransform: 'uppercase' }}>
                                                    {item.status || 'Active'}
                                                </Text>
                                            </View>
                                        );
                                    })()}
                                    <Text style={{ fontSize: 11, marginLeft: 8, color: theme.colors.outline, fontStyle: 'italic' }}>
                                        {getRelativeTime(item.jsDate)}
                                    </Text>
                                </View>
                            )}
                            left={props => <Avatar.Text {...props} size={42} label={(item.customerName || 'G').charAt(0).toUpperCase()} />}
                            right={props => (
                                <View style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
                                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                                        ₹{item.totalPrice || item.total_price || item.amount || 0}
                                    </Text>
                                </View>
                            )}
                            onPress={() => {
                                setSelectedDoc(item);
                                setModalVisible(true);
                            }}
                        />
                        <Divider style={{ marginLeft: 72 }} />
                    </View>
                ))}
            </View>

            {/* Document Details Modal (Unchanged Layout) */}
            <Portal>
                <Dialog visible={modalVisible} onDismiss={() => setModalVisible(false)} style={{ maxHeight: '85%' }}>
                    <Dialog.Title>Checkout Details</Dialog.Title>
                    <Dialog.ScrollArea style={{ maxHeight: 400, paddingHorizontal: 0 }}>
                        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}>
                            {selectedDoc && (
                                <View>
                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Customer</Text>
                                        <Text variant="bodyLarge">{selectedDoc.customerName || selectedDoc.first_name || selectedDoc.phone || 'Visitor'}</Text>
                                    </View>
                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Status</Text>
                                        <Chip compact style={{ alignSelf: 'flex-start' }}>{selectedDoc.status}</Chip>
                                    </View>
                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Total Amount</Text>
                                        <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>₹{selectedDoc.totalPrice || selectedDoc.cart?.totalPrice || selectedDoc.total_price || 0}</Text>
                                    </View>
                                    {(() => {
                                        const items = selectedDoc.items || selectedDoc.line_items || selectedDoc.cart?.items || [];
                                        if (items.length > 0) {
                                            return (
                                                <View>
                                                    <Text variant="labelSmall" style={{ color: theme.colors.outline, marginBottom: 8 }}>Items</Text>
                                                    {items.map((item, index) => (
                                                        <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                                                            <Text variant="bodyMedium" style={{ flex: 1 }}>{item.name || item.title || 'Unknown Item'}</Text>
                                                            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>x{item.quantity || 1}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            );
                                        }
                                        return null;
                                    })()}
                                </View>
                            )}
                        </ScrollView>
                    </Dialog.ScrollArea>
                    <Dialog.Actions>
                        <Button onPress={() => setModalVisible(false)}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    sectionContainer: { marginTop: 16, paddingHorizontal: 16 },
    gridContainer: { flexDirection: 'row', gap: 12 },
    card: {
        flex: 1,
        borderRadius: 16,
        padding: 16,
        justifyContent: 'center'
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chartContainer: {
        margin: 16,
        borderRadius: 16,
        paddingBottom: 16,
        overflow: 'hidden'
    },
    insightCard: {
        borderRadius: 16,
        padding: 16,
        paddingRight: 24,
        minWidth: 280,
    },
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6
    },
    listCard: {
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)' // subtle transparency if dark mode, else default surface
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingBottom: 8
    },
    listItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderTopWidth: 0.5,
        borderTopColor: 'rgba(128,128,128, 0.2)'
    }
});

export default StatsScreen;

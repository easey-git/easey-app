import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, RefreshControl } from 'react-native';
import { Text, Surface, ActivityIndicator, Icon, List, Divider, Avatar, useTheme, Button, Chip, Portal, Dialog, ProgressBar } from 'react-native-paper';
import { LineChart } from 'react-native-gifted-charts';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCachedAnalytics } from '../services/ga4Service';
import { useSound } from '../context/SoundContext';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

const StatsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission, isAdmin } = useAuth();

    if (!hasPermission('access_analytics')) {
        return <AccessDenied title="Analytics Restricted" message="You need permission to view analytics." />;
    }

    const { playSound } = useSound();
    const screenWidth = Dimensions.get('window').width;
    const [loading, setLoading] = useState(true);
    const [todaysSales, setTodaysSales] = useState(0);
    const [activeCarts, setActiveCarts] = useState(0);
    const [abandonedCarts, setAbandonedCarts] = useState(0);
    const [activeVisitorsData, setActiveVisitorsData] = useState({ activeVisitors: 0, details: [] });
    const [ga4Analytics, setGa4Analytics] = useState({
        overview: {
            activeUsers: 0,
            pageViews: 0,
            events: 0,
            avgSessionDuration: 0
        },
        trafficSources: [],
        devices: { desktop: 0, mobile: 0, tablet: 0 },
        locations: [],
        topPages: []
    });
    const [ga4Error, setGa4Error] = useState(null);
    const [recentActivity, setRecentActivity] = useState([]);
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
            limit(100) // Fetch last 100 orders for history
        );

        const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
            let todayTotal = 0;
            const buckets = {}; // Map to group orders by 2-hour blocks

            snapshot.docs.forEach((doc, index) => {
                const data = doc.data();
                const orderDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                const price = parseFloat(data.totalPrice || 0);

                // Calculate today's total revenue (keep this metric for the card)
                if (orderDate >= todayStart) {
                    todayTotal += price;
                }

                // Create a unique key for this 2-hour block (e.g., "Dec 18 2pm")
                const hour = orderDate.getHours();
                const bucketHour = Math.floor(hour / 2) * 2; // 0, 2, 4, ... 22

                // Format: "18 Dec 2pm"
                const dateStr = orderDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                const timeStr = new Date(orderDate.setHours(bucketHour, 0, 0, 0)).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).toLowerCase();
                const key = `${dateStr} ${timeStr}`; // Unique key combining date and bucket time

                if (!buckets[key]) {
                    buckets[key] = {
                        total: 0,
                        count: 0,
                        timestamp: orderDate.setHours(bucketHour, 0, 0, 0), // For sorting
                        label: timeStr,
                        fullLabel: key // "18 Dec 2pm"
                    };
                }

                buckets[key].total += price;
                buckets[key].count += 1;
            });

            // Convert buckets to array and sort chronologically (oldest to newest)
            const sortedBuckets = Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);

            // Safety check: If no data, show empty placeholder for today
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
                labels: sortedBuckets.map(b => b.label), // Use short label "2pm" for axis
                fullLabels: sortedBuckets.map(b => b.fullLabel), // Keep full label "18 Dec 2pm" for tooltip
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
            limit(20)
        );

        // Store docs in a ref to access them in the interval
        let currentDocs = [];

        const processDocs = (docs) => {
            const activities = [];
            let active = 0;
            let abandoned = 0;
            const activeVisitorIds = new Set(); // Track unique active visitors

            docs.forEach(doc => {
                const data = doc.data();
                const rawStage = data.latest_stage || '';
                const displayStage = data.stage || data.eventType || rawStage;
                const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date();
                const now = new Date();
                const diffMinutes = Math.abs(now.getTime() - updatedAt.getTime()) / (1000 * 60);

                const isOrdered = rawStage === 'ORDER_PLACED' || rawStage === 'PAYMENT_INITIATED' || rawStage === 'COMPLETED' || !!data.orderId;
                const isAbandoned = !isOrdered && (rawStage === 'CHECKOUT_ABANDONED' || data.eventType === 'ABANDONED' || diffMinutes > 10);

                if (isOrdered) {
                    // Converted
                } else if (isAbandoned) {
                    abandoned++;
                } else {
                    active++;
                }

                // Count unique active visitors (within last 5 minutes, not ordered)
                if (diffMinutes <= 5 && !isOrdered) {
                    const visitorId = data.customerId || data.phone || data.email || doc.id;
                    activeVisitorIds.add(visitorId);
                }

                // Only show in feed if updated within last 5 minutes (gives 2 mins to see "Abandoned" status)
                if (diffMinutes <= 5) {
                    activities.push({
                        id: doc.id,
                        ...data,
                        status: displayStage, // Use readable stage for display
                        jsDate: updatedAt
                    });
                }
            });

            setActiveCarts(active);
            setAbandonedCarts(abandoned);

            // Find the latest timestamp in the current activities
            const currentMaxTimestamp = activities.length > 0
                ? Math.max(...activities.map(a => a.jsDate ? a.jsDate.getTime() : 0))
                : 0;

            // Play sound if we have a newer activity than before (and not first load)
            if (!isFirstLoadRef.current && currentMaxTimestamp > lastMaxTimestampRef.current) {
                playSound('LIVE_FEED');
            }

            lastMaxTimestampRef.current = currentMaxTimestamp;
            isFirstLoadRef.current = false;

            setRecentActivity(activities);
            setLoading(false);
        };

        const unsubscribeCheckouts = onSnapshot(qCheckouts, (snapshot) => {
            currentDocs = snapshot.docs;
            processDocs(currentDocs);
        });

        // Re-process every 30 seconds to update time-based status
        const intervalId = setInterval(() => {
            if (currentDocs.length > 0) {
                processDocs(currentDocs);
            }
        }, 30000);

        return () => {
            unsubscribeOrders();
            unsubscribeCheckouts();
            clearInterval(intervalId);
        };
    }, []);

    // Fetch Comprehensive GA4 Analytics
    useEffect(() => {
        const fetchGA4Analytics = async () => {
            try {
                const data = await getCachedAnalytics();

                // Ensure data has the expected structure
                if (data && data.overview) {
                    setGa4Analytics(data);
                    setGa4Error(null);

                    // Also update legacy format for backward compatibility
                    const details = (data.locations || []).map(loc => ({
                        city: loc.city,
                        country: loc.country,
                        device: 'unknown',
                        count: loc.users
                    }));
                    setActiveVisitorsData({
                        activeVisitors: data.overview.activeUsers || 0,
                        details: details
                    });
                } else {
                    // Data structure is invalid
                    setGa4Error('Invalid data structure');
                }
            } catch (error) {
                console.error('Error fetching GA4 analytics:', error);
                setGa4Error(error.message);
            }
        };

        fetchGA4Analytics();
        const ga4Interval = setInterval(fetchGA4Analytics, 30000);
        return () => clearInterval(ga4Interval);
    }, []);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <CRMLayout title="Analytics" navigation={navigation} scrollable={true} fullWidth={true}>
            {/* Key Metrics - Clean & Open Horizontal Scroll */}
            <View style={{ marginBottom: 24 }}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 32 }}
                    style={{ paddingVertical: 16 }}
                >
                    {/* Admin Only Stats: Revenue & Active Carts */}
                    {hasPermission('view_financial_stats') && (
                        <>
                            {/* Total Revenue Card */}
                            <View>
                                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>REVENUE</Text>
                                <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', marginTop: 4, color: theme.colors.onSurface }}>
                                    ₹{todaysSales.toLocaleString()}
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <Icon source="chart-line" size={14} color={theme.colors.primary} />
                                    <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: 'bold', marginLeft: 6 }}>Today</Text>
                                </View>
                            </View>

                            {/* Active Carts Card */}
                            <View>
                                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>ACTIVE CARTS</Text>
                                <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', marginTop: 4, color: theme.colors.onSurface }}>
                                    {activeCarts}
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80', marginRight: 6 }} />
                                    <Text style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>Live</Text>
                                </View>
                            </View>
                        </>
                    )}

                    {/* Active Visitors Card - Enhanced */}
                    <View>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>VISITORS</Text>
                        <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', marginTop: 4, color: theme.colors.onSurface }}>
                            {ga4Analytics?.overview?.activeUsers ?? 0}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            {ga4Error ? (
                                <>
                                    <Icon source="alert-circle" size={14} color={theme.colors.error} />
                                    <Text style={{ color: theme.colors.error, fontSize: 10, fontWeight: 'bold', marginLeft: 4 }}>GA4 Error</Text>
                                </>
                            ) : (ga4Analytics?.locations?.length ?? 0) > 0 ? (
                                <>
                                    <Icon source="map-marker" size={14} color="#f59e0b" />
                                    <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }} numberOfLines={1}>
                                        {ga4Analytics.locations[0].city}
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Icon source="clock-outline" size={14} color="#f59e0b" />
                                    <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Live</Text>
                                </>
                            )}
                        </View>
                    </View>

                    {/* Page Views Card */}
                    <View>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>PAGE VIEWS</Text>
                        <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', marginTop: 4, color: theme.colors.onSurface }}>
                            {ga4Analytics?.overview?.pageViews ?? 0}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="eye" size={14} color="#3b82f6" />
                            <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: 'bold', marginLeft: 6 }}>Last 30 min</Text>
                        </View>
                    </View>

                    {/* Engagement Card */}
                    <View>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>AVG SESSION</Text>
                        <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', marginTop: 4, color: theme.colors.onSurface }}>
                            {Math.floor((ga4Analytics?.overview?.avgSessionDuration ?? 0) / 60)}:{String((ga4Analytics?.overview?.avgSessionDuration ?? 0) % 60).padStart(2, '0')}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="timer-sand" size={14} color="#8b5cf6" />
                            <Text style={{ color: '#8b5cf6', fontSize: 12, fontWeight: 'bold', marginLeft: 6 }}>Minutes</Text>
                        </View>
                    </View>

                    {/* Abandoned Carts Card */}
                    <View>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>ABANDONED</Text>
                        <Text variant="displaySmall" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontWeight: '900', marginTop: 4, color: theme.colors.onSurface }}>
                            {abandonedCarts}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="cart-off" size={14} color={theme.colors.error} />
                            <Text style={{ color: theme.colors.error, fontSize: 12, fontWeight: 'bold', marginLeft: 6 }}>Action Needed</Text>
                        </View>
                    </View>
                </ScrollView>
            </View>

            {/* GA4 Analytics Breakdown - New Section */}
            {!ga4Error && (ga4Analytics?.overview?.activeUsers ?? 0) > 0 && (
                <View style={{ marginBottom: 24, paddingHorizontal: 16 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 16 }}>Live Analytics</Text>

                    {/* Devices Breakdown */}
                    <Surface style={{ borderRadius: 12, padding: 16, marginBottom: 16, backgroundColor: theme.colors.surface }} elevation={0}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>Devices</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                {(ga4Analytics?.devices?.desktop ?? 0) + (ga4Analytics?.devices?.mobile ?? 0) + (ga4Analytics?.devices?.tablet ?? 0)} total
                            </Text>
                        </View>

                        {/* Desktop */}
                        {(ga4Analytics?.devices?.desktop ?? 0) > 0 && (
                            <View style={{ marginBottom: 8 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Icon source="monitor" size={16} color={theme.colors.primary} />
                                        <Text variant="bodyMedium" style={{ marginLeft: 8, color: theme.colors.onSurface }}>Desktop</Text>
                                    </View>
                                    <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                        {ga4Analytics?.devices?.desktop ?? 0}
                                    </Text>
                                </View>
                                <ProgressBar
                                    progress={(ga4Analytics?.devices?.desktop ?? 0) / ((ga4Analytics?.devices?.desktop ?? 0) + (ga4Analytics?.devices?.mobile ?? 0) + (ga4Analytics?.devices?.tablet ?? 0))}
                                    color={theme.colors.primary}
                                    style={{ height: 6, borderRadius: 3 }}
                                />
                            </View>
                        )}

                        {/* Mobile */}
                        {(ga4Analytics?.devices?.mobile ?? 0) > 0 && (
                            <View style={{ marginBottom: 8 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Icon source="cellphone" size={16} color="#10b981" />
                                        <Text variant="bodyMedium" style={{ marginLeft: 8, color: theme.colors.onSurface }}>Mobile</Text>
                                    </View>
                                    <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                        {ga4Analytics?.devices?.mobile ?? 0}
                                    </Text>
                                </View>
                                <ProgressBar
                                    progress={(ga4Analytics?.devices?.mobile ?? 0) / ((ga4Analytics?.devices?.desktop ?? 0) + (ga4Analytics?.devices?.mobile ?? 0) + (ga4Analytics?.devices?.tablet ?? 0))}
                                    color="#10b981"
                                    style={{ height: 6, borderRadius: 3 }}
                                />
                            </View>
                        )}

                        {/* Tablet */}
                        {(ga4Analytics?.devices?.tablet ?? 0) > 0 && (
                            <View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Icon source="tablet" size={16} color="#f59e0b" />
                                        <Text variant="bodyMedium" style={{ marginLeft: 8, color: theme.colors.onSurface }}>Tablet</Text>
                                    </View>
                                    <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                        {ga4Analytics?.devices?.tablet ?? 0}
                                    </Text>
                                </View>
                                <ProgressBar
                                    progress={(ga4Analytics?.devices?.tablet ?? 0) / ((ga4Analytics?.devices?.desktop ?? 0) + (ga4Analytics?.devices?.mobile ?? 0) + (ga4Analytics?.devices?.tablet ?? 0))}
                                    color="#f59e0b"
                                    style={{ height: 6, borderRadius: 3 }}
                                />
                            </View>
                        )}
                    </Surface>

                    {/* Traffic Sources */}
                    {ga4Analytics.trafficSources.length > 0 && (
                        <Surface style={{ borderRadius: 12, padding: 16, marginBottom: 16, backgroundColor: theme.colors.surface }} elevation={0}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 12 }}>Traffic Sources</Text>
                            {ga4Analytics.trafficSources.slice(0, 5).map((source, index) => (
                                <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: index < ga4Analytics.trafficSources.length - 1 ? 1 : 0, borderBottomColor: theme.colors.outlineVariant }}>
                                    <View style={{ flex: 1 }}>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                            {source.source}
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                                            {source.medium} • {source.pageViews} views
                                        </Text>
                                    </View>
                                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                        {source.users}
                                    </Text>
                                </View>
                            ))}
                        </Surface>
                    )}

                    {/* Top Locations */}
                    {ga4Analytics.locations.length > 0 && (
                        <Surface style={{ borderRadius: 12, padding: 16, marginBottom: 16, backgroundColor: theme.colors.surface }} elevation={0}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 12 }}>Top Locations</Text>
                            {ga4Analytics.locations.slice(0, 5).map((location, index) => (
                                <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: index < Math.min(ga4Analytics.locations.length, 5) - 1 ? 1 : 0, borderBottomColor: theme.colors.outlineVariant }}>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        <Icon source="map-marker" size={16} color="#f59e0b" />
                                        <View style={{ marginLeft: 8 }}>
                                            <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                                {location.city}
                                            </Text>
                                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                                {location.country}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                        {location.users}
                                    </Text>
                                </View>
                            ))}
                        </Surface>
                    )}

                    {/* Top Pages */}
                    {ga4Analytics.topPages.length > 0 && (
                        <Surface style={{ borderRadius: 12, padding: 16, backgroundColor: theme.colors.surface }} elevation={0}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 12 }}>Top Pages</Text>
                            {ga4Analytics.topPages.slice(0, 5).map((page, index) => (
                                <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: index < Math.min(ga4Analytics.topPages.length, 5) - 1 ? 1 : 0, borderBottomColor: theme.colors.outlineVariant }}>
                                    <View style={{ flex: 1 }}>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1}>
                                            {page.page || 'Homepage'}
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                                            {page.users} visitors
                                        </Text>
                                    </View>
                                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                        {page.views}
                                    </Text>
                                </View>
                            ))}
                        </Surface>
                    )}
                </View>
            )}

            {/* Chart Section - Minimalist */}
            <View style={{ marginBottom: 24, paddingLeft: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 }}>
                    <View>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>Sales History</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                            Last 100 orders • 2-hr intervals
                        </Text>
                    </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 0 }}>
                    <LineChart
                        data={(chartData.datasets[0]?.data || [0]).map((value, index) => ({
                            value: value,
                            label: chartData.labels?.[index] || '',
                            fullLabel: chartData.fullLabels?.[index] || '',
                            orderCount: chartData.datasets[0]?.orderCounts?.[index] || 0,
                            labelTextStyle: { color: theme.colors.onSurfaceVariant, fontSize: 10 },
                        }))}
                        height={220}
                        width={Math.max(screenWidth, chartData.labels.length * 60)}
                        scrollable={true}
                        curved
                        areaChart
                        animateOnDataChange={false}
                        color={theme.colors.primary}
                        thickness={3}
                        startFillColor={theme.colors.primary}
                        endFillColor={theme.colors.background}
                        startOpacity={0.2}
                        endOpacity={0.0}
                        spacing={50}
                        backgroundColor={'transparent'}
                        hideDataPoints={false}
                        dataPointsHeight={8}
                        dataPointsWidth={8}
                        dataPointsColor={theme.colors.primary}
                        dataPointsRadius={4}
                        textColor={theme.colors.onSurface}
                        textFontSize={11}
                        textShiftY={-8}
                        textShiftX={-10}
                        yAxisColor="transparent"
                        xAxisColor="transparent"
                        yAxisTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        rulesType="dashed"
                        rulesColor={theme.colors.outlineVariant}
                        rulesThickness={0.5}
                        showVerticalLines={false}
                        initialSpacing={20}
                        endSpacing={40}
                        noOfSections={4}
                        maxValue={Math.max(...chartData.datasets[0].data) * 1.2}
                        yAxisLabelPrefix="₹"
                        formatYLabel={(value) => {
                            if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                            return value.toString();
                        }}
                        pointerConfig={{
                            pointerStripHeight: 180,
                            pointerStripColor: theme.colors.primary,
                            pointerStripWidth: 2,
                            pointerColor: theme.colors.primary,
                            radius: 6,
                            pointerLabelWidth: 100,
                            pointerLabelHeight: 90,
                            activatePointersOnLongPress: false,
                            autoAdjustPointerLabelPosition: true,
                            pointerLabelComponent: items => {
                                const point = items[0];
                                const orderCount = point.orderCount || 0;
                                const fullLabel = point.fullLabel || point.label || '';
                                const parts = fullLabel.split(' ');
                                const datePart = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : fullLabel;
                                const timePart = parts.length >= 3 ? parts[2] : '';

                                return (
                                    <View
                                        style={{
                                            height: 100,
                                            width: 110,
                                            justifyContent: 'center',
                                            backgroundColor: theme.colors.inverseSurface,
                                            borderRadius: 12,
                                            padding: 12,
                                        }}>
                                        <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 12, fontWeight: 'bold', textAlign: 'center' }}>
                                            {datePart}
                                        </Text>
                                        <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 11, textAlign: 'center', marginTop: 2, opacity: 0.8 }}>
                                            {timePart}
                                        </Text>
                                        <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginTop: 6 }}>
                                            ₹{Math.round(items[0].value).toLocaleString()}
                                        </Text>
                                        <Text style={{ color: theme.colors.inverseOnSurface, fontSize: 11, textAlign: 'center', marginTop: 4, opacity: 0.9 }}>
                                            {orderCount} {orderCount === 1 ? 'Order' : 'Orders'}
                                        </Text>
                                    </View>
                                );
                            },
                        }}
                    />
                </ScrollView>
            </View>

            {/* Recent Activity List - Edge to Edge */}
            <View style={{ paddingBottom: 40 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>Live Feed</Text>
                    <Button
                        mode="text"
                        compact
                        onPress={() => navigation.navigate('DatabaseManager', { collection: 'checkouts' })}
                        textColor={theme.colors.primary}
                    >
                        History
                    </Button>
                </View>

                {recentActivity.map((item) => (
                    <React.Fragment key={item.id}>
                        <List.Item
                            title={item.customerName || item.first_name || item.phone || item.phone_number || 'Visitor'}
                            titleStyle={{ fontWeight: 'bold', color: theme.colors.onSurface }}
                            style={{ paddingHorizontal: 16 }}
                            description={() => {
                                const displayItems = item.items || item.line_items || [];
                                return (
                                    <View>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                            {displayItems.length > 0 ? displayItems[0].name || displayItems[0].title : 'Browsing'}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                            <Chip
                                                mode="flat"
                                                compact
                                                style={{ backgroundColor: item.status === 'ABANDONED' ? theme.colors.errorContainer : theme.colors.primaryContainer, height: 20, borderRadius: 4, paddingHorizontal: 0 }}
                                                textStyle={{ fontSize: 10, lineHeight: 10, marginVertical: 0, marginHorizontal: 8, color: item.status === 'ABANDONED' ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer, fontWeight: 'bold' }}
                                            >
                                                {item.status || 'Active'}
                                            </Chip>
                                            <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                                                • {item.jsDate ? item.jsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            }}
                            left={props => <Avatar.Text {...props} size={40} label={(item.customerName || 'G').charAt(0).toUpperCase()} style={{ backgroundColor: theme.colors.surfaceVariant }} color={theme.colors.onSurfaceVariant} />}
                            right={props => <Text {...props} variant="titleMedium" style={{ alignSelf: 'center', fontWeight: 'bold', color: theme.colors.onSurface }}>₹{item.totalPrice || item.total_price || item.amount || 0}</Text>}
                            onPress={() => {
                                setSelectedDoc(item);
                                setModalVisible(true);
                            }}
                        />
                        <Divider style={{ marginLeft: 72 }} />
                    </React.Fragment>
                ))}
            </View>

            {/* Document Details Dialog */}
            <Portal>
                <Dialog
                    visible={modalVisible}
                    onDismiss={() => setModalVisible(false)}
                    style={{ maxHeight: '85%' }}
                >
                    <Dialog.Title>Checkout Details</Dialog.Title>
                    <Dialog.ScrollArea style={{ maxHeight: 400, paddingHorizontal: 0 }}>
                        <ScrollView>
                            {selectedDoc && (
                                <View style={{ paddingHorizontal: 24 }}>
                                    {/* Customer Info */}
                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Customer</Text>
                                        <Text variant="bodyLarge">{selectedDoc.customerName || selectedDoc.first_name || selectedDoc.phone || selectedDoc.phone_number || 'Visitor'}</Text>
                                    </View>

                                    {selectedDoc.email && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Email</Text>
                                            <Text variant="bodyMedium">{selectedDoc.email}</Text>
                                        </View>
                                    )}

                                    {(selectedDoc.phone || selectedDoc.phone_number) && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Phone</Text>
                                            <Text variant="bodyMedium">{selectedDoc.phone || selectedDoc.phone_number}</Text>
                                        </View>
                                    )}

                                    {/* Status */}
                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Status</Text>
                                        <Chip
                                            mode="flat"
                                            compact
                                            style={{
                                                backgroundColor: selectedDoc.status === 'ABANDONED' ? theme.colors.errorContainer : theme.colors.primaryContainer,
                                                alignSelf: 'flex-start'
                                            }}
                                            textStyle={{
                                                color: selectedDoc.status === 'ABANDONED' ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer,
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            {selectedDoc.status || 'Active'}
                                        </Chip>
                                    </View>

                                    {/* Amount */}
                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Amount</Text>
                                        <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>₹{selectedDoc.totalPrice || selectedDoc.total_price || selectedDoc.amount || 0}</Text>
                                    </View>

                                    {/* Items */}
                                    {(selectedDoc.items || selectedDoc.line_items) && (selectedDoc.items || selectedDoc.line_items).length > 0 && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>Items</Text>
                                            {(selectedDoc.items || selectedDoc.line_items).map((item, index) => (
                                                <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: index < selectedDoc.items.length - 1 ? 1 : 0, borderBottomColor: theme.colors.outlineVariant }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text variant="bodyMedium">{item.name || 'Unknown Item'}</Text>
                                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Qty: {item.quantity || 1}</Text>
                                                    </View>
                                                    <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>₹{item.price || 0}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    {/* Address */}
                                    {(selectedDoc.city || selectedDoc.state || selectedDoc.pincode) && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Location</Text>
                                            <Text variant="bodyMedium">
                                                {[selectedDoc.city, selectedDoc.state, selectedDoc.pincode].filter(Boolean).join(', ')}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Source */}
                                    {selectedDoc.source && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Source</Text>
                                            <Text variant="bodyMedium">{selectedDoc.source}</Text>
                                        </View>
                                    )}

                                    {/* Timestamp */}
                                    {selectedDoc.jsDate && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Last Updated</Text>
                                            <Text variant="bodyMedium">
                                                {selectedDoc.jsDate.toLocaleString()}
                                            </Text>
                                        </View>
                                    )}

                                    {/* Checkout ID */}
                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Checkout ID</Text>
                                        <Text variant="bodySmall" style={{ fontFamily: 'monospace', color: theme.colors.onSurfaceVariant }}>{selectedDoc.id}</Text>
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    </Dialog.ScrollArea>
                    <Dialog.Actions>
                        <Button onPress={() => setModalVisible(false)}>Close</Button>
                        <Button onPress={() => {
                            setModalVisible(false);
                            navigation.navigate('DatabaseManager', { collection: 'checkouts' });
                        }}>View in Database</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

        </CRMLayout >
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1 },
    metricsScroll: {
        paddingVertical: 8,
    },
    metricsScrollContent: {
        paddingHorizontal: 4,
        gap: 8,
    },
    metricsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    metricCard: {
        flex: 1,
        minWidth: 120,
        maxWidth: 180,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    chartSection: {
        marginBottom: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
    },
    listSection: {
        borderTopWidth: 1,
        paddingBottom: 20,
    },
});

export default StatsScreen;

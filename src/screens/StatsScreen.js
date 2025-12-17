import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, RefreshControl, Animated, Easing } from 'react-native';
import { Text, Surface, ActivityIndicator, Icon, IconButton, Appbar, List, Divider, Avatar, useTheme, Button, Chip, Portal, Dialog } from 'react-native-paper';
import { LineChart } from 'react-native-gifted-charts';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCachedActiveVisitors } from '../services/ga4Service';

const StatsScreen = ({ navigation }) => {
    const theme = useTheme();
    const screenWidth = Dimensions.get('window').width;
    const [loading, setLoading] = useState(true);
    const [todaysSales, setTodaysSales] = useState(0);
    const [activeCarts, setActiveCarts] = useState(0);
    const [abandonedCarts, setAbandonedCarts] = useState(0);
    const [activeVisitors, setActiveVisitors] = useState(0); // New state for active visitors
    const [recentActivity, setRecentActivity] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    const [chartData, setChartData] = useState({
        labels: ["00", "04", "08", "12", "16", "20"],
        datasets: [{ data: [0, 0, 0, 0, 0, 0] }]
    });

    useEffect(() => {
        // 1. Listen to ORDERS for Revenue & Chart
        const qOrders = query(
            collection(db, "orders"),
            orderBy("createdAt", "desc"),
            limit(50)
        );

        const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
            let total = 0;
            // 12 buckets for 2-hour intervals (0-1, 2-3, 4-5, ... 22-23)
            const hourlyData = new Array(12).fill(0);

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                total += parseFloat(data.totalPrice || 0);

                const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                const hour = date.getHours();
                // 2-hour buckets: 0-1, 2-3, 4-5, etc.
                const bucketIndex = Math.floor(hour / 2);
                if (bucketIndex >= 0 && bucketIndex < 12) {
                    hourlyData[bucketIndex] += parseFloat(data.totalPrice || 0);
                }
            });

            setTodaysSales(total);
            setChartData({
                labels: ["12am", "2am", "4am", "6am", "8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"],
                datasets: [{
                    data: hourlyData,
                    color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
                    strokeWidth: 2
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

                // Logic based on user provided JSONs
                // Active: INIT, PHONE_RECEIVED
                // Converted/Not Active: ORDER_PLACED, PAYMENT_INITIATED
                // Abandoned: Explicitly abandoned or old (> 5 mins)

                const isOrdered = rawStage === 'ORDER_PLACED' || rawStage === 'PAYMENT_INITIATED' || rawStage === 'COMPLETED' || !!data.orderId;
                // Only mark as abandoned if NOT ordered AND (explicitly abandoned OR timed out)
                const isAbandoned = !isOrdered && (rawStage === 'CHECKOUT_ABANDONED' || data.eventType === 'ABANDONED' || diffMinutes > 10);

                if (isOrdered) {
                    // Converted - do not count as active or abandoned
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
            // Keep Firebase-calculated visitors as fallback
            // setActiveVisitors(activeVisitorIds.size); 
            setRecentActivity(activities);
            setLoading(false);
        };

        const unsubscribeCheckouts = onSnapshot(qCheckouts, (snapshot) => {
            currentDocs = snapshot.docs;
            processDocs(currentDocs);
        });

        // Re-process every 30 seconds to update time-based status (Active -> Abandoned -> Vanished)
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

    // Fetch GA4 Active Visitors
    useEffect(() => {
        const fetchGA4Visitors = async () => {
            try {
                const visitors = await getCachedActiveVisitors();
                setActiveVisitors(visitors);
            } catch (error) {
                console.error('Error fetching GA4 visitors:', error);
                // Keep previous value on error
            }
        };

        // Fetch immediately on mount
        fetchGA4Visitors();

        // Refresh every 30 seconds (cached on service side)
        const ga4Interval = setInterval(fetchGA4Visitors, 30000);

        return () => {
            clearInterval(ga4Interval);
        };
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
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} color={theme.colors.onSurface} />
                <Appbar.Content title="Dashboard" titleStyle={{ fontWeight: 'bold', color: theme.colors.onSurface }} />
                <Appbar.Action icon="calendar" color={theme.colors.onSurface} onPress={() => { }} />
            </Appbar.Header>

            <ScrollView
                style={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            >
                {/* Key Metrics - Horizontal Scrollable Cards (Shopify-style) */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.metricsScrollContent}
                    style={styles.metricsScroll}
                >
                    {/* Total Revenue Card */}
                    <Surface style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>TOTAL REVENUE</Text>
                        <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: 'bold', marginTop: 4, color: theme.colors.onSurface }}>₹{todaysSales.toLocaleString()}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="chart-line" size={16} color={theme.colors.primary} />
                            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Sales</Text>
                        </View>
                    </Surface>

                    {/* Active Carts Card */}
                    <Surface style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>ACTIVE CARTS</Text>
                        <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: 'bold', marginTop: 4, color: theme.colors.onSurface }}>{activeCarts}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80', marginRight: 6 }} />
                            <Text style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>Live Now</Text>
                        </View>
                    </Surface>

                    {/* Active Visitors Card */}
                    <Surface style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>ACTIVE VISITORS</Text>
                        <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: 'bold', marginTop: 4, color: theme.colors.onSurface }}>{activeVisitors}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="clock-outline" size={16} color="#f59e0b" />
                            <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Last 5 min</Text>
                        </View>
                    </Surface>

                    {/* Abandoned Carts Card */}
                    <Surface style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, marginRight: 16 }]} elevation={1}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>ABANDONED</Text>
                        <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: 'bold', marginTop: 4, color: theme.colors.onSurface }}>{abandonedCarts}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="cart-off" size={16} color={theme.colors.error} />
                            <Text style={{ color: theme.colors.error, fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Lost</Text>
                        </View>
                    </Surface>
                </ScrollView>

                {/* Chart Section */}
                <Surface style={[styles.chartSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16 }}>
                        <View>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>Sales Trend</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Tap on points to see values</Text>
                        </View>
                        <Chip mode="flat" compact style={{ backgroundColor: theme.colors.primaryContainer }}>
                            <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 12, fontWeight: 'bold' }}>₹{todaysSales.toLocaleString()}</Text>
                        </Chip>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
                        <LineChart
                            data={chartData.datasets[0].data.map((value, index) => ({
                                value: value,
                                label: chartData.labels[index],
                                labelTextStyle: { color: theme.colors.onSurfaceVariant, fontSize: 10 },
                                dataPointText: `₹${Math.round(value)}`,
                            }))}
                            height={200}
                            width={Math.max(screenWidth - 40, chartData.labels.length * 60)} // Wider for scrolling
                            scrollable={true}
                            curved
                            areaChart
                            animateOnDataChange
                            animationDuration={1000}
                            onDataChangeAnimationDuration={300}
                            color={theme.colors.primary}
                            thickness={3}
                            startFillColor={theme.colors.primary}
                            endFillColor={theme.colors.surface}
                            startOpacity={0.3}
                            endOpacity={0.05}
                            spacing={45}
                            backgroundColor={theme.colors.surface}
                            hideDataPoints={false}
                            dataPointsHeight={8}
                            dataPointsWidth={8}
                            dataPointsColor={theme.colors.primary}
                            dataPointsRadius={4}
                            textColor={theme.colors.onSurface}
                            textFontSize={11}
                            textShiftY={-8}
                            textShiftX={-10}
                            yAxisColor={theme.colors.outlineVariant}
                            xAxisColor={theme.colors.outlineVariant}
                            yAxisTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                            xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                            rulesType="solid"
                            rulesColor={theme.colors.outlineVariant}
                            rulesThickness={0.5}
                            showVerticalLines={false}
                            verticalLinesColor={theme.colors.outlineVariant}
                            yAxisThickness={1}
                            xAxisThickness={1}
                            initialSpacing={10}
                            endSpacing={20}
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
                                    return (
                                        <View
                                            style={{
                                                height: 70,
                                                width: 90,
                                                justifyContent: 'center',
                                                backgroundColor: theme.colors.primaryContainer,
                                                borderRadius: 8,
                                                padding: 8,
                                                borderWidth: 1,
                                                borderColor: theme.colors.primary,
                                            }}>
                                            <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 12, fontWeight: 'bold', textAlign: 'center' }}>
                                                {items[0].label}
                                            </Text>
                                            <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginTop: 4 }}>
                                                ₹{Math.round(items[0].value).toLocaleString()}
                                            </Text>
                                        </View>
                                    );
                                },
                            }}
                        />
                    </ScrollView>
                </Surface>

                {/* Recent Activity List */}
                <View style={[styles.listSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
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
                    <Divider />
                    {recentActivity.map((item) => (
                        <React.Fragment key={item.id}>
                            <List.Item
                                title={item.customerName || 'Guest User'}
                                titleStyle={{ fontWeight: 'bold', color: theme.colors.onSurface }}
                                description={() => (
                                    <View>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                            {item.items && item.items.length > 0 ? item.items[0].name : 'Browsing'}
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
                                )}
                                left={props => <Avatar.Text {...props} size={40} label={(item.customerName || 'G').charAt(0).toUpperCase()} style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.onPrimaryContainer} />}
                                right={props => <Text {...props} variant="titleMedium" style={{ alignSelf: 'center', fontWeight: 'bold', color: theme.colors.onSurface }}>₹{item.totalPrice || item.amount || 0}</Text>}
                                onPress={() => {
                                    setSelectedDoc(item);
                                    setModalVisible(true);
                                }}
                            />
                            <Divider />
                        </React.Fragment>
                    ))}
                </View>
            </ScrollView >

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
                                        <Text variant="bodyLarge">{selectedDoc.customerName || 'Guest'}</Text>
                                    </View>

                                    {selectedDoc.email && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Email</Text>
                                            <Text variant="bodyMedium">{selectedDoc.email}</Text>
                                        </View>
                                    )}

                                    {selectedDoc.phone && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Phone</Text>
                                            <Text variant="bodyMedium">{selectedDoc.phone}</Text>
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
                                        <Text variant="headlineMedium" style={{ fontWeight: 'bold' }}>₹{selectedDoc.totalPrice || selectedDoc.amount || 0}</Text>
                                    </View>

                                    {/* Items */}
                                    {selectedDoc.items && selectedDoc.items.length > 0 && (
                                        <View style={{ marginBottom: 16 }}>
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>Items</Text>
                                            {selectedDoc.items.map((item, index) => (
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
        </View >
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1 },
    metricsScroll: {
        paddingVertical: 16,
    },
    metricsScrollContent: {
        paddingHorizontal: 16,
        gap: 12,
    },
    metricsRow: {
        flexDirection: 'row',
        padding: 16,
        gap: 16,
    },
    metricCard: {
        width: Dimensions.get('window').width * 0.42, // Fixed width for horizontal scroll
        minWidth: 160,
        padding: 16,
        borderRadius: 8,
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

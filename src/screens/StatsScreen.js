import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, RefreshControl, Animated, Easing } from 'react-native';
import { Text, Surface, ActivityIndicator, Icon, IconButton, Appbar, List, Divider, Avatar, useTheme, Button, Chip } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

const StatsScreen = ({ navigation }) => {
    const theme = useTheme();
    const screenWidth = Dimensions.get('window').width;
    const [loading, setLoading] = useState(true);
    const [todaysSales, setTodaysSales] = useState(0);
    const [activeCarts, setActiveCarts] = useState(0);
    const [abandonedCarts, setAbandonedCarts] = useState(0);
    const [recentActivity, setRecentActivity] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (recentActivity.length === 0) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.5,
                        duration: 1500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    })
                ])
            ).start();
        }
    }, [recentActivity.length]);

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
            const hourlyData = new Array(6).fill(0);

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                total += parseFloat(data.totalPrice || 0);

                const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                const hour = date.getHours();
                const bucketIndex = Math.floor(hour / 4);
                if (bucketIndex >= 0 && bucketIndex < 6) {
                    hourlyData[bucketIndex] += parseFloat(data.totalPrice || 0);
                }
            });

            setTodaysSales(total);
            setChartData({
                labels: ["12am", "4am", "8am", "12pm", "4pm", "8pm"],
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

        const unsubscribeCheckouts = onSnapshot(qCheckouts, (snapshot) => {
            const activities = [];
            let active = 0;
            let abandoned = 0;

            snapshot.docs.forEach(doc => {
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
                const isAbandoned = rawStage === 'CHECKOUT_ABANDONED' || diffMinutes > 3;

                if (isAbandoned) {
                    abandoned++;
                } else if (!isOrdered) {
                    active++;
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
            setRecentActivity(activities);
            setLoading(false);
        });

        return () => {
            unsubscribeOrders();
            unsubscribeCheckouts();
        };
    }, []);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const chartConfig = {
        backgroundGradientFrom: theme.colors.surface,
        backgroundGradientTo: theme.colors.surface,
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(138, 180, 248, ${opacity})`, // Google Blue
        labelColor: (opacity = 1) => theme.colors.onSurfaceVariant,
        style: { borderRadius: 0 },
        propsForDots: { r: "4", strokeWidth: "2", stroke: theme.colors.primary }
    };

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
                {/* Key Metrics - Simple Cards */}
                <View style={styles.metricsRow}>
                    <Surface style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>TOTAL REVENUE</Text>
                        <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: 'bold', marginTop: 4, color: theme.colors.onSurface }}>₹{todaysSales.toLocaleString()}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="chart-line" size={16} color={theme.colors.primary} />
                            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Sales</Text>
                        </View>
                    </Surface>

                    <Surface style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>ACTIVE CARTS</Text>
                        <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: 'bold', marginTop: 4, color: theme.colors.onSurface }}>{activeCarts}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80', marginRight: 6 }} />
                            <Text style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>Live Now</Text>
                        </View>
                    </Surface>

                    <Surface style={[styles.metricCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>ABANDONED</Text>
                        <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: 'bold', marginTop: 4, color: theme.colors.onSurface }}>{abandonedCarts}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="cart-off" size={16} color={theme.colors.error} />
                            <Text style={{ color: theme.colors.error, fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Lost</Text>
                        </View>
                    </Surface>
                </View>

                {/* Chart Section */}
                <Surface style={[styles.chartSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                    <Text variant="titleMedium" style={{ paddingHorizontal: 16, paddingTop: 16, fontWeight: 'bold', color: theme.colors.onSurface }}>Sales Trend</Text>
                    <LineChart
                        data={chartData}
                        width={screenWidth}
                        height={220}
                        chartConfig={chartConfig}
                        bezier
                        withDots={false}
                        withInnerLines={true}
                        withOuterLines={false}
                        style={{ marginTop: 16 }}
                    />
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
                    {recentActivity.length === 0 ? (
                        <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center', minHeight: 250 }}>
                            <Animated.View style={{
                                position: 'absolute',
                                width: 80,
                                height: 80,
                                borderRadius: 40,
                                backgroundColor: theme.colors.primary,
                                opacity: pulseAnim.interpolate({
                                    inputRange: [1, 1.5],
                                    outputRange: [0.3, 0]
                                }),
                                transform: [{ scale: pulseAnim }]
                            }} />
                            <Animated.View style={{
                                position: 'absolute',
                                width: 80,
                                height: 80,
                                borderRadius: 40,
                                borderWidth: 1,
                                borderColor: theme.colors.primary,
                                opacity: pulseAnim.interpolate({
                                    inputRange: [1, 1.5],
                                    outputRange: [1, 0]
                                }),
                                transform: [{ scale: pulseAnim }]
                            }} />
                            <Icon source="access-point" size={48} color={theme.colors.primary} />
                            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 24, fontWeight: 'bold', letterSpacing: 1.5 }}>
                                SCANNING
                            </Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, letterSpacing: 0.5 }}>
                                Waiting for live activity...
                            </Text>
                        </View>
                    ) : (
                        recentActivity.map((item) => (
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
                                />
                                <Divider />
                            </React.Fragment>
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1 },
    metricsRow: {
        flexDirection: 'row',
        padding: 16,
        gap: 16,
    },
    metricCard: {
        flex: 1,
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
    },
});

export default StatsScreen;

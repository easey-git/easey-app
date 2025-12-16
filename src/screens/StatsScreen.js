import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, RefreshControl } from 'react-native';
import { Text, Surface, ActivityIndicator, Icon, IconButton, Appbar, List, Divider, Avatar } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { theme } from '../theme/theme';

const StatsScreen = ({ navigation }) => {
    const screenWidth = Dimensions.get('window').width;
    const [loading, setLoading] = useState(true);
    const [todaysSales, setTodaysSales] = useState(0);
    const [activeCarts, setActiveCarts] = useState(0);
    const [abandonedCarts, setAbandonedCarts] = useState(0);
    const [recentActivity, setRecentActivity] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

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

                // Correct Logic: Active vs Abandoned
                if (data.eventType === 'ABANDONED') {
                    abandoned++;
                } else {
                    active++;
                }

                activities.push({
                    id: doc.id,
                    ...data,
                    jsDate: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
                });
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
        backgroundGradientFrom: "#fff",
        backgroundGradientTo: "#fff",
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(0, 0, 0, 0.5)`,
        style: { borderRadius: 0 },
        propsForDots: { r: "4", strokeWidth: "2", stroke: "#4F46E5" }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Appbar.Header style={{ backgroundColor: '#fff', elevation: 0, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                <Appbar.Content title="Dashboard" titleStyle={{ fontWeight: 'bold' }} />
                <Appbar.Action icon="calendar" onPress={() => { }} />
            </Appbar.Header>

            <ScrollView
                style={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Key Metrics - Simple Cards */}
                <View style={styles.metricsRow}>
                    <Surface style={styles.metricCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#666' }}>TOTAL REVENUE</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', marginTop: 4 }}>₹{todaysSales.toLocaleString()}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="chart-line" size={16} color="#4F46E5" />
                            <Text style={{ color: '#4F46E5', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Sales</Text>
                        </View>
                    </Surface>

                    <Surface style={styles.metricCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#666' }}>ACTIVE CARTS</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', marginTop: 4 }}>{activeCarts}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 6 }} />
                            <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: 'bold' }}>Live Now</Text>
                        </View>
                    </Surface>

                    <Surface style={styles.metricCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#666' }}>ABANDONED</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', marginTop: 4 }}>{abandonedCarts}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon source="cart-off" size={16} color="#ef4444" />
                            <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Lost</Text>
                        </View>
                    </Surface>
                </View>

                {/* Chart Section */}
                <Surface style={styles.chartSection} elevation={0}>
                    <Text variant="titleMedium" style={{ paddingHorizontal: 16, paddingTop: 16, fontWeight: 'bold' }}>Sales Trend</Text>
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
                <View style={styles.listSection}>
                    <Text variant="titleMedium" style={{ padding: 16, fontWeight: 'bold', backgroundColor: '#f9f9f9' }}>Live Feed</Text>
                    <Divider />
                    {recentActivity.map((item) => (
                        <React.Fragment key={item.id}>
                            <List.Item
                                title={item.customerName || 'Guest User'}
                                titleStyle={{ fontWeight: 'bold' }}
                                description={() => (
                                    <View>
                                        <Text variant="bodySmall" style={{ color: '#666' }}>
                                            {item.items && item.items.length > 0 ? item.items[0].name : 'Browsing'}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                                            {item.stage && (
                                                <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                                    <Text style={{ fontSize: 10, color: '#0284c7', fontWeight: 'bold' }}>{item.stage}</Text>
                                                </View>
                                            )}
                                            {item.source && (
                                                <Text style={{ fontSize: 10, color: '#9ca3af' }}>via {item.source}</Text>
                                            )}
                                            <Text style={{ fontSize: 10, color: '#9ca3af' }}>• {item.jsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                        </View>
                                    </View>
                                )}
                                left={props => (
                                    <Avatar.Icon
                                        {...props}
                                        icon={item.eventType === 'ABANDONED' ? "cart-off" : "cart-outline"}
                                        size={40}
                                        style={{ backgroundColor: item.eventType === 'ABANDONED' ? '#ffebee' : '#e0e7ff' }}
                                        color={item.eventType === 'ABANDONED' ? '#c62828' : '#4338ca'}
                                    />
                                )}
                                right={props => (
                                    <View style={{ justifyContent: 'center', alignItems: 'flex-end', marginRight: 16 }}>
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>₹{item.amount}</Text>
                                        {item.city && (
                                            <Text variant="labelSmall" style={{ color: '#6b7280' }}>{item.city}</Text>
                                        )}
                                    </View>
                                )}
                                style={{ backgroundColor: '#fff' }}
                            />
                            <Divider />
                        </React.Fragment>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    center: { justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1 },
    metricsRow: {
        flexDirection: 'row',
        padding: 16,
        gap: 16,
    },
    metricCard: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    chartSection: {
        backgroundColor: '#fff',
        marginBottom: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
    },
    listSection: {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderColor: '#e0e0e0',
    },
});

export default StatsScreen;

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
    const [recentActivity, setRecentActivity] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const [chartData, setChartData] = useState({
        labels: ["00", "04", "08", "12", "16", "20"],
        datasets: [{ data: [0, 0, 0, 0, 0, 0] }]
    });

    useEffect(() => {
        const qCheckouts = query(
            collection(db, "checkouts"),
            orderBy("updatedAt", "desc"),
            limit(20)
        );

        const unsubscribe = onSnapshot(qCheckouts, (snapshot) => {
            const activities = [];
            let activeCount = 0;
            let salesTotal = 0;
            const hourlyData = new Array(6).fill(0);

            snapshot.docs.forEach(doc => {
                const data = doc.data();

                if (data.eventType !== 'ABANDONED') {
                    salesTotal += parseFloat(data.amount || 0);
                } else {
                    activeCount++;
                }

                const date = data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date();
                const hour = date.getHours();
                const bucketIndex = Math.floor(hour / 4);
                if (bucketIndex >= 0 && bucketIndex < 6) {
                    hourlyData[bucketIndex] += parseFloat(data.amount || 0);
                }

                activities.push({
                    id: doc.id,
                    ...data,
                    jsDate: date
                });
            });

            setActiveCarts(activeCount);
            setTodaysSales(salesTotal);
            setRecentActivity(activities);

            setChartData({
                labels: ["12am", "4am", "8am", "12pm", "4pm", "8pm"],
                datasets: [{
                    data: hourlyData,
                    color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`, // Indigo
                    strokeWidth: 2
                }]
            });

            setLoading(false);
        });

        return () => unsubscribe();
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
                            <Icon source="arrow-up" size={16} color="green" />
                            <Text style={{ color: 'green', fontSize: 12, fontWeight: 'bold' }}>12% vs yesterday</Text>
                        </View>
                    </Surface>

                    <Surface style={styles.metricCard} elevation={0}>
                        <Text variant="labelMedium" style={{ color: '#666' }}>ACTIVE CARTS</Text>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', marginTop: 4 }}>{activeCarts}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Text style={{ color: '#666', fontSize: 12 }}>Live now</Text>
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
                                description={`${item.items && item.items.length > 0 ? item.items[0].name : 'Browsing'} • ${item.jsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                left={props => <Avatar.Icon {...props} icon={item.eventType === 'ABANDONED' ? "cart-off" : "check"} size={40} style={{ backgroundColor: item.eventType === 'ABANDONED' ? '#ffebee' : '#e8f5e9' }} color={item.eventType === 'ABANDONED' ? '#c62828' : '#2e7d32'} />}
                                right={props => <Text {...props} style={{ alignSelf: 'center', fontWeight: 'bold', marginRight: 16 }}>₹{item.amount}</Text>}
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

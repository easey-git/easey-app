import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, RefreshControl, Image, LayoutAnimation, Platform, UIManager, TouchableOpacity, Animated, FlatList, InteractionManager } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text, Surface, ActivityIndicator, Icon, List, Divider, Avatar, useTheme, Button, Chip, Portal, Dialog, ProgressBar, SegmentedButtons } from 'react-native-paper';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { collection, query, orderBy, onSnapshot, limit, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getCachedAnalytics } from '../services/ga4Service';
import { useSound } from '../context/SoundContext';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { AccessDenied } from '../components/AccessDenied';
import { useStaggeredLoad, useLazyLoad } from '../utils/performance';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}



const LiveFeedItem = React.memo(({ item, theme, onPress }) => {
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(-20)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            })
        ]).start();
    }, []);

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

    // 1. Traffic Source
    const getTrafficSource = () => {
        const source = item.referring_site ||
            item.landing_site ||
            item.custom_attributes?.landing_page_url ||
            item.cart_attributes?.landing_page_url ||
            item.note_attributes?.landing_page_url ||
            '';

        if (!source) return null;
        const lowerSource = source.toLowerCase();

        if (lowerSource.includes('gclid') || lowerSource.includes('google')) return { label: 'Google', icon: 'google' };

        if (lowerSource.includes('instagram') ||
            lowerSource.includes('utm_source=ig') ||
            lowerSource.includes('android-app://com.instagram') ||
            lowerSource.includes('ios-app://com.instagram')) {
            return { label: 'Instagram', icon: 'instagram' };
        }

        if (lowerSource.includes('facebook') || lowerSource.includes('fbclid')) return { label: 'Facebook', icon: 'facebook' };

        if (lowerSource.includes('youtube') || lowerSource.includes('yt')) return { label: 'YouTube', icon: 'youtube' };
        if (lowerSource.includes('whatsapp') || lowerSource.includes('wa.me')) return { label: 'WhatsApp', icon: 'whatsapp' };

        if (lowerSource.startsWith('http')) return { label: 'Web', icon: 'web' };
        return null;
    };
    const trafficSource = getTrafficSource();

    // 2. Product Image
    const productImageUrl = item.img_url || (item.items && item.items.length > 0 && item.items[0].img_url) || null;

    // 3. Discount Code
    const getDiscountCode = () => {
        if (item.discount_codes && item.discount_codes.length > 0) {
            const first = item.discount_codes[0];
            return (typeof first === 'object' && first.code) ? first.code : first;
        }
        return item.applied_discount?.title || null;
    };
    const discountCode = getDiscountCode();

    // 4. RTO Risk
    const rtoRisk = item.rtoPredict;

    // 5. Smart Location
    const getKeyLocation = () => {
        const rootLoc = (item.city && item.state) ? `${item.city}, ${item.province || item.state_code || item.state}` : item.city || item.state;
        if (rootLoc) return rootLoc;
        const addr = item.shipping_address || item.billing_address || item.customer?.default_address || item.default_address;
        if (addr) {
            return (addr.city && addr.province) ? `${addr.city}, ${addr.province}` : addr.city || addr.province || addr.country;
        }
        return null;
    };
    const locationText = getKeyLocation();
    const stage = getStageConfig(item.status);

    return (
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], marginBottom: 4 }}>
            <Surface style={{ marginHorizontal: 16, marginTop: 4, borderRadius: 12, backgroundColor: theme.colors.surface }} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} style={{ flexDirection: 'row', padding: 12, alignItems: 'center' }}>

                    {/* LEFT: Image or Avatar */}
                    <View style={{ marginRight: 12 }}>
                        {productImageUrl ? (
                            <Avatar.Image size={46} source={{ uri: productImageUrl }} style={{ backgroundColor: theme.colors.surfaceVariant }} />
                        ) : (
                            <Avatar.Text size={46} label={(item.customerName || 'G').charAt(0).toUpperCase()} style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.onPrimaryContainer} />
                        )}
                        {/* Status Badge Overlap */}
                        <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: theme.colors.surface, borderRadius: 8 }}>
                            <Icon source={stage.icon} size={16} color={stage.color} />
                        </View>
                    </View>

                    {/* MIDDLE: Details */}
                    <View style={{ flex: 1 }}>
                        {/* Top Line: Name + Badges */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', flexShrink: 1 }} numberOfLines={1}>
                                {item.customerName || item.first_name || item.phone || 'Visitor'}
                            </Text>

                            {/* Traffic Icon */}
                            {trafficSource && (
                                <View style={{ marginLeft: 6, backgroundColor: theme.colors.surfaceVariant, borderRadius: 4, padding: 2 }}>
                                    <Icon source={trafficSource.icon} size={10} color={theme.colors.onSurfaceVariant} />
                                </View>
                            )}

                            {/* RTO Badge */}
                            {rtoRisk && (
                                <View style={{ marginLeft: 4, backgroundColor: rtoRisk === 'low' ? theme.colors.tertiaryContainer : theme.colors.errorContainer, borderRadius: 4, paddingHorizontal: 4 }}>
                                    <Text style={{ fontSize: 8, fontWeight: 'bold', color: rtoRisk === 'low' ? theme.colors.onTertiaryContainer : theme.colors.onErrorContainer }}>
                                        {rtoRisk.toUpperCase()}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Subtext: Product + Loc */}
                        <Text variant="bodySmall" style={{ color: theme.colors.secondary }} numberOfLines={1}>
                            {(item.items && item.items.length > 0 && (item.items[0].name || item.items[0].title)) || 'Cart Items'}
                        </Text>

                        {/* Footer: Time + Location + Discount */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <Text style={{ fontSize: 10, color: theme.colors.outline }}>{getRelativeTime(item.jsDate)}</Text>
                            {locationText && (
                                <Text style={{ fontSize: 10, color: theme.colors.outline, marginLeft: 8 }}>• {locationText}</Text>
                            )}
                            {discountCode && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                                    <Icon source="tag" size={10} color={theme.colors.primary} />
                                    <Text style={{ fontSize: 10, color: theme.colors.primary, marginLeft: 2, fontWeight: 'bold' }}>{discountCode}</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* RIGHT: Price + Payment */}
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                            ₹{item.totalPrice || item.total_price || item.amount || 0}
                        </Text>
                        {item.payment_method && (
                            <View style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, marginTop: 2 }}>
                                <Text style={{ fontSize: 9, fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>{item.payment_method.toUpperCase()}</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </Surface>
        </Animated.View>
    );
});

const RecoverButton = ({ link, theme }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await Clipboard.setStringAsync(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button
            mode="contained"
            icon={copied ? "check" : "link"}
            onPress={handleCopy}
            style={{ marginBottom: 16, backgroundColor: copied ? theme.colors.primary : '#4caf50' }}
        >
            {copied ? "Link Copied" : "Copy Recover Link"}
        </Button>
    );
};

const SalesChartSection = React.memo(({ chartData, theme }) => {
    const [layoutWidth, setLayoutWidth] = useState(0);

    return (
        <Surface
            style={[styles.chartContainer, { backgroundColor: theme.colors.surface }]}
            elevation={0}
            onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
        >
            <View style={{ padding: 16 }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Sales Trend</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.outline }}>revenue over time</Text>
            </View>
            {layoutWidth > 0 ? (
                <LineChart
                    data={(chartData.datasets[0]?.data || [0]).map((value, index) => ({
                        value: value,
                        label: chartData.labels?.[index] || '',
                        labelTextStyle: { color: theme.colors.outline, fontSize: 10 },
                        orderCount: chartData.datasets[0]?.orderCounts?.[index] || 0,
                        dateLabel: chartData.fullLabels?.[index] || ''
                    }))}
                    height={220}
                    width={layoutWidth - 16} // Dynamic width based on container
                    thickness={3}
                    color={theme.colors.primary}
                    startFillColor={theme.colors.primary}
                    endFillColor={theme.colors.background}
                    startOpacity={0.2}
                    endOpacity={0.0}
                    spacing={(layoutWidth - 48) / Math.max(10, (chartData.labels?.length || 12))} // Dynamic spacing
                    initialSpacing={16}
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
            ) : (
                <View style={{ height: 220, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator />
                </View>
            )}
        </Surface>
    );
});

const LiveFeedSection = React.memo(({ recentActivity, navigation, theme }) => {
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const hasActivity = recentActivity.length > 0;



    return (
        <Surface style={[styles.chartContainer, { height: 300, backgroundColor: theme.colors.surface }]} elevation={1}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* Live Pulse Dot */}
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hasActivity ? '#22c55e' : theme.colors.outlineVariant }} />
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Live Feed</Text>
                    {hasActivity && (
                        <View style={{ backgroundColor: theme.colors.errorContainer, paddingHorizontal: 6, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: theme.colors.onErrorContainer }}>{recentActivity.length}</Text>
                        </View>
                    )}
                </View>
                <Button
                    compact
                    mode="text"
                    onPress={() => navigation.navigate('DatabaseManager', { collection: 'checkouts' })}
                    labelStyle={{ fontSize: 12 }}
                >
                    Detailed History
                </Button>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 0 }}>
                {hasActivity ? (
                    <FlatList
                        data={recentActivity}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <LiveFeedItem
                                item={item}
                                theme={theme}
                                onPress={(doc) => { setSelectedDoc(doc); setModalVisible(true); }}
                            />
                        )}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        initialNumToRender={4}
                        maxToRenderPerBatch={4}
                        windowSize={3}
                        refreshControl={<RefreshControl refreshing={false} />}
                    />
                ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
                        <Icon source="radar" size={48} color={theme.colors.outline} />
                    </View>
                )}
            </View>

            <Portal>
                <Dialog visible={modalVisible} onDismiss={() => setModalVisible(false)} style={{ maxHeight: '85%', maxWidth: 450, width: '100%', alignSelf: 'center' }}>
                    <Dialog.Title>Checkout Details</Dialog.Title>
                    <Dialog.ScrollArea style={{ maxHeight: 400, paddingHorizontal: 0 }}>
                        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}>
                            {selectedDoc && (
                                <View>
                                    {(selectedDoc.img_url || (selectedDoc.items && selectedDoc.items.length > 0 && selectedDoc.items[0].img_url)) && (
                                        <View style={{ alignItems: 'center', marginBottom: 16 }}>
                                            <Image
                                                source={{ uri: selectedDoc.img_url || selectedDoc.items[0].img_url }}
                                                style={{ width: 100, height: 100, borderRadius: 8, backgroundColor: theme.colors.surfaceVariant }}
                                                resizeMode="cover"
                                            />
                                        </View>
                                    )}

                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Customer</Text>
                                        <Text variant="bodyLarge">{selectedDoc.customerName || selectedDoc.first_name || selectedDoc.phone || 'Visitor'}</Text>
                                        {selectedDoc.email && <Text variant="bodySmall" style={{ color: theme.colors.secondary }}>{selectedDoc.email}</Text>}
                                        {selectedDoc.phone && <Text variant="bodySmall" style={{ color: theme.colors.secondary }}>{selectedDoc.phone}</Text>}
                                    </View>

                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                        <Chip compact>{selectedDoc.status}</Chip>
                                        {selectedDoc.rtoPredict && (
                                            <Chip compact mode="outlined" style={{ backgroundColor: selectedDoc.rtoPredict === 'low' ? theme.colors.tertiaryContainer : theme.colors.errorContainer }}>
                                                {selectedDoc.rtoPredict.toUpperCase()} RTO
                                            </Chip>
                                        )}
                                        {selectedDoc.payment_method && (
                                            <Chip compact mode="outlined">{selectedDoc.payment_method}</Chip>
                                        )}
                                    </View>

                                    {(selectedDoc.checkout_url || selectedDoc.custom_attributes?.landing_page_url) && (
                                        <RecoverButton
                                            link={selectedDoc.checkout_url || selectedDoc.custom_attributes?.landing_page_url}
                                            theme={theme}
                                        />
                                    )}

                                    <View style={{ marginBottom: 16 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Total Amount</Text>
                                        <Text variant="headlineMedium" style={{ fontWeight: 'bold' }} numberOfLines={1} adjustsFontSizeToFit>₹{selectedDoc.totalPrice || selectedDoc.cart?.totalPrice || selectedDoc.total_price || 0}</Text>
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
        </Surface>
    );
});

const StatsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission } = useAuth();

    if (!hasPermission('access_analytics')) {
        return <AccessDenied title="Analytics Restricted" message="You need permission to view analytics." />;
    }

    const { playSound } = useSound();
    const screenWidth = Dimensions.get('window').width;
    const { isDesktop } = useResponsive();
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

    // Refs for sound logic
    const lastMaxTimestampRef = React.useRef(0);
    const isFirstLoadRef = React.useRef(true);

    const [chartData, setChartData] = useState({
        labels: ["12am", "2am", "4am", "6am", "8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"],
        datasets: [{ data: new Array(12).fill(0) }]
    });

    const [timeRange, setTimeRange] = useState('today');
    const [topProducts, setTopProducts] = useState([]);
    const [topCustomers, setTopCustomers] = useState([]);
    const [filteredSales, setFilteredSales] = useState(0);
    const [totalOrdersCount, setTotalOrdersCount] = useState(0);

    // Staggered loading: Phase 1 = skeleton, Phase 2 = orders, Phase 3 = checkouts + GA4
    const loadPhase = useStaggeredLoad();



    useEffect(() => {
        // Don't start heavy data fetching until Phase 2 (after initial render)
        if (loadPhase < 2) {
            return;
        }

        setLoading(true);
        // Determine Start Date based on Time Range
        const now = new Date();
        const startDate = new Date();

        if (timeRange === 'today') {
            startDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '7d') {
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
        } else if (timeRange === '30d') {
            startDate.setDate(now.getDate() - 30);
            startDate.setHours(0, 0, 0, 0);
        } else if (timeRange === 'all') { // Optional: All Time
            startDate.setFullYear(2020);
        }

        // 1. Listen to ORDERS for Revenue & Chart & Top Lists
        const qOrders = query(
            collection(db, "orders"),
            where("createdAt", ">=", startDate),
            orderBy("createdAt", "desc"),
            limit(500) // Reduced from 2000 to 500 for better performance
        );

        const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
            let totalSales = 0;
            let orderCount = 0;
            const productMap = {};
            const customerMap = {};

            // Bucketing for Chart
            const buckets = {};
            const isToday = timeRange === 'today';

            setRawOrders(snapshot.docs); // Keep raw docs for Live Feed (it will filter internally)

            snapshot.docs.forEach((doc) => {
                const data = doc.data();
                const orderDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                const price = parseFloat(data.totalPrice || 0);

                // Safety check (redundant with query but good for robust logic)
                if (orderDate >= startDate) {
                    totalSales += price;
                    orderCount++;

                    // A. Product Aggregation
                    const items = data.items || data.line_items || [];
                    items.forEach(item => {
                        const name = item.name || item.title || 'Unknown Product';
                        const qty = parseInt(item.quantity || 1);
                        const img = item.img_url || item.image || null;

                        if (!productMap[name]) {
                            productMap[name] = { name, qty: 0, revenue: 0, img, count: 0 };
                        }
                        productMap[name].qty += qty;
                        productMap[name].revenue += (parseFloat(item.price || 0) * qty); // Approximate if item price exists
                        productMap[name].count += 1;
                    });

                    // B. Customer Aggregation
                    const custName = data.customerName || data.first_name || data.phone || 'Visitor';
                    if (!customerMap[custName]) customerMap[custName] = { name: custName, spend: 0, orders: 0 };
                    customerMap[custName].spend += price;
                    customerMap[custName].orders += 1;

                    // C. Chart Bucketing
                    let key, label, fullLabel, timestamp;

                    if (isToday) {
                        // Hourly Buckets
                        const hour = orderDate.getHours();
                        const bucketHour = Math.floor(hour / 2) * 2;
                        label = new Date(orderDate.setHours(bucketHour, 0, 0, 0)).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).toLowerCase();
                        fullLabel = orderDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + ' ' + label;
                        timestamp = orderDate.getTime();
                        key = fullLabel;
                    } else {
                        // Daily Buckets
                        const dateStr = orderDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                        label = dateStr;
                        fullLabel = orderDate.toDateString();
                        timestamp = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate()).getTime();
                        key = fullLabel;
                    }

                    if (!buckets[key]) {
                        buckets[key] = {
                            total: 0,
                            count: 0,
                            timestamp: timestamp,
                            label: label,
                            fullLabel: fullLabel
                        };
                    }
                    buckets[key].total += price;
                    buckets[key].count += 1;
                }
            });

            // Process Computed Data
            // 1. Chart
            const sortedBuckets = Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);
            // Fill gaps if needed? For now, allow gaps or simple line.

            // 2. Top Products (Sort by Qty)
            const sortedProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

            // 3. Top Customers (Sort by Spend)
            const sortedCustomers = Object.values(customerMap).sort((a, b) => b.spend - a.spend).slice(0, 5);

            setFilteredSales(totalSales);
            setTotalOrdersCount(orderCount);
            setTopProducts(sortedProducts);
            setTopCustomers(sortedCustomers);

            setChartData({
                labels: sortedBuckets.map(b => b.label),
                fullLabels: sortedBuckets.map(b => b.fullLabel),
                datasets: [{
                    data: sortedBuckets.map(b => b.total),
                    orderCounts: sortedBuckets.map(b => b.count)
                }]
            });

            setLoading(false);
        });

        // 2. Listen to CHECKOUTS for Active/Abandoned counts & Feed
        const qCheckouts = query(
            collection(db, "checkouts"),
            orderBy("updatedAt", "desc"),
            limit(50) // Reduced from 100 to 50 for better performance
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
    }, [timeRange, loadPhase]); // Re-run when timeRange or loadPhase changes

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

        const interval = setInterval(updateFeed, 3000); // Update every 3 seconds instead of 1
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
            <View style={[styles.sectionContainer, { marginBottom: 16 }]}>
                <SegmentedButtons
                    value={timeRange}
                    onValueChange={setTimeRange}
                    buttons={[
                        { value: 'today', label: 'Today' },
                        { value: '7d', label: '7 Days' },
                        { value: '30d', label: '30 Days' },
                    ]}
                    style={{ marginBottom: 12 }}
                />

                <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12 }}>
                    <View style={[styles.gridContainer, { flex: 1 }]}>
                        {/* Revenue */}
                        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={[styles.iconBox, { backgroundColor: theme.colors.primaryContainer }]}>
                                    <Icon source="currency-inr" size={20} color={theme.colors.onPrimaryContainer} />
                                </View>
                                <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.primary }}>REVENUE</Text>
                            </View>
                            <Text variant="displaySmall" style={{ fontWeight: 'bold' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>₹{filteredSales.toLocaleString()}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                                {timeRange === 'today' ? "Today's Sales" : timeRange === '7d' ? "Last 7 Days" : "Last 30 Days"}
                            </Text>
                        </Surface>

                        {/* Active Visitors */}
                        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={[styles.iconBox, { backgroundColor: '#dcfce7' }]}>
                                    <Icon source="account-group" size={20} color="#166534" />
                                </View>
                                <Text variant="labelMedium" style={{ marginLeft: 8, color: '#166534' }}>VISITORS</Text>
                            </View>
                            <Text variant="displaySmall" style={{ fontWeight: 'bold' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                {ga4Analytics?.overview?.activeUsers ?? 0}
                            </Text>
                            {/* Live Indicator */}
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                                <Text variant="bodySmall" style={{ color: '#22c55e', fontWeight: 'bold', marginLeft: 6 }}>Live on Site</Text>
                            </View>
                        </Surface>
                    </View>

                    <View style={[styles.gridContainer, { flex: 1, marginTop: isDesktop ? 0 : 12 }]}>
                        {/* Orders Count */}
                        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={[styles.iconBox, { backgroundColor: '#ffedd5' }]}>
                                    <Icon source="package-variant" size={20} color="#c2410c" />
                                </View>
                                <Text variant="labelMedium" style={{ marginLeft: 8, color: '#c2410c' }}>ORDERS</Text>
                            </View>
                            <Text variant="displaySmall" style={{ fontWeight: 'bold' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{totalOrdersCount}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                                {timeRange === 'today' ? "Today" : "Period Total"}
                            </Text>
                        </Surface>

                        {/* Avg Order Value */}
                        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={[styles.iconBox, { backgroundColor: '#f3e8ff' }]}>
                                    <Icon source="chart-line" size={20} color="#7e22ce" />
                                </View>
                                <Text variant="labelMedium" style={{ marginLeft: 8, color: '#7e22ce' }}>AOV</Text>
                            </View>
                            <Text variant="displaySmall" style={{ fontWeight: 'bold' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                ₹{totalOrdersCount > 0 ? Math.round(filteredSales / totalOrdersCount).toLocaleString() : 0}
                            </Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Average Order</Text>
                        </Surface>
                    </View>
                </View>
            </View>

            {/* 2. LIVE FEEDS (Firebase) - MOVED UP */}
            <LiveFeedSection recentActivity={recentActivity} navigation={navigation} theme={theme} />

            {/* 3. SALES TREND CHART */}
            <SalesChartSection theme={theme} chartData={chartData} />

            {/* 3. TOP PERFORMERS */}
            <View style={{ marginTop: 24, paddingHorizontal: 16, flexDirection: 'column', gap: 16 }}>
                {/* Top Products */}
                <Surface style={styles.listCard} elevation={0}>
                    <View style={styles.cardHeader}>
                        <Icon source="shopping" size={18} color="#ec4899" />
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Top Products</Text>
                    </View>
                    {topProducts.length > 0 ? (
                        topProducts.map((prod, index) => (
                            <View key={index} style={styles.listItem}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    {prod.img && (
                                        <Image source={{ uri: prod.img }} style={{ width: 32, height: 32, borderRadius: 4, marginRight: 8, backgroundColor: theme.colors.surfaceVariant }} />
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: 'bold' }}>{prod.name}</Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{prod.qty} sold</Text>
                                    </View>
                                </View>
                                <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>₹{prod.revenue.toLocaleString()}</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ padding: 16, color: theme.colors.outline }}>No sales in this period</Text>
                    )}
                </Surface>

                {/* Top Customers */}
                <Surface style={styles.listCard} elevation={0}>
                    <View style={styles.cardHeader}>
                        <Icon source="crown" size={18} color="#f59e0b" />
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Top Customers</Text>
                    </View>
                    {topCustomers.length > 0 ? (
                        topCustomers.map((cust, index) => (
                            <View key={index} style={styles.listItem}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                    <Avatar.Text size={32} label={cust.name.substring(0, 1).toUpperCase()} style={{ marginRight: 8, backgroundColor: theme.colors.tertiaryContainer }} color={theme.colors.onTertiaryContainer} />
                                    <View style={{ flex: 1 }}>
                                        <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: 'bold' }}>{cust.name}</Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{cust.orders} orders</Text>
                                    </View>
                                </View>
                                <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>₹{cust.spend.toLocaleString()}</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ padding: 16, color: theme.colors.outline }}>No customers in this period</Text>
                    )}
                </Surface>
            </View>

            {/* 4. USER DEMOGRAPHICS */}
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
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Event Metrics</Text>
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
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Active Feeds</Text>
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
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>Real-Time Regions</Text>
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

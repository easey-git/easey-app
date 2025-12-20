import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Linking, FlatList } from 'react-native';
import { Text, Surface, Appbar, useTheme, Button, SegmentedButtons, Avatar, IconButton, Badge, Portal, Dialog, ActivityIndicator, Divider, Icon, Chip } from 'react-native-paper';
import { BarChart } from 'react-native-gifted-charts';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

const WhatsAppManagerScreen = ({ navigation }) => {
    const theme = useTheme();
    const [tab, setTab] = useState('overview');
    const [codTab, setCodTab] = useState('pending'); // pending | approved
    const screenWidth = Dimensions.get('window').width;

    // Data State
    const [codOrders, setCodOrders] = useState([]);
    const [abandonedCarts, setAbandonedCarts] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sendingId, setSendingId] = useState(null);

    // Message Viewer State
    const [chatDialogVisible, setChatDialogVisible] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [chatHistory, setChatHistory] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);

    // Dummy Data for Charts (Keep for now until we have real message logs)
    const messageStats = [
        { value: 120, label: 'Sent', frontColor: theme.colors.primary },
        { value: 115, label: 'Delivered', frontColor: theme.colors.secondary },
        { value: 98, label: 'Read', frontColor: '#4ade80' },
        { value: 15, label: 'Replied', frontColor: '#f59e0b' },
    ];

    useEffect(() => {
        setLoading(true);

        // 1. Fetch COD Orders (and recently cancelled ones)
        const qOrders = query(
            collection(db, "orders"),
            where("status", "in", ["COD", "CANCELLED"]),
            orderBy("createdAt", "desc"),
            limit(50)
        );

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                verificationStatus: doc.data().verificationStatus || 'pending'
            }));
            setCodOrders(orders);
        });

        // 2. Fetch Abandoned Carts
        const qCarts = query(
            collection(db, "checkouts"),
            orderBy("updatedAt", "desc"),
            limit(50)
        );

        const unsubCarts = onSnapshot(qCarts, (snapshot) => {
            const carts = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const rawStage = data.latest_stage || '';
                const isOrdered = rawStage === 'ORDER_PLACED' || rawStage === 'PAYMENT_INITIATED' || rawStage === 'COMPLETED' || !!data.orderId;
                const isAbandoned = !isOrdered && (rawStage === 'CHECKOUT_ABANDONED' || data.eventType === 'ABANDONED');

                if (isAbandoned) {
                    carts.push({ id: doc.id, ...data });
                }
            });
            setAbandonedCarts(carts);
            setLoading(false);
        });

        // 3. Fetch Recent Activity
        const qActivity = query(
            collection(db, "whatsapp_messages"),
            orderBy("timestamp", "desc"),
            limit(5)
        );

        const unsubActivity = onSnapshot(qActivity, (snapshot) => {
            const activity = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRecentActivity(activity);
        });

        return () => {
            unsubOrders();
            unsubCarts();
            unsubActivity();
        };
    }, []);

    // Fetch Chat History
    useEffect(() => {
        if (!selectedCustomer || !selectedCustomer.phone) return;

        setChatLoading(true);

        // Use normalized phone if available, otherwise calculate it matching backend logic
        let phoneDigits = selectedCustomer.phoneNormalized;

        if (!phoneDigits && selectedCustomer.phone) {
            let p = selectedCustomer.phone.replace(/\D/g, '');
            if (p.length === 10) {
                p = '91' + p;
            }
            phoneDigits = p;
        }

        const qChat = query(
            collection(db, "whatsapp_messages"),
            where("phoneNormalized", "==", phoneDigits),
            orderBy("timestamp", "asc")
        );

        const unsubChat = onSnapshot(qChat, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setChatHistory(messages);
            setChatLoading(false);
        });

        return () => unsubChat();
    }, [selectedCustomer]);

    const handleVerifyOrder = async (orderId, status) => {
        try {
            await updateDoc(doc(db, "orders", orderId), {
                verificationStatus: status,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error("Error updating order:", error);
        }
    };

    const handleSendVerification = async (order) => {
        if (!order.phone) {
            alert("No phone number found for this order.");
            return;
        }

        setSendingId(order.id);
        try {
            // Backend handles normalization (e.g. adding 91 prefix)
            const response = await fetch('/api/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: order.phone,
                    templateName: 'order_auto_confirmation',
                    languageCode: 'en_US',
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: order.customerName || 'Customer' },
                                { type: 'text', text: order.orderNumber || 'Order' },
                                { type: 'text', text: order.totalPrice || '0' }
                            ]
                        }
                    ]
                })
            });

            const data = await response.json();
            if (response.ok) {
                alert("Verification message sent!");
            } else {
                alert("Failed to send: " + (data.error || "Unknown error"));
            }
        } catch (error) {
            console.error(error);
            alert("Network error sending message.");
        } finally {
            setSendingId(null);
        }
    };

    const openChat = (customer) => {
        setSelectedCustomer(customer);
        setChatDialogVisible(true);
    };

    const renderOverview = () => (
        <ScrollView style={styles.tabContent}>
            <View style={styles.statsGrid}>
                <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <Avatar.Icon size={40} icon="whatsapp" style={{ backgroundColor: '#25D366' }} />
                    <Text variant="titleLarge" style={{ fontWeight: 'bold', marginTop: 8 }}>{codOrders.length + abandonedCarts.length}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Active Targets</Text>
                </Surface>
                <Surface style={[styles.statCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <Avatar.Icon size={40} icon="cash-check" style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.primary} />
                    <Text variant="titleLarge" style={{ fontWeight: 'bold', marginTop: 8 }}>{codOrders.filter(o => o.verificationStatus === 'approved').length}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Verified Orders</Text>
                </Surface>
            </View>

            <Surface style={[styles.chartCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 16, color: theme.colors.onSurface }}>Message Performance (Last 24h)</Text>
                <BarChart
                    data={messageStats}
                    width={screenWidth - 120}
                    height={200}
                    barWidth={22}
                    spacing={35}
                    initialSpacing={10}
                    xAxisLength={screenWidth - 120}
                    roundedTop
                    yAxisThickness={0}
                    xAxisThickness={1}
                    xAxisColor={theme.colors.outlineVariant}
                    yAxisTextStyle={{ color: theme.colors.onSurfaceVariant }}
                    labelTextStyle={{ color: theme.colors.onSurfaceVariant }}
                    hideRules
                />
            </Surface>

            {/* Recent Activity Section */}
            <Surface style={[styles.listCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <View style={styles.cardHeader}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Recent Activity</Text>
                </View>
                {recentActivity.map((msg) => (
                    <View key={msg.id} style={styles.listItem}>
                        <Avatar.Icon
                            size={36}
                            icon={msg.direction === 'outbound' ? 'arrow-top-right' : 'arrow-bottom-left'}
                            style={{ backgroundColor: msg.direction === 'outbound' ? theme.colors.primaryContainer : theme.colors.secondaryContainer }}
                            color={msg.direction === 'outbound' ? theme.colors.primary : theme.colors.secondary}
                        />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>{msg.phone}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                                {msg.body || (msg.type === 'template' ? `Template: ${msg.templateName}` : 'Message')}
                            </Text>
                        </View>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </Text>
                    </View>
                ))}
                {recentActivity.length === 0 && (
                    <Text style={{ textAlign: 'center', padding: 16, color: theme.colors.onSurfaceVariant }}>No recent activity.</Text>
                )}
            </Surface>
        </ScrollView>
    );

    const [menuVisible, setMenuVisible] = useState(null); // Store order ID for open menu
    const [filterStatus, setFilterStatus] = useState('all');

    const handleManualStatusUpdate = async (orderId, newStatus) => {
        try {
            await updateDoc(doc(db, "orders", orderId), {
                verificationStatus: newStatus,
                updatedAt: new Date()
            });
            setMenuVisible(null);
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Failed to update status");
        }
    };

    const renderCODVerification = () => {
        // Filter Logic
        const pendingOrders = codOrders.filter(o => !o.verificationStatus || o.verificationStatus === 'pending');

        const updateOrders = codOrders.filter(o =>
            o.verificationStatus &&
            o.verificationStatus !== 'pending'
        );

        let displayedOrders = codTab === 'pending' ? pendingOrders : updateOrders;

        if (codTab === 'updates' && filterStatus !== 'all') {
            displayedOrders = displayedOrders.filter(o => o.verificationStatus === filterStatus);
        }

        return (
            <FlatList
                data={displayedOrders}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={() => (
                    <Text style={{ textAlign: 'center', marginTop: 20, color: theme.colors.onSurfaceVariant }}>No orders found.</Text>
                )}
            />
        );
    };

    const renderHeader = React.useCallback(() => {
        const pendingOrders = codOrders.filter(o => !o.verificationStatus || o.verificationStatus === 'pending');
        const updateOrders = codOrders.filter(o => o.verificationStatus && o.verificationStatus !== 'pending');

        const filterOptions = [
            { label: 'All', value: 'all' },
            { label: 'Approved', value: 'approved' },
            { label: 'Cancelled', value: 'cancelled' },
            { label: 'Address Change', value: 'address_change_requested' },
            { label: 'Verified (Pending Addr)', value: 'verified_pending_address' },
        ];

        return (
            <View>
                <View style={{ marginBottom: 16 }}>
                    <SegmentedButtons
                        value={codTab}
                        onValueChange={setCodTab}
                        buttons={[
                            { value: 'pending', label: `Pending (${pendingOrders.length})` },
                            { value: 'updates', label: `Updates (${updateOrders.length})` },
                        ]}
                    />
                </View>

                {codTab === 'updates' && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, flexDirection: 'row' }} contentContainerStyle={{ gap: 8 }}>
                        {filterOptions.map((option) => (
                            <Chip
                                key={option.value}
                                selected={filterStatus === option.value}
                                onPress={() => setFilterStatus(option.value)}
                                showSelectedOverlay
                                mode="outlined"
                                style={{ backgroundColor: filterStatus === option.value ? theme.colors.secondaryContainer : 'transparent', marginRight: 8 }}
                            >
                                {option.label}
                            </Chip>
                        ))}
                    </ScrollView>
                )}

                <Surface style={[styles.infoBanner, { backgroundColor: theme.colors.primaryContainer }]}>
                    <Icon source="information" size={20} color={theme.colors.onPrimaryContainer} />
                    <Text style={{ flex: 1, marginLeft: 8, color: theme.colors.onPrimaryContainer }}>
                        {codTab === 'pending'
                            ? "Orders waiting for customer response."
                            : "Orders with customer activity or manual updates."}
                    </Text>
                </Surface>
            </View>
        );
    }, [codTab, codOrders, filterStatus, theme]);

    const renderItem = React.useCallback(({ item }) => (
        <CODOrderItem
            order={item}
            theme={theme}
            onOpenChat={openChat}
            onOpenMenu={setMenuVisible}
        />
    ), [theme, openChat, setMenuVisible]);

    const renderAbandonedItem = React.useCallback(({ item }) => (
        <AbandonedCartItem item={item} theme={theme} onOpenChat={openChat} />
    ), [theme, openChat]);

    const renderAbandoned = () => (
        <FlatList
            data={abandonedCarts}
            renderItem={renderAbandonedItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
            ListEmptyComponent={() => (
                <Text style={{ textAlign: 'center', marginTop: 20, color: theme.colors.onSurfaceVariant }}>No abandoned carts found.</Text>
            )}
        />
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="WhatsApp Manager" titleStyle={{ fontWeight: 'bold' }} />
                <Appbar.Action icon="cog" onPress={() => { }} />
            </Appbar.Header>

            <View style={styles.segmentContainer}>
                <SegmentedButtons
                    value={tab}
                    onValueChange={setTab}
                    buttons={[
                        { value: 'overview', label: 'Overview' },
                        { value: 'cod', label: 'COD Verify' },
                        { value: 'abandoned', label: 'Recovery' },
                    ]}
                />
            </View>

            {tab === 'overview' && renderOverview()}
            {tab === 'cod' && renderCODVerification()}
            {tab === 'abandoned' && renderAbandoned()}

            {/* Chat Dialog */}
            <Portal>
                <Dialog visible={!!menuVisible} onDismiss={() => setMenuVisible(null)}>
                    <Dialog.Title>Update Status</Dialog.Title>
                    <Dialog.Content>
                        <Button mode="outlined" style={{ marginBottom: 8 }} onPress={() => menuVisible && handleManualStatusUpdate(menuVisible, 'approved')}>
                            Mark as Approved
                        </Button>
                        <Button mode="outlined" style={{ marginBottom: 8 }} onPress={() => menuVisible && handleManualStatusUpdate(menuVisible, 'cancelled')} textColor={theme.colors.error}>
                            Mark as Cancelled
                        </Button>
                        <Button mode="outlined" style={{ marginBottom: 8 }} onPress={() => menuVisible && handleManualStatusUpdate(menuVisible, 'address_change_requested')}>
                            Address Change Requested
                        </Button>
                        <Button mode="outlined" onPress={() => menuVisible && handleManualStatusUpdate(menuVisible, 'pending')}>
                            Reset to Pending
                        </Button>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setMenuVisible(null)}>Cancel</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            {/* Chat Dialog */}
            <Portal>
                <Dialog visible={chatDialogVisible} onDismiss={() => setChatDialogVisible(false)} style={{ maxHeight: '80%' }}>
                    <Dialog.Title>
                        {selectedCustomer?.customerName || 'Customer'}
                    </Dialog.Title>
                    <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
                        <ScrollView contentContainerStyle={{ padding: 16 }}>
                            {chatLoading ? (
                                <ActivityIndicator />
                            ) : chatHistory.length > 0 ? (
                                chatHistory.map((msg) => (
                                    <View key={msg.id} style={{
                                        alignSelf: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                                        backgroundColor: msg.direction === 'outbound' ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
                                        padding: 10,
                                        borderRadius: 12,
                                        marginBottom: 8,
                                        maxWidth: '80%'
                                    }}>
                                        <Text variant="bodyMedium">{msg.body || msg.type}</Text>
                                        <Text variant="labelSmall" style={{ opacity: 0.7, marginTop: 4, alignSelf: 'flex-end' }}>
                                            {msg.timestamp ? new Date(msg.timestamp.toDate ? msg.timestamp.toDate() : msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant }}>No messages found.</Text>
                            )}
                        </ScrollView>
                    </Dialog.ScrollArea>
                    <Dialog.Actions>
                        <Button onPress={() => setChatDialogVisible(false)}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </View>
    );
};

const CODOrderItem = React.memo(({ order, theme, onOpenChat, onOpenMenu }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return '#4ade80'; // Green
            case 'cancelled': return theme.colors.error; // Red
            case 'address_change_requested': return '#f59e0b'; // Orange
            case 'verified_pending_address': return '#3b82f6'; // Blue
            case 'reschedule_requested': return '#8b5cf6'; // Purple
            default: return theme.colors.outline;
        }
    };

    const getStatusLabel = (status) => {
        if (!status) return 'Unverified';
        return status.replace(/_/g, ' ').toUpperCase();
    };

    return (
        <Surface style={[styles.actionCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Order #{order.orderNumber}</Text>
                    <Text variant="bodyMedium">{order.customerName}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>₹{order.totalPrice} • {order.city}</Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        {order.updatedAt?.toDate ? order.updatedAt.toDate().toLocaleString() : ''}
                    </Text>
                </View>
                <Badge style={{ backgroundColor: getStatusColor(order.verificationStatus), alignSelf: 'flex-start', marginLeft: 8 }}>
                    {getStatusLabel(order.verificationStatus)}
                </Badge>
            </View>

            <View style={styles.cardActions}>
                <Button
                    mode="text"
                    icon="message-text-outline"
                    compact
                    onPress={() => onOpenChat(order)}
                >
                    Chat
                </Button>

                <Button
                    mode="text"
                    icon="pencil"
                    compact
                    onPress={() => onOpenMenu(order.id)}
                >
                    Mark As
                </Button>
            </View>
        </Surface>
    );
});

const AbandonedCartItem = React.memo(({ item, theme, onOpenChat }) => (
    <Surface style={[styles.actionCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
                <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.customerName}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
            </View>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>₹{item.totalPrice}</Text>
        </View>

        <View style={{ marginVertical: 8 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                {item.items ? item.items.map(i => i.name).join(', ') : 'Items unknown'}
            </Text>
        </View>

        <View style={styles.cardActions}>
            <Button
                mode="text"
                icon="message-text-outline"
                compact
                onPress={() => onOpenChat(item)}
            >
                Chat
            </Button>
        </View>
    </Surface>
));

const styles = StyleSheet.create({
    container: { flex: 1 },
    segmentContainer: { padding: 16 },
    tabContent: { flex: 1, paddingHorizontal: 16 },
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    statCard: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
    chartCard: { padding: 16, borderRadius: 12, marginBottom: 16, alignItems: 'center' },
    listCard: { padding: 16, borderRadius: 12, marginBottom: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
    actionCard: { padding: 16, borderRadius: 12, marginBottom: 12 },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 12 },
    infoBanner: { flexDirection: 'row', padding: 12, borderRadius: 8, marginBottom: 16, alignItems: 'center' }
});

export default WhatsAppManagerScreen;

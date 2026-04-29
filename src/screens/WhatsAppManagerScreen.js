import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Linking, FlatList, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Surface, useTheme, Button, SegmentedButtons, Avatar, IconButton, Badge, Portal, Dialog, ActivityIndicator, Divider, Icon, Chip, TextInput } from 'react-native-paper';
import { BarChart } from 'react-native-gifted-charts';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CRMLayout } from '../components/CRMLayout';
import { useResponsive } from '../hooks/useResponsive';
import { GiftedChat, Bubble, Send, InputToolbar, Composer } from 'react-native-gifted-chat';

import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

const WhatsAppManagerScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission, user } = useAuth();
    const { isDesktop, width: screenWidth } = useResponsive();

    if (!hasPermission('access_whatsapp')) {
        return <AccessDenied title="WhatsApp Restricted" message="You need permission to access WhatsApp tools." />;
    }

    const [tab, setTab] = useState('overview');
    const [codTab, setCodTab] = useState('pending'); // pending | approved

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

    const [messageStats, setMessageStats] = useState([
        { value: 0, label: 'Sent', frontColor: theme.colors.primary },
        { value: 0, label: 'Delivered', frontColor: theme.colors.secondary },
        { value: 0, label: 'Read', frontColor: '#4ade80' },
        { value: 0, label: 'Replied', frontColor: '#f59e0b' },
    ]);

    useEffect(() => {
        setLoading(true);

        // 1. Fetch COD Orders
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
        });

        // 3. Fetch Recent Activity & Stats (Last 24 Hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const qActivity = query(
            collection(db, "whatsapp_messages"),
            where("timestamp", ">=", twentyFourHoursAgo),
            orderBy("timestamp", "desc")
        );

        const unsubActivity = onSnapshot(qActivity, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Update Recent Activity List (Top 5)
            setRecentActivity(messages.slice(0, 5));

            // Calculate Stats
            let sent = 0;
            let delivered = 0;
            let read = 0;
            let replied = 0;

            messages.forEach(msg => {
                if (msg.direction === 'outbound') {
                    sent++;
                    if (msg.status === 'delivered' || msg.status === 'read') delivered++;
                    if (msg.status === 'read') read++;
                } else if (msg.direction === 'inbound') {
                    replied++;
                }
            });

            setMessageStats([
                { value: sent, label: 'Sent', frontColor: theme.colors.primary },
                { value: delivered, label: 'Delivered', frontColor: theme.colors.secondary },
                { value: read, label: 'Read', frontColor: '#4ade80' },
                { value: replied, label: 'Replied', frontColor: '#f59e0b' },
            ]);

            setLoading(false);
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
            orderBy("timestamp", "desc"), // GiftedChat expects latest first for its internal paging, or we can reverse
            limit(100)
        );

        const unsubChat = onSnapshot(qChat, (snapshot) => {
            const messages = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    _id: doc.id,
                    text: data.body || (data.type === 'template' ? `Template: ${data.templateName}` : ''),
                    createdAt: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
                    user: {
                        _id: data.direction === 'outbound' ? 1 : 2,
                        name: data.direction === 'outbound' ? 'Admin' : (selectedCustomer.customerName || 'Customer'),
                        avatar: data.direction === 'outbound' ? null : `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedCustomer.customerName || 'C')}&background=random`,
                    },
                    received: data.status === 'delivered' || data.status === 'read',
                    sent: data.status === 'sent' || data.status === 'delivered' || data.status === 'read',
                    pending: data.status === 'pending',
                    status: data.status,
                    whatsappId: data.whatsappId,
                    direction: data.direction
                };
            });
            setChatHistory(messages);
            setChatLoading(false);
        }, (error) => {
            if (error.code === 'failed-precondition') {
                console.warn('[Firestore] Chat index is still building...');
            } else {
                console.error('[Firestore] Chat listener error:', error);
            }
            setChatLoading(false);
        });

        return () => unsubChat();
    }, [selectedCustomer]);

    const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
        ? 'https://easey-app.vercel.app' 
        : '';

    const onSend = async (newMessages = []) => {
        const msg = newMessages[0];
        if (!msg || !selectedCustomer) return;

        const phone = selectedCustomer.phoneNormalized || selectedCustomer.phone;

        // Optimistic update for instant feedback
        const optimisticMsg = {
            ...msg,
            _id: Math.random().toString(),
            createdAt: new Date(),
            user: { _id: 1 },
            pending: true,
            direction: 'outbound'
        };
        setChatHistory(prev => [optimisticMsg, ...prev]);

        try {
            const response = await fetch(`${API_BASE}/api/whatsapp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: phone,
                    message: msg.text,
                    type: 'text'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to send");
            }
        } catch (error) {
            console.error("Error sending message:", error);
            showSnackbar(error.message || "Network error while sending message.");
            // Remove the optimistic message on failure
            setChatHistory(prev => prev.filter(m => m._id !== optimisticMsg._id));
        }
    };

    const sendQuickTemplate = async (templateName, components = [], languageCode = "en_US") => {
        if (!selectedCustomer) return;
        
        try {
            const response = await fetch('/api/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedCustomer.phone,
                    type: 'template',
                    templateName,
                    languageCode,
                    components
                })
            });

            if (response.ok) {
                Alert.alert("Success", `Template ${templateName} sent.`);
            } else {
                const errorData = await response.json();
                Alert.alert("Failed to send", errorData.error || "Unknown error");
            }
        } catch (error) {
            console.error("Error sending template:", error);
            Alert.alert("Error", "Network error while sending template.");
        }
    };

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
            Alert.alert("Error", "No phone number found for this order.");
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
                showSnackbar("Message sent successfully");
            } else {
                Alert.alert("Error", "Failed to send: " + (data.error || "Unknown error"));
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Network error sending message.");
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
                <Surface style={[styles.statCard, { backgroundColor: theme.dark ? theme.colors.elevation.level2 : '#f8fafc' }]} elevation={2}>
                    <Avatar.Icon size={44} icon="whatsapp" style={{ backgroundColor: '#25D366' }} />
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginTop: 12, color: theme.colors.onSurface }}>
                        {codOrders.length + abandonedCarts.length}
                    </Text>
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 }}>Active Targets</Text>
                </Surface>
                <Surface style={[styles.statCard, { backgroundColor: theme.dark ? theme.colors.elevation.level2 : '#f0fdf4' }]} elevation={2}>
                    <Avatar.Icon size={44} icon="cash-check" style={{ backgroundColor: '#4ade80' }} color="white" />
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginTop: 12, color: theme.colors.onSurface }}>
                        {codOrders.filter(o => o.verificationStatus === 'approved').length}
                    </Text>
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 }}>Verified Orders</Text>
                </Surface>
            </View>

            <Surface style={[styles.chartCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 16, color: theme.colors.onSurface }}>Message Performance (Last 24h)</Text>
                <View style={{ width: '100%', alignItems: 'center' }}>
                    <BarChart
                        data={messageStats}
                        width={screenWidth - (isDesktop ? 340 : 80)} // Dynamic width based on sidebar
                        height={240}
                        barWidth={32}
                        spacing={40}
                        initialSpacing={30}
                        roundedTop
                        yAxisThickness={0}
                        xAxisThickness={1}
                        xAxisColor={theme.colors.outlineVariant}
                        yAxisColor={theme.colors.outlineVariant}
                        yAxisTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        labelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        rulesColor={theme.colors.outlineVariant}
                        hideRules
                        noOfSections={5}
                    />
                </View>
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

            showSnackbar("Status updated successfully");

            setMenuVisible(null);
        } catch (error) {
            console.error("Error updating status:", error);
            Alert.alert("Error", "Failed to update status");
        }
    };

    const renderCODVerification = () => {
        // Filter Logic
        const pendingOrders = codOrders.filter(o => !o.verificationStatus || o.verificationStatus === 'pending');
        const verifiedOrders = codOrders.filter(o => o.verificationStatus === 'approved');
        const alertOrders = codOrders.filter(o => ['address_change_requested', 'address_updated'].includes(o.verificationStatus));
        const cancelledOrders = codOrders.filter(o => o.verificationStatus === 'cancelled');

        let displayedOrders = [];
        if (codTab === 'pending') displayedOrders = pendingOrders;
        else if (codTab === 'verified') displayedOrders = verifiedOrders;
        else if (codTab === 'alerts') displayedOrders = alertOrders;
        else if (codTab === 'cancelled') displayedOrders = cancelledOrders;

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
        const verifiedOrders = codOrders.filter(o => o.verificationStatus === 'approved');
        const alertOrders = codOrders.filter(o => ['address_change_requested', 'address_updated'].includes(o.verificationStatus));
        const cancelledOrders = codOrders.filter(o => o.verificationStatus === 'cancelled');

        return (
            <View>
                <View style={{ marginBottom: 16 }}>
                    <SegmentedButtons
                        value={codTab}
                        onValueChange={setCodTab}
                        buttons={[
                            { value: 'pending', label: `Pending (${pendingOrders.length})` },
                            { value: 'verified', label: `Verified (${verifiedOrders.length})` },
                            { value: 'alerts', label: `Alerts (${alertOrders.length})` },
                            { value: 'cancelled', label: `Cancelled (${cancelledOrders.length})` },
                        ]}
                    />
                </View>

                <Surface style={[styles.infoBanner, { backgroundColor: theme.colors.primaryContainer }]}>
                    <Icon source="information" size={20} color={theme.colors.onPrimaryContainer} />
                    <Text style={{ flex: 1, marginLeft: 8, color: theme.colors.onPrimaryContainer }}>
                        {codTab === 'pending' && "Orders waiting for customer response."}
                        {codTab === 'verified' && "Orders ready for shipping."}
                        {codTab === 'alerts' && "Orders needing address review."}
                        {codTab === 'cancelled' && "Cancelled orders."}
                    </Text>
                </Surface>
            </View>
        );
    }, [codTab, codOrders, theme]);

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
        <CRMLayout title="WhatsApp Manager" navigation={navigation} scrollable={false} fullWidth={true}>
            <View style={[styles.segmentContainer, { paddingHorizontal: 16 }]}>
                <SegmentedButtons
                    value={tab}
                    onValueChange={setTab}
                    density="medium"
                    buttons={[
                        { value: 'overview', label: 'Overview', icon: 'view-dashboard-outline' },
                        { value: 'cod', label: 'COD Verify', icon: 'checkbox-marked-circle-outline' },
                        { value: 'abandoned', label: 'Recovery', icon: 'cart-arrow-down' },
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
                            Mark as Verified
                        </Button>
                        <Button mode="outlined" style={{ marginBottom: 8 }} onPress={() => menuVisible && handleManualStatusUpdate(menuVisible, 'address_updated')}>
                            Mark as Address Updated
                        </Button>
                        <Button mode="outlined" style={{ marginBottom: 8 }} onPress={() => menuVisible && handleManualStatusUpdate(menuVisible, 'address_change_requested')}>
                            Mark as Change Requested
                        </Button>
                        <Button mode="outlined" style={{ marginBottom: 8 }} onPress={() => menuVisible && handleManualStatusUpdate(menuVisible, 'cancelled')} textColor={theme.colors.error}>
                            Mark as Cancelled
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
                <Dialog 
                    visible={chatDialogVisible} 
                    onDismiss={() => setChatDialogVisible(false)} 
                    style={styles.modalCard}
                >
                    {/* Header: More compact and includes Close button */}
                    <View style={styles.modalHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.headerTitle}>{selectedCustomer?.customerName || 'Customer'}</Text>
                            <Text variant="bodySmall" style={{ opacity: 0.6 }}>{selectedCustomer?.phone}</Text>
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {(() => {
                                const lastInbound = chatHistory.find(m => m.direction === 'inbound');
                                const isWindowOpen = lastInbound && (new Date() - new Date(lastInbound.createdAt)) < 24 * 60 * 60 * 1000;
                                return (
                                    <Badge 
                                        style={{ 
                                            backgroundColor: isWindowOpen ? '#4ade80' : theme.colors.error, 
                                            color: 'white',
                                            paddingHorizontal: 8
                                        }}
                                    >
                                        {isWindowOpen ? '24h Window Open' : 'Window Closed'}
                                    </Badge>
                                );
                            })()}
                            <IconButton 
                                icon="close" 
                                size={24} 
                                onPress={() => setChatDialogVisible(false)} 
                                style={{ margin: 0 }}
                            />
                        </View>
                    </View>

                    <Divider />

                    <View style={{ flex: 1, position: 'relative' }}>
                        {(() => {
                            const lastInbound = chatHistory.find(m => m.direction === 'inbound');
                            const isWindowOpen = lastInbound && (new Date() - new Date(lastInbound.createdAt)) < 24 * 60 * 60 * 1000;
                            
                            return (
                                <View style={{ flex: 1 }}>
                                    {!isWindowOpen && (
                                        <Surface style={styles.windowAlert} elevation={0}>
                                            <Icon source="alert-circle-outline" size={18} color={theme.colors.onErrorContainer} />
                                            <Text style={styles.windowAlertText}>
                                                24h Window Closed. Waiting for customer activity to re-open.
                                            </Text>
                                        </Surface>
                                    )}
                                    
                                    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
                                        <GiftedChat
                                            messages={chatHistory}
                                            onSend={messages => onSend(messages)}
                                            user={{ _id: 1 }}
                                            renderUsernameOnMessage={true}
                                            showUserAvatar={false}
                                            alwaysShowSend={isWindowOpen}
                                            renderComposer={props => (
                                                <Composer
                                                    {...props}
                                                    textInputProps={{
                                                        ...props.textInputProps,
                                                        onKeyPress: (e) => {
                                                            if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                                                                e.preventDefault();
                                                                if (props.text && props.text.trim().length > 0) {
                                                                    props.onSend({ text: props.text.trim() }, true);
                                                                }
                                                            }
                                                        }
                                                    }}
                                                />
                                            )}
                                            renderInputToolbar={props => isWindowOpen ? (
                                                <InputToolbar 
                                                    {...props} 
                                                    containerStyle={{ 
                                                        borderTopWidth: 1, 
                                                        borderTopColor: theme.colors.outlineVariant,
                                                        backgroundColor: theme.colors.surface
                                                    }} 
                                                />
                                            ) : null}
                                            scrollToBottom
                                            textInputStyle={{ color: theme.colors.onSurface }}
                                            renderLoading={() => <ActivityIndicator style={{ marginTop: 20 }} />}
                                            renderBubble={props => (
                                                <Bubble
                                                    {...props}
                                                    wrapperStyle={{
                                                        right: { backgroundColor: theme.colors.primary },
                                                        left: { backgroundColor: theme.colors.elevation.level2 }
                                                    }}
                                                    renderTicks={(msg) => {
                                                        if (msg.user._id !== 1) return null;
                                                        const color = msg.status === 'read' ? '#3b82f6' : '#fff';
                                                        const icon = (msg.status === 'delivered' || msg.status === 'read') ? 'check-all' : 'check';
                                                        return (
                                                            <View style={{ marginRight: 5 }}>
                                                                <Icon source={icon} size={14} color={color} />
                                                            </View>
                                                        );
                                                    }}
                                                />
                                            )}
                                            renderSend={props => (
                                                <Send {...props} containerStyle={{ justifyContent: 'center', alignItems: 'center' }}>
                                                    <View style={{ marginRight: 10 }}>
                                                        <Icon source="send" color={theme.colors.primary} size={24} />
                                                    </View>
                                                </Send>
                                            )}
                                        />
                                    </View>
                                </View>
                            );
                        })()}
                    </View>
                </Dialog>
            </Portal>
        </CRMLayout>
    );
};

const CODOrderItem = React.memo(({ order, theme, onOpenChat, onOpenMenu }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return '#4ade80'; // Green
            case 'cancelled': return theme.colors.error; // Red
            case 'address_change_requested': return '#f59e0b'; // Orange
            case 'address_updated': return '#8b5cf6'; // Purple
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
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1} adjustsFontSizeToFit>
                        ₹{order.totalPrice} • {order.city}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        {order.updatedAt?.toDate ? order.updatedAt.toDate().toLocaleString() : ''}
                    </Text>
                </View>
                <Badge style={{ backgroundColor: getStatusColor(order.verificationStatus), alignSelf: 'flex-start', marginLeft: 8 }}>
                    {getStatusLabel(order.verificationStatus)}
                </Badge>
            </View>

            {order.updatedAddress && (
                <Surface style={{ marginTop: 12, padding: 8, borderRadius: 8, backgroundColor: theme.dark ? '#1e293b' : '#f0f9ff', borderLeftWidth: 4, borderLeftColor: '#3b82f6' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Icon source="map-marker-check" size={16} color="#3b82f6" />
                        <Text variant="labelSmall" style={{ color: '#3b82f6', fontWeight: 'bold', marginLeft: 4 }}>NEW ADDRESS RECEIVED:</Text>
                    </View>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>{order.updatedAddress}</Text>
                </Surface>
            )}

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
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }} numberOfLines={1} adjustsFontSizeToFit>
                ₹{item.totalPrice}
            </Text>
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
    segmentContainer: { paddingVertical: 16 },
    tabContent: { flex: 1, paddingHorizontal: 16 },
    statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    statCard: { 
        flex: 1, 
        padding: 24, 
        borderRadius: 24, 
        alignItems: 'center',
    },
    chartCard: { 
        padding: 24, 
        borderRadius: 24, 
        marginBottom: 24, 
        alignItems: 'center',
    },
    listCard: { 
        padding: 24, 
        borderRadius: 24, 
        marginBottom: 24,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    listItem: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 16, 
        borderBottomWidth: 0.5, 
    },
    actionCard: { 
        padding: 24, 
        borderRadius: 24, 
        marginBottom: 16,
    },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 16, gap: 12 },
    infoBanner: { 
        flexDirection: 'row', 
        padding: 16, 
        borderRadius: 16, 
        marginBottom: 16, 
        alignItems: 'center' 
    },
    modalCard: {
        maxWidth: 800,
        width: '95%',
        height: '85%',
        maxHeight: '85%',
        alignSelf: 'center',
        borderRadius: 24,
        overflow: 'hidden',
        padding: 0, // CRITICAL: Remove Dialog internal padding
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    windowAlert: {
        padding: 8,
        backgroundColor: '#fee2e2', // Light red for window closed
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    windowAlertText: {
        marginLeft: 8,
        fontSize: 12,
        fontWeight: '500',
        color: '#991b1b',
    },
    modalFooter: {
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    quickActionButton: {
        borderRadius: 20,
        borderColor: '#e2e8f0',
    }
});

export default WhatsAppManagerScreen;

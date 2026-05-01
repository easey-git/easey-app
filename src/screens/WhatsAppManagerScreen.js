import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Linking, FlatList, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Surface, useTheme, Button, SegmentedButtons, Avatar, IconButton, Badge, Portal, Dialog, ActivityIndicator, Divider, Icon, Chip, TextInput, Snackbar, TouchableRipple, List } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { read, utils } from 'xlsx';
import { BarChart } from 'react-native-gifted-charts';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, limit, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
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
    const [loadingMore, setLoadingMore] = useState(false);
    const [sendingId, setSendingId] = useState(null);
    const [activityLimit, setActivityLimit] = useState(10);
    const [activitySearch, setActivitySearch] = useState('');
    
    // NDR Engine State
    const [ndrRecords, setNdrRecords] = useState([]);
    const [ndrLoading, setNdrLoading] = useState(false);
    const [ndrStats, setNdrStats] = useState({ total: 0, matched: 0, pending: 0 });
    const [ndrFilter, setNdrFilter] = useState('all'); // all | matched | unsent | sent
    const [isBulkSending, setIsBulkSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(0);

    // Message Viewer State
    const [chatDialogVisible, setChatDialogVisible] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [chatHistory, setChatHistory] = useState(null);
    const [chatLoading, setChatLoading] = useState(false);

    const [messageStats, setMessageStats] = useState([
        { value: 0, label: 'Sent', frontColor: theme.colors.primary },
        { value: 0, label: 'Delivered', frontColor: theme.colors.secondary },
        { value: 0, label: 'Read', frontColor: '#4ade80' },
        { value: 0, label: 'Replied', frontColor: '#f59e0b' },
    ]);

    // Snackbar State
    const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
    const showSnackbar = (message) => setSnackbar({ visible: true, message });
    const hideSnackbar = () => setSnackbar({ visible: false, message: '' });

    useEffect(() => {
        setLoading(true);

        // 1. Fetch COD Orders (Sorted by latest activity)
        const qOrders = query(
            collection(db, "orders"),
            where("status", "in", ["COD", "CANCELLED"]),
            orderBy("updatedAt", "desc"),
            limit(100)
        );

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                verificationStatus: doc.data().verificationStatus || 'pending'
            }));
            
            // Industrial-grade sort: Always use the latest available timestamp
            const sortedOrders = orders.sort((a, b) => {
                const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate() : (a.createdAt?.toDate ? a.createdAt.toDate() : 0);
                const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate() : (b.createdAt?.toDate ? b.createdAt.toDate() : 0);
                return timeB - timeA;
            });

            setCodOrders(sortedOrders);
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
            setAbandonedCarts(carts.sort((a, b) => {
                const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate() : (a.createdAt?.toDate ? a.createdAt.toDate() : 0);
                const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate() : (b.createdAt?.toDate ? b.createdAt.toDate() : 0);
                return timeB - timeA;
            }));
        });

        // 3. Fetch Recent Activity & Stats (Dynamic Limit)
        const qActivity = query(
            collection(db, "whatsapp_messages"),
            orderBy("timestamp", "desc"),
            limit(activityLimit)
        );

        const unsubActivity = onSnapshot(qActivity, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Update Recent Activity List (All fetched messages for grouping)
            setRecentActivity(messages);

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
            setLoadingMore(false);
        });

        return () => {
            unsubOrders();
            unsubCarts();
            unsubActivity();
        };
    }, [activityLimit]);

    // Fetch Chat History
    useEffect(() => {
        if (!selectedCustomer) return;
        
        // Reset chat history when switching customers to avoid "Checking..." hang
        setChatHistory(null);
        
        if (!selectedCustomer.phone && !selectedCustomer.phoneNormalized) {
            setChatHistory([]); // No phone, no chat
            return;
        }

        setChatLoading(true);

        // Robust phone normalization for varied sources (Shopify vs Firestore)
        let phoneDigits = selectedCustomer.phoneNormalized || selectedCustomer.phone;
        if (phoneDigits) {
            phoneDigits = phoneDigits.toString().replace(/\D/g, '');
            if (phoneDigits.length === 10) {
                phoneDigits = '91' + phoneDigits;
            }
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

    const API_BASE = (typeof window !== 'undefined' && window.location?.hostname === 'localhost')
        ? 'https://easey-app.vercel.app' 
        : 'https://easey-app.vercel.app';

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
            const response = await fetch(`${API_BASE}/api/whatsapp`, {
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
            const response = await fetch(`${API_BASE}/api/whatsapp`, {
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
        navigation.navigate('WhatsAppChat', { customer });
    };

    // NDR Engine Logic
    const handleNDRUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
            });

            if (result.canceled) return;

            setNdrLoading(true);
            const file = result.assets[0];
            
            let content;
            if (Platform.OS === 'web') {
                const response = await fetch(file.uri);
                const blob = await response.arrayBuffer();
                const workbook = read(blob);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                content = utils.sheet_to_json(sheet);
            } else {
                // Mobile implementation might differ depending on how Expo handles URIs
                const response = await fetch(file.uri);
                const blob = await response.arrayBuffer();
                const workbook = read(blob);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                content = utils.sheet_to_json(sheet);
            }

            if (!content || content.length === 0) {
                throw new Error("CSV file is empty or invalid.");
            }

            const processed = content.map((row, index) => ({
                id: `ndr-${index}`,
                orderNumber: row['Order Number']?.toString() || '',
                awb: row['AWB Number']?.toString() || '',
                reason: row['Details'] || row['Reason'] || 'N/A',
                status: row['Order Status'] || 'Exception',
                attempts: row['Attempts'] || '0',
                carrier: row['Carrier'] || 'N/A',
                location: `${row['City'] || ''}, ${row['State'] || ''}`.trim().replace(/^, |, $/g, ''),
                customerName: '', // To be filled from Firestore
                phone: '',        // To be filled from Firestore
                isMatched: false,
                isSent: false,
                originalRow: row
            }));

            setNdrRecords(processed);
            matchNDROrders(processed);
        } catch (error) {
            console.error("NDR Upload Error:", error);
            showSnackbar("Failed to process CSV: " + error.message);
        } finally {
            setNdrLoading(false);
        }
    };

    const matchNDROrders = async (records) => {
        setNdrLoading(true);
        const updatedRecords = [...records];
        let matchedCount = 0;

        // Future-Proof Industry Standard: Batch Processing (30 items at a time - Firestore 'in' limit)
        const CHUNK_SIZE = 30;
        const chunks = [];
        for (let i = 0; i < updatedRecords.length; i += CHUNK_SIZE) {
            chunks.push(updatedRecords.slice(i, i + CHUNK_SIZE));
        }

        try {
            for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
                const chunk = chunks[chunkIdx];
                
                // Create a set of possible formats for the query (String, Number, with/without #)
                const queryVariants = [];
                chunk.forEach(r => {
                    const raw = r.orderNumber.toString().trim();
                    const clean = raw.replace('#', '').trim();
                    
                    queryVariants.push(raw); // Original (#3342)
                    queryVariants.push(clean); // Clean String (3342)
                    if (!isNaN(clean)) queryVariants.push(Number(clean)); // Numeric (3342)
                });
                
                // Filter unique variants and limit to 30 for Firestore 'in' query
                const uniqueVariants = [...new Set(queryVariants)].slice(0, 30);
                
                if (uniqueVariants.length === 0) continue;

                // 1. Batch fetch orders with variant support
                const qOrders = query(
                    collection(db, "orders"),
                    where("orderNumber", "in", uniqueVariants)
                );
                const orderSnap = await getDocs(qOrders);
                const orderMap = {};
                orderSnap.forEach(doc => {
                    const data = doc.data();
                    // Map by every possible variant for instant lookup
                    orderMap[data.orderNumber?.toString()] = data;
                    if (data.orderNumber?.toString().startsWith('#')) {
                        orderMap[data.orderNumber.replace('#', '')] = data;
                    }
                });

                // 2. Batch fetch sent messages using the same variants
                const qMsgs = query(
                    collection(db, "whatsapp_messages"),
                    where("orderNumber", "in", uniqueVariants),
                    where("templateName", "==", "alert_shipping_ndr")
                );
                const msgSnap = await getDocs(qMsgs);
                const sentSet = new Set();
                msgSnap.forEach(doc => {
                    sentSet.add(doc.data().orderNumber?.toString());
                });

                // 3. Update records in this chunk
                for (let i = 0; i < chunk.length; i++) {
                    const recIdx = (chunkIdx * CHUNK_SIZE) + i;
                    const rawNum = updatedRecords[recIdx].orderNumber.toString().trim();
                    const cleanNum = rawNum.replace('#', '').trim();
                    
                    // Try to find the order using any of its variants
                    const orderData = orderMap[rawNum] || orderMap[cleanNum] || orderMap[Number(cleanNum)];

                    if (orderData) {
                        updatedRecords[recIdx] = {
                            ...updatedRecords[recIdx],
                            customerName: orderData.customerName || 'Customer',
                            phone: orderData.phone || '',
                            isMatched: true,
                            isSent: sentSet.has(rawNum) || sentSet.has(cleanNum) || sentSet.has(Number(cleanNum).toString())
                        };
                        matchedCount++;
                    }
                }

                // Smooth Progress Update
                setNdrRecords([...updatedRecords]);
                setNdrStats({
                    total: records.length,
                    matched: matchedCount,
                    pending: records.length - matchedCount
                });
                
                // Small yield to keep UI responsive during large batches
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } catch (error) {
            console.error("Industrial Batch Matching Error:", error);
            showSnackbar("Error during batch matching: " + error.message);
        } finally {
            setNdrLoading(false);
        }
    };

    const sendNDRTemplate = async (record) => {
        if (!record.phone) return { success: false, error: "No phone" };

        try {
            const response = await fetch(`${API_BASE}/api/whatsapp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: record.phone,
                    type: 'template',
                    templateName: 'alert_shipping_ndr',
                    orderNumber: record.orderNumber.toString().replace('#', '').trim(),
                    languageCode: 'en',
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: record.customerName || 'Customer' },
                                { type: 'text', text: record.orderNumber || 'Order' },
                                { type: 'text', text: record.reason || 'Delivery Exception' }
                            ]
                        }
                    ]
                })
            });

            if (response.ok) {
                setNdrRecords(prev => prev.map(r => r.id === record.id ? { ...r, isSent: true } : r));
                return { success: true };
            } else {
                const data = await response.json();
                return { success: false, error: data.error };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const handleBulkSend = async () => {
        const toSend = ndrRecords.filter(r => r.isMatched && !r.isSent);
        if (toSend.length === 0) {
            showSnackbar("No pending matched records to send.");
            return;
        }

        Alert.alert(
            "Bulk Send",
            `Are you sure you want to send templates to ${toSend.length} customers?`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Shoot All", 
                    onPress: async () => {
                        setIsBulkSending(true);
                        setBulkProgress(0);
                        let sent = 0;

                        for (let i = 0; i < toSend.length; i++) {
                            const record = toSend[i];
                            setSendingId(record.id);
                            
                            const result = await sendNDRTemplate(record);
                            if (result.success) sent++;

                            setBulkProgress((i + 1) / toSend.length);
                            
                            // Industry Standard: Safe delay to avoid Meta rate limits (600ms)
                            await new Promise(resolve => setTimeout(resolve, 600));
                        }

                        setIsBulkSending(false);
                        setSendingId(null);
                        showSnackbar(`Bulk send complete: ${sent} messages sent successfully.`);
                    }
                }
            ]
        );
    };

    const renderNDREngine = () => {
        const filteredRecords = ndrRecords.filter(r => {
            if (ndrFilter === 'matched') return r.isMatched;
            if (ndrFilter === 'unsent') return r.isMatched && !r.isSent;
            if (ndrFilter === 'sent') return r.isSent;
            return true;
        });

        return (
            <View style={{ flex: 1 }}>
                <Surface style={[styles.ndrHeader, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
                        <View>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>NDR Processing Hub</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Automated delivery follow-ups</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Button 
                                mode="outlined" 
                                onPress={handleNDRUpload} 
                                icon="upload"
                                disabled={ndrLoading || isBulkSending}
                            >
                                Upload
                            </Button>
                            {ndrRecords.length > 0 && (
                                <Button 
                                    mode="contained" 
                                    onPress={handleBulkSend} 
                                    icon="rocket-launch"
                                    loading={isBulkSending}
                                    disabled={ndrLoading || isBulkSending || !ndrRecords.some(r => r.isMatched && !r.isSent)}
                                >
                                    Bulk Shoot
                                </Button>
                            )}
                        </View>
                    </View>

                    {isBulkSending && (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text variant="labelSmall">Sending Messages...</Text>
                                <Text variant="labelSmall">{Math.round(bulkProgress * 100)}%</Text>
                            </View>
                            <View style={{ height: 4, backgroundColor: theme.colors.surfaceVariant, borderRadius: 2, overflow: 'hidden' }}>
                                <View style={{ height: '100%', width: `${bulkProgress * 100}%`, backgroundColor: theme.colors.primary }} />
                            </View>
                        </View>
                    )}

                    {ndrRecords.length > 0 && (
                        <View style={styles.ndrFilterRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                <Chip 
                                    selected={ndrFilter === 'all'} 
                                    onPress={() => setNdrFilter('all')}
                                    showSelectedOverlay
                                >
                                    All ({ndrRecords.length})
                                </Chip>
                                <Chip 
                                    selected={ndrFilter === 'unsent'} 
                                    onPress={() => setNdrFilter('unsent')}
                                    showSelectedOverlay
                                    icon="clock-outline"
                                >
                                    Pending ({ndrRecords.filter(r => r.isMatched && !r.isSent).length})
                                </Chip>
                                <Chip 
                                    selected={ndrFilter === 'sent'} 
                                    onPress={() => setNdrFilter('sent')}
                                    showSelectedOverlay
                                    icon="check-circle-outline"
                                >
                                    Sent ({ndrRecords.filter(r => r.isSent).length})
                                </Chip>
                                <Chip 
                                    selected={ndrFilter === 'matched'} 
                                    onPress={() => setNdrFilter('matched')}
                                    showSelectedOverlay
                                >
                                    Matched ({ndrStats.matched})
                                </Chip>
                                <Button 
                                    compact 
                                    onPress={() => {
                                        const hasSent = ndrRecords.some(r => r.isSent);
                                        if (hasSent) {
                                            Alert.alert(
                                                "Clear Records",
                                                "Do you want to clear only unprocessed records or everything?",
                                                [
                                                    { text: "Cancel", style: "cancel" },
                                                    { 
                                                        text: "Unprocessed Only", 
                                                        onPress: () => setNdrRecords(prev => prev.filter(r => r.isSent)) 
                                                    },
                                                    { 
                                                        text: "Clear All", 
                                                        style: "destructive",
                                                        onPress: () => setNdrRecords([]) 
                                                    }
                                                ]
                                            );
                                        } else {
                                            setNdrRecords([]);
                                        }
                                    }} 
                                    textColor={theme.colors.error}
                                >
                                    Clear
                                </Button>
                            </ScrollView>
                        </View>
                    )}
                </Surface>

                <FlatList
                    data={filteredRecords}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    renderItem={({ item }) => (
                        <Surface style={[styles.ndrCard, { backgroundColor: theme.colors.surface, opacity: item.isSent ? 0.7 : 1 }]} elevation={1}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Order {item.orderNumber}</Text>
                                        {item.isSent ? (
                                            <Badge style={{ backgroundColor: '#3b82f6', marginLeft: 8 }}>SENT</Badge>
                                        ) : item.isMatched ? (
                                            <Badge style={{ backgroundColor: '#4ade80', marginLeft: 8 }}>READY</Badge>
                                        ) : (
                                            <Badge style={{ backgroundColor: theme.colors.error, marginLeft: 8 }}>NOT FOUND</Badge>
                                        )}
                                    </View>
                                    <Text variant="bodyMedium">{item.customerName || 'Customer not found'}</Text>
                                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Icon source="truck-outline" size={14} color={theme.colors.onSurfaceVariant} />
                                            <Text variant="labelSmall" style={{ marginLeft: 4, color: theme.colors.onSurfaceVariant }}>{item.carrier}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Icon source="map-marker-outline" size={14} color={theme.colors.onSurfaceVariant} />
                                            <Text variant="labelSmall" style={{ marginLeft: 4, color: theme.colors.onSurfaceVariant }}>{item.location}</Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>AWB: {item.awb}</Text>
                                        <Text variant="labelSmall" style={{ marginLeft: 12, color: theme.colors.secondary }}>Attempt: {item.attempts}</Text>
                                    </View>
                                    <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 6, fontWeight: '500' }}>Reason: {item.reason}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>{item.phone || '---'}</Text>
                                    <View style={{ flexDirection: 'row', marginTop: 12 }}>
                                        <IconButton 
                                            icon="chat-outline" 
                                            mode="contained-tonal"
                                            size={20}
                                            onPress={() => openChat({ phone: item.phone, customerName: item.customerName })}
                                            disabled={!item.isMatched || isBulkSending}
                                        />
                                        <IconButton 
                                            icon={item.isSent ? "check-all" : "send"} 
                                            mode={item.isSent ? "outlined" : "contained"}
                                            onPress={async () => {
                                                setSendingId(item.id);
                                                await sendNDRTemplate(item);
                                                setSendingId(null);
                                            }}
                                            loading={sendingId === item.id}
                                            disabled={!item.isMatched || item.isSent || sendingId === item.id || isBulkSending}
                                            iconColor={item.isSent ? theme.colors.primary : '#FFFFFF'}
                                            containerColor={item.isSent ? 'transparent' : theme.colors.primary}
                                            size={20}
                                        />
                                    </View>
                                </View>
                            </View>
                        </Surface>
                    )}
                    ListEmptyComponent={() => (
                        <View style={{ alignItems: 'center', marginTop: 60, opacity: 0.5 }}>
                            <Icon source={ndrRecords.length > 0 ? "filter-variant-remove" : "file-upload-outline"} size={80} color={theme.colors.onSurfaceVariant} />
                            <Text variant="headlineSmall" style={{ marginTop: 16 }}>
                                {ndrRecords.length > 0 ? "No results for this filter" : "No NDR Data"}
                            </Text>
                            <Text variant="bodyMedium">
                                {ndrRecords.length > 0 ? "Try changing your filter settings" : "Upload a CSV file to begin processing"}
                            </Text>
                        </View>
                    )}
                />
            </View>
        );
    };

    // Memoized Stats for Overview to prevent flickering
    const stats = React.useMemo(() => {
        const pendingCOD = codOrders.filter(o => !o.verificationStatus || o.verificationStatus === 'pending').length;
        const verifiedToday = codOrders.filter(o => o.verificationStatus === 'approved').length;
        
        return {
            activeTargets: pendingCOD + abandonedCarts.length,
            verifiedOrders: verifiedToday,
            isDataReady: !loading
        };
    }, [abandonedCarts, codOrders, loading]);

    const dynamicStyles = {
        statsGrid: { 
            flexDirection: isDesktop ? 'row' : 'column', 
            gap: 16, 
            marginBottom: 16 
        },
        actionCard: {
            padding: isDesktop ? 24 : 16,
            borderRadius: 24,
            marginBottom: 16,
            backgroundColor: theme.colors.surface,
        },
        modalCard: {
            maxWidth: 800,
            width: isDesktop ? '95%' : '100%',
            height: isDesktop ? '85%' : '100%',
            margin: 0,
            alignSelf: 'center',
            borderRadius: isDesktop ? 24 : 0,
            overflow: 'hidden',
            padding: 0,
            backgroundColor: theme.colors.surface,
        }
    };

    const renderOverview = () => (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
            <View style={dynamicStyles.statsGrid}>
                <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level2 }]} elevation={2}>
                    <Avatar.Icon size={44} icon="whatsapp" style={{ backgroundColor: '#25D366' }} />
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginTop: 12, color: theme.colors.onSurface }}>
                        {stats.isDataReady ? stats.activeTargets : '...'}
                    </Text>
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 }}>Active Targets</Text>
                </Surface>
            </View>

            <Surface style={[styles.chartCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 16, color: theme.colors.onSurface }}>Message Performance (Last 24h)</Text>
                <View style={{ width: '100%', alignItems: 'center' }}>
                    <BarChart
                        data={messageStats}
                        width={screenWidth - (isDesktop ? 340 : 80)}
                        height={240}
                        barWidth={35}
                        spacing={30}
                        initialSpacing={20}
                        roundedTop
                        roundedBottom
                        hideRules
                        xAxisThickness={0}
                        yAxisThickness={0}
                        yAxisTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        noOfSections={3}
                        maxValue={Math.max(...messageStats.map(s => s.value), 10)}
                        showValuesAsTopLabel
                        topLabelTextStyle={{ 
                            color: '#fff', 
                            fontSize: 10, 
                            fontWeight: 'bold',
                            textAlign: 'center',
                            width: 35
                        }}
                        topLabelContainerStyle={{
                            marginBottom: -22,
                            zIndex: 10
                        }}
                    />
                </View>
            </Surface>

            {/* Recent Activity Section */}
            <Surface style={[styles.listCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                {(() => {
                    // 1. Group by unique phone number (Latest message first)
                    const uniqueConversations = [];
                    const seenPhones = new Set();

                    recentActivity.forEach(msg => {
                        if (!seenPhones.has(msg.phone)) {
                            seenPhones.add(msg.phone);
                            uniqueConversations.push(msg);
                        }
                    });

                    // 2. Filter by search query
                    const filtered = uniqueConversations.filter(msg => {
                        const customer = codOrders.find(o => o.phone === msg.phone || o.phoneNormalized === msg.phoneNormalized) ||
                                       abandonedCarts.find(c => c.phone === msg.phone || c.phoneNormalized === msg.phoneNormalized);
                        const name = customer ? customer.customerName.toLowerCase() : '';
                        const phoneSearch = msg.phone.toLowerCase();
                        const query = activitySearch.toLowerCase();
                        return name.includes(query) || phoneSearch.includes(query);
                    });

                    // Sub-header with correct counts
                    const renderActivityHeader = () => (
                        <View style={[styles.cardHeader, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Conversations</Text>
                                <Badge style={{ backgroundColor: theme.colors.primaryContainer, color: theme.colors.primary }}>{uniqueConversations.length} Customers</Badge>
                            </View>
                            <TextInput
                                placeholder="Search by name or phone..."
                                value={activitySearch}
                                onChangeText={setActivitySearch}
                                mode="outlined"
                                style={{ width: '100%', height: 40, backgroundColor: theme.colors.surface }}
                                left={<TextInput.Icon icon="magnify" />}
                                dense
                            />
                        </View>
                    );

                    if (filtered.length === 0) {
                        return (
                            <View>
                                {renderActivityHeader()}
                                <Text style={{ textAlign: 'center', padding: 32, color: theme.colors.onSurfaceVariant }}>No conversations found.</Text>
                            </View>
                        );
                    }

                    return (
                        <View>
                            {renderActivityHeader()}
                            {filtered.map((msg, index) => (
                    <React.Fragment key={msg.id}>
                        <TouchableRipple
                            onPress={() => {
                                const customer = codOrders.find(o => o.phone === msg.phone || o.phoneNormalized === msg.phoneNormalized) ||
                                               abandonedCarts.find(c => c.phone === msg.phone || c.phoneNormalized === msg.phoneNormalized);
                                openChat(customer || { phone: msg.phone, customerName: msg.phone });
                            }}
                            rippleColor="rgba(0, 0, 0, .05)"
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                                <Avatar.Icon
                                    size={44}
                                    icon={msg.direction === 'outbound' ? 'arrow-top-right' : 'arrow-bottom-left'}
                                    style={{ backgroundColor: msg.direction === 'outbound' ? theme.colors.primaryContainer : theme.colors.secondaryContainer }}
                                    color={msg.direction === 'outbound' ? theme.colors.primary : theme.colors.secondary}
                                />
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text variant="bodyLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                            {(() => {
                                                const customer = codOrders.find(o => o.phone === msg.phone || o.phoneNormalized === msg.phoneNormalized) ||
                                                               abandonedCarts.find(c => c.phone === msg.phone || c.phoneNormalized === msg.phoneNormalized);
                                                return customer ? customer.customerName : msg.phone;
                                            })()}
                                        </Text>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.8 }}>
                                            {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </Text>
                                    </View>
                                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, marginRight: 20 }} numberOfLines={1}>
                                        {msg.body || (msg.type === 'template' ? `Template: ${msg.templateName}` : 'Message')}
                                    </Text>
                                </View>
                            </View>
                        </TouchableRipple>
                        {index < filtered.length - 1 && <Divider style={{ marginHorizontal: 16, opacity: 0.3 }} />}
                    </React.Fragment>
                    ))}
                    {loadingMore ? (
                        <ActivityIndicator 
                            animating={true} 
                            color={theme.colors.primary} 
                            style={{ marginVertical: 20 }} 
                        />
                    ) : (
                        <Button 
                            mode="contained-tonal" 
                            onPress={() => {
                                setLoadingMore(true);
                                setActivityLimit(prev => prev + 20);
                            }}
                            style={{ margin: 16, borderRadius: 12 }}
                            icon="plus"
                        >
                            Load More Conversations
                        </Button>
                    )}
                </View>
                )
            })()}
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
        const activeCodOrders = codOrders;
        
        const pendingOrders = activeCodOrders.filter(o => !o.verificationStatus || o.verificationStatus === 'pending');
        const verifiedOrders = activeCodOrders.filter(o => o.verificationStatus === 'approved');
        const alertOrders = activeCodOrders.filter(o => ['address_change_requested', 'address_updated'].includes(o.verificationStatus));
        const cancelledOrders = activeCodOrders.filter(o => o.verificationStatus === 'cancelled');

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
        const activeCodOrders = codOrders;

        const pendingOrders = activeCodOrders.filter(o => !o.verificationStatus || o.verificationStatus === 'pending');
        const verifiedOrders = activeCodOrders.filter(o => o.verificationStatus === 'approved');
        const alertOrders = activeCodOrders.filter(o => ['address_change_requested', 'address_updated'].includes(o.verificationStatus));
        const cancelledOrders = activeCodOrders.filter(o => o.verificationStatus === 'cancelled');

        return (
            <View>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={{ paddingBottom: 8 }}
                >
                    <SegmentedButtons
                        value={codTab}
                        onValueChange={setCodTab}
                        style={{ minWidth: isDesktop ? '100%' : 600 }}
                        buttons={[
                            { value: 'pending', label: `Pending (${pendingOrders.length})` },
                            { value: 'verified', label: `Verified (${verifiedOrders.length})` },
                            { value: 'alerts', label: `Alerts (${alertOrders.length})` },
                            { value: 'cancelled', label: `Cancelled (${cancelledOrders.length})` },
                        ]}
                    />
                </ScrollView>

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
            showSnackbar={showSnackbar}
        />
    ), [theme, openChat, setMenuVisible, showSnackbar]);

    const renderAbandonedItem = React.useCallback(({ item }) => (
        <AbandonedCartItem 
            item={item} 
            theme={theme} 
            onOpenChat={openChat} 
            showSnackbar={showSnackbar}
        />
    ), [theme, openChat, showSnackbar]);

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
            <View style={{ backgroundColor: theme.colors.surface, elevation: 2, zIndex: 10 }}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={{ 
                        paddingHorizontal: 16, 
                        paddingVertical: 12,
                        minWidth: '100%',
                        justifyContent: 'center' 
                    }}
                >
                    <SegmentedButtons
                        value={tab}
                        onValueChange={setTab}
                        density="medium"
                        style={{ minWidth: isDesktop ? '100%' : 800 }} // Boosted width for long labels
                        buttons={[
                            { value: 'overview', label: 'Overview', icon: 'view-dashboard-outline' },
                            { value: 'cod', label: 'COD Verify', icon: 'checkbox-marked-circle-outline' },
                            { value: 'abandoned', label: 'Recovery Center', icon: 'cart-arrow-down' },
                            { value: 'ndr', label: 'NDR Engine', icon: 'truck-delivery-outline' },
                        ]}
                    />
                </ScrollView>
            </View>

            <View style={{ flex: 1 }}>
                {tab === 'overview' && renderOverview()}
                {tab === 'cod' && renderCODVerification()}
                {tab === 'abandoned' && renderAbandoned()}
                {tab === 'ndr' && renderNDREngine()}
            </View>

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

            <Snackbar
                visible={snackbar.visible}
                onDismiss={hideSnackbar}
                duration={2000}
                style={{ backgroundColor: theme.colors.inverseSurface }}
                action={{
                    label: 'OK',
                    onPress: hideSnackbar,
                }}
            >
                {snackbar.message}
            </Snackbar>
        </CRMLayout>
    );
};

const CODOrderItem = React.memo(({ order, theme, onOpenChat, onOpenMenu, showSnackbar }) => {
    const { isDesktop } = useResponsive();
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

    const copyToClipboard = (text) => {
        if (Platform.OS === 'web') {
            navigator.clipboard.writeText(text);
        } else {
            // For mobile, you might use Clipboard from react-native or expo-clipboard
            // For now, assuming web-first dashboard
            navigator.clipboard?.writeText(text);
        }
        showSnackbar("Copied to clipboard!");
    };

    return (
        <Surface 
            style={[
                styles.actionCard, 
                { 
                    backgroundColor: theme.colors.surface,
                    padding: isDesktop ? 24 : 16 
                }
            ]} 
            elevation={1}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Order #{order.orderNumber}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text variant="bodyMedium">{order.customerName}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{order.phone}</Text>
                        <IconButton 
                            icon="content-copy" 
                            size={16} 
                            style={{ margin: 0, padding: 0 }} 
                            onPress={() => copyToClipboard(order.phone)} 
                        />
                    </View>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
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
                <Surface style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#1e293b', borderLeftWidth: 4, borderLeftColor: '#3b82f6' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                <Icon source="map-marker-check" size={16} color="#3b82f6" />
                                <Text variant="labelSmall" style={{ color: '#3b82f6', fontWeight: 'bold', marginLeft: 4 }}>NEW ADDRESS RECEIVED:</Text>
                            </View>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>{order.updatedAddress}</Text>
                        </View>
                        <IconButton 
                            icon="content-copy" 
                            size={18} 
                            onPress={() => copyToClipboard(order.updatedAddress)}
                            iconColor="#3b82f6"
                            style={{ margin: 0 }}
                        />
                    </View>
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

const AbandonedCartItem = React.memo(({ item, theme, onOpenChat, showSnackbar }) => {
    const { isDesktop } = useResponsive();
    const copyToClipboard = (text) => {
        if (Platform.OS === 'web') {
            navigator.clipboard.writeText(text);
        } else {
            navigator.clipboard?.writeText(text);
        }
        if (showSnackbar) showSnackbar("Copied to clipboard!");
    };

    return (
        <Surface 
            style={[
                styles.actionCard, 
                { 
                    backgroundColor: theme.colors.surface,
                    padding: isDesktop ? 24 : 16 
                }
            ]} 
            elevation={1}
        >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.customerName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{item.phone}</Text>
                        <IconButton 
                            icon="content-copy" 
                            size={14} 
                            style={{ margin: 0, padding: 0 }} 
                            onPress={() => copyToClipboard(item.phone)} 
                        />
                    </View>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                </View>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }} numberOfLines={1}>
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
    );
});

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
        width: '100%', // Full width on mobile
        height: '100%', // Full height on mobile
        margin: 0,
        alignSelf: 'center',
        borderRadius: 0, // Square on mobile for full screen feel
        overflow: 'hidden',
        padding: 0,
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
    },
    ndrHeader: {
        padding: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    ndrStatsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 16,
        gap: 8,
        alignItems: 'center',
    },
    ndrFilterRow: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    ndrChip: {
        height: 32,
    },
    ndrCard: {
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
    },
});

export default WhatsAppManagerScreen;

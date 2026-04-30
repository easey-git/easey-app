import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text, useTheme, ActivityIndicator, IconButton, Avatar, Badge, Surface, Icon, Button } from 'react-native-paper';
import { GiftedChat, Bubble, Send, InputToolbar, Composer } from 'react-native-gifted-chat';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { db } from '../config/firebase';

const WhatsAppChatScreen = ({ route, navigation }) => {
    const { customer } = route.params;
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [chatHistory, setChatHistory] = useState(null);
    const [chatLoading, setChatLoading] = useState(true);

    const API_BASE = 'https://easey-app.vercel.app';

    useEffect(() => {
        if (!customer) return;

        let phoneDigits = customer.phoneNormalized || customer.phone;
        if (phoneDigits) {
            phoneDigits = phoneDigits.toString().replace(/\D/g, '');
            if (phoneDigits.length === 10) {
                phoneDigits = '91' + phoneDigits;
            }
        }

        const qChat = query(
            collection(db, "whatsapp_messages"),
            where("phoneNormalized", "==", phoneDigits),
            orderBy("timestamp", "desc"),
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
                        name: data.direction === 'outbound' ? 'Admin' : (customer.customerName || 'Customer'),
                        avatar: data.direction === 'outbound' ? null : `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.customerName || 'C')}&background=random`,
                    },
                    received: data.status === 'delivered' || data.status === 'read',
                    sent: data.status === 'sent' || data.status === 'delivered' || data.status === 'read',
                    status: data.status,
                    direction: data.direction
                };
            });
            setChatHistory(messages);
            setChatLoading(false);
        });

        return () => unsubChat();
    }, [customer]);

    const onSend = async (newMessages = []) => {
        const msg = newMessages[0];
        if (!msg) return;

        const phone = customer.phoneNormalized || customer.phone;

        const optimisticMsg = {
            ...msg,
            _id: Math.random().toString(),
            createdAt: new Date(),
            user: { _id: 1 },
            pending: true,
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

            if (!response.ok) throw new Error("Failed to send");
        } catch (error) {
            console.error("Error sending message:", error);
            setChatHistory(prev => prev.filter(m => m._id !== optimisticMsg._id));
        }
    };

    const isWindowOpen = chatHistory?.find(m => m.direction === 'inbound') && 
        (new Date() - new Date(chatHistory.find(m => m.direction === 'inbound').createdAt)) < 24 * 60 * 60 * 1000;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
            <Surface style={[styles.header, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <View style={styles.headerLeft}>
                    <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
                    <Avatar.Image size={36} source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.customerName || 'C')}&background=random` }} />
                    <View style={styles.headerInfo}>
                        <Text variant="titleMedium" style={styles.headerTitle} numberOfLines={1}>{customer.customerName || 'Customer'}</Text>
                        <Text variant="bodySmall" style={styles.headerSubtitle}>{customer.phone}</Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <Badge style={{ backgroundColor: isWindowOpen ? '#4ade80' : '#94a3b8', color: 'white', marginRight: 8 }}>
                        {isWindowOpen ? 'Online' : 'Offline'}
                    </Badge>
                </View>
            </Surface>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                {chatLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" />
                    </View>
                ) : (
                    <GiftedChat
                        messages={chatHistory}
                        onSend={messages => onSend(messages)}
                        user={{ _id: 1 }}
                        renderUsernameOnMessage={false}
                        alwaysShowSend={true}
                        scrollToBottom
                        isKeyboardInternallyHandled={false}
                        bottomOffset={insets.bottom}
                        renderInputToolbar={props => {
                            if (!isWindowOpen) {
                                return (
                                    <Surface style={[styles.footerLocked, { paddingBottom: insets.bottom + 8 }]} elevation={2}>
                                        <Icon source="lock" size={16} color={theme.colors.onSurfaceVariant} />
                                        <Text style={styles.lockedText}>24h Window Closed. Template only.</Text>
                                        <Button mode="contained" compact style={styles.templateButton}>Send Template</Button>
                                    </Surface>
                                );
                            }
                            return (
                                <InputToolbar {...props} containerStyle={[styles.inputToolbar, { marginBottom: insets.bottom }]} primaryStyle={{ alignItems: 'center' }} />
                            );
                        }}
                        renderComposer={props => (
                            <Composer {...props} textInputStyle={[styles.composer, { color: theme.colors.onSurface }]} placeholder="Type a message..." />
                        )}
                        renderBubble={props => (
                            <Bubble
                                {...props}
                                wrapperStyle={{
                                    left: { backgroundColor: theme.dark ? '#334155' : '#ffffff', borderRadius: 12 },
                                    right: { backgroundColor: theme.colors.primary, borderRadius: 12 }
                                }}
                                textStyle={{ left: { color: theme.colors.onSurface }, right: { color: '#ffffff' } }}
                            />
                        )}
                        renderSend={props => (
                            <Send {...props} containerStyle={styles.sendContainer}>
                                <View style={styles.sendIconBg}>
                                    <Icon source="send" color={theme.colors.primary} size={20} />
                                </View>
                            </Send>
                        )}
                    />
                )}
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, paddingRight: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.1)' },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    headerInfo: { marginLeft: 8, flex: 1 },
    headerTitle: { fontWeight: 'bold', fontSize: 16 },
    headerSubtitle: { opacity: 0.6, fontSize: 11 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    inputToolbar: { borderTopWidth: 0, backgroundColor: 'transparent', marginHorizontal: 8 },
    composer: { backgroundColor: '#ffffff', borderRadius: 24, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, marginTop: 4, marginBottom: 4, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 15, lineHeight: 20 },
    sendContainer: { justifyContent: 'center', alignItems: 'center', marginLeft: 4, height: 44 },
    sendIconBg: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    footerLocked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    lockedText: { fontSize: 12, color: '#64748b', marginHorizontal: 8, flex: 1 },
    templateButton: { borderRadius: 8 }
});

export default WhatsAppChatScreen;

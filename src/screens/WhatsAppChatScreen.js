import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform, ImageBackground, Keyboard } from 'react-native';
import { Text, useTheme, ActivityIndicator, IconButton, Avatar, Badge, Surface, Icon, Button } from 'react-native-paper';
import { GiftedChat, Bubble, Send, InputToolbar, Composer, Time, MessageText } from 'react-native-gifted-chat';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { db } from '../config/firebase';
import { CRMLayout } from '../components/CRMLayout';
import { useResponsive } from '../hooks/useResponsive';

const WhatsAppChatScreen = ({ route, navigation }) => {
    const { customer } = route.params;
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { isDesktop, width: screenWidth } = useResponsive();
    const [chatHistory, setChatHistory] = useState([]);
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

    const onSend = useCallback(async (newMessages = []) => {
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
    }, [customer]);

    const isWindowOpen = chatHistory?.find(m => m.direction === 'inbound') && 
        (new Date() - new Date(chatHistory.find(m => m.direction === 'inbound').createdAt)) < 24 * 60 * 60 * 1000;

    const renderHeader = () => (
        <Surface style={[styles.header, { backgroundColor: theme.colors.surface, paddingTop: 0 }]} elevation={2}>
            <View style={styles.headerLeft}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
                <View style={styles.avatarContainer}>
                    <Avatar.Image size={40} source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.customerName || 'C')}&background=random` }} />
                    <View style={[styles.onlineStatus, { backgroundColor: isWindowOpen ? '#4ade80' : '#94a3b8' }]} />
                </View>
                <View style={styles.headerInfo}>
                    <Text variant="titleMedium" style={styles.headerTitle} numberOfLines={1}>{customer.customerName || 'Customer'}</Text>
                    <Text variant="bodySmall" style={styles.headerSubtitle}>{customer.phone}</Text>
                </View>
            </View>
            <View style={styles.headerRight}>
                <Badge style={{ backgroundColor: isWindowOpen ? '#4ade80' : '#94a3b8', color: 'white' }}>
                    {isWindowOpen ? 'Online' : 'Offline'}
                </Badge>
            </View>
        </Surface>
    );

    const chatComponent = (
        <GiftedChat
            messages={chatHistory}
            onSend={messages => onSend(messages)}
            user={{ _id: 1 }}
            renderUsernameOnMessage={false}
            alwaysShowSend={true}
            scrollToBottom
            isKeyboardInternallyHandled={false}
            renderActions={() => null}
            bottomOffset={0}
            messagesContainerStyle={{
                backgroundColor: 'transparent'
            }}
            renderInputToolbar={props => {
                if (!isWindowOpen) {
                    return (
                        <Surface style={[styles.footerLocked, { paddingBottom: 16 }]} elevation={3}>
                            <View style={styles.lockedBanner}>
                                <Icon source="lock" size={14} color={theme.colors.onSurfaceVariant} />
                                <Text style={styles.lockedText}>24h Window Closed. Only templates allowed.</Text>
                            </View>
                            <Button mode="contained" style={styles.templateButton} icon="email-newsletter" buttonColor={theme.colors.primary}>
                                Send Template
                            </Button>
                        </Surface>
                    );
                }
                return (
                    <InputToolbar 
                        {...props} 
                        containerStyle={[
                            styles.inputToolbar, 
                            { 
                                backgroundColor: theme.colors.surface,
                                borderTopWidth: 0.5,
                                borderTopColor: theme.colors.outlineVariant,
                                marginBottom: 0,
                            }
                        ]} 
                        primaryStyle={{ alignItems: 'center' }} 
                    />
                );
            }}
            renderComposer={props => (
                <Composer 
                    {...props} 
                    textInputStyle={[
                        styles.composer, 
                        { 
                            color: theme.colors.onSurface,
                            backgroundColor: theme.dark ? theme.colors.elevation.level3 : '#f1f5f9' 
                        }
                    ]} 
                    placeholder="Type a message..." 
                />
            )}
            renderBubble={props => (
                <Bubble
                    {...props}
                    wrapperStyle={{
                        left: { 
                            backgroundColor: theme.dark ? '#202C33' : '#ffffff', 
                            borderRadius: 12,
                            padding: 2,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 1,
                            elevation: 1,
                        },
                        right: { 
                            backgroundColor: theme.dark ? '#005C4B' : '#DCF8C6', 
                            borderRadius: 12,
                            padding: 2,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 1,
                            elevation: 1,
                        }
                    }}
                    textStyle={{ 
                        left: { color: theme.colors.onSurface, fontSize: 15 }, 
                        right: { color: theme.dark ? '#E9EDEF' : '#000000', fontSize: 15 } 
                    }}
                />
            )}
            renderSend={props => (
                <Send {...props} containerStyle={styles.sendContainer}>
                    <View style={[styles.sendIconBg, { backgroundColor: theme.colors.primary }]}>
                        <Icon source="send" color="#ffffff" size={18} />
                    </View>
                </Send>
            )}
            renderTicks={message => {
                if (message.user._id !== 1) return null;
                const isRead = message.status === 'read';
                return (
                    <View style={{ marginRight: 4 }}>
                        <Icon source="check-all" size={14} color={isRead ? '#53bdeb' : '#8696A0'} />
                    </View>
                );
            }}
        />
    );

    return (
        <CRMLayout 
            title={customer.customerName || 'Chat'} 
            navigation={navigation} 
            scrollable={false} 
            fullWidth={true}
            showHeader={false}
        >
            <View style={[styles.container, { backgroundColor: theme.dark ? '#0B141A' : '#E5DDD5' }]}>
                {renderHeader()}
                
                <View style={styles.chatContentContainer}>
                    {chatLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={theme.colors.primary} />
                        </View>
                    ) : (
                        <KeyboardAvoidingView 
                            style={{ flex: 1 }} 
                            behavior="padding"
                            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 90}
                        >
                            {chatComponent}
                        </KeyboardAvoidingView>
                    )}
                </View>
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingVertical: 8, 
        paddingRight: 8,
        zIndex: 10,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    avatarContainer: { position: 'relative' },
    onlineStatus: { 
        position: 'absolute', 
        bottom: 0, 
        right: 0, 
        width: 12, 
        height: 12, 
        borderRadius: 6, 
        borderWidth: 2, 
        borderColor: 'white' 
    },
    headerInfo: { marginLeft: 12, flex: 1 },
    headerTitle: { fontWeight: '700', fontSize: 16 },
    headerSubtitle: { opacity: 0.6, fontSize: 12 },
    chatContentContainer: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    inputToolbar: { borderTopWidth: 0, paddingHorizontal: 4, paddingVertical: 4 },
    composer: { 
        borderRadius: 24, 
        paddingHorizontal: 16, 
        paddingTop: 8, 
        paddingBottom: 8, 
        marginTop: 4, 
        marginBottom: 4, 
        fontSize: 15, 
        lineHeight: 20,
        marginHorizontal: 8,
    },
    sendContainer: { justifyContent: 'center', alignItems: 'center', height: 44, marginRight: 4 },
    sendIconBg: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    footerLocked: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', alignItems: 'center' },
    lockedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
    lockedText: { fontSize: 12, color: '#64748b', marginLeft: 6 },
    templateButton: { borderRadius: 12, width: '100%' }
});

export default WhatsAppChatScreen;

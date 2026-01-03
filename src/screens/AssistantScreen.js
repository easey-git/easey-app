import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, Animated } from 'react-native';
import { Text, TextInput, IconButton, Surface, useTheme, ActivityIndicator, Avatar, Appbar, Menu } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHeaderHeight } from '@react-navigation/elements';

const API_URL = 'https://easey-app.vercel.app/api/assistant';
const STORAGE_KEY = 'easey_chat_history_v1';

export default function AssistantScreen({ navigation }) {
    const theme = useTheme();
    const headerHeight = useHeaderHeight(); // Dynamic, not hardcoded
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const flatListRef = useRef(null);

    // Load History on Mount
    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                setMessages(JSON.parse(stored));
            } else {
                // Default Welcome Message
                setMessages([{
                    id: 1,
                    text: "Hi! I'm Easey. I can help you find orders, check sales, or track abandoned carts. What do you need?",
                    sender: 'bot',
                    timestamp: Date.now()
                }]);
            }
        } catch (e) {
            console.error("Failed to load history", e);
        }
    };

    const saveHistory = async (newMessages) => {
        try {
            // Keep last 50 messages to save space
            const toSave = newMessages.slice(-50);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.error("Failed to save history", e);
        }
    };

    const clearHistory = async () => {
        setMessages([{
            id: Date.now(),
            text: "Chat cleared. How can I help?",
            sender: 'bot',
            timestamp: Date.now()
        }]);
        await AsyncStorage.removeItem(STORAGE_KEY);
        setMenuVisible(false);
    };

    const sendMessage = async () => {
        if (!inputText.trim() || loading) return;

        const userText = inputText.trim();
        const userMsg = { id: Date.now(), text: userText, sender: 'user', timestamp: Date.now() };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        saveHistory(updatedMessages);

        setInputText('');
        setLoading(true);

        // Scroll to bottom immediately
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        try {
            // Context History: Send last 10 messages for context
            const historyPayload = updatedMessages.slice(-10).map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                text: m.text
            }));

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userText,
                    history: historyPayload
                })
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error);

            const botMsg = {
                id: Date.now() + 1,
                text: data.text || "I found something, but I'm not sure how to say it.",
                sender: 'bot',
                data: data.data,
                timestamp: Date.now()
            };

            const finalMessages = [...updatedMessages, botMsg];
            setMessages(finalMessages);
            saveHistory(finalMessages);

        } catch (error) {
            const errorMsg = {
                id: Date.now() + 1,
                text: "Sorry, I encountered an error: " + error.message,
                sender: 'bot',
                isError: true,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
    };

    const renderMessage = ({ item }) => {
        const isUser = item.sender === 'user';
        return (
            <View style={[
                styles.messageRow,
                isUser ? styles.userRow : styles.botRow
            ]}>
                {!isUser && (
                    <Avatar.Icon
                        size={32}
                        icon="auto-fix"
                        style={{ backgroundColor: theme.colors.primaryContainer, marginRight: 8 }}
                        color={theme.colors.primary}
                    />
                )}
                <View style={[
                    styles.bubble,
                    isUser ? { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 } : { backgroundColor: theme.colors.surfaceVariant, borderBottomLeftRadius: 4 },
                ]}>
                    <Text style={{
                        color: isUser ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
                        fontSize: 16,
                        lineHeight: 22,
                        marginBottom: 4
                    }}>
                        {item.text}
                    </Text>
                    <Text style={{
                        color: isUser ? 'rgba(255,255,255,0.7)' : theme.colors.outline,
                        fontSize: 10,
                        alignSelf: 'flex-end',
                    }}>
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <Appbar.Header style={{ backgroundColor: theme.colors.background, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content
                    title="Easey Intelligence"
                    titleStyle={{ fontWeight: '700', fontSize: 18, color: theme.colors.onBackground }}
                    style={{ alignItems: 'center' }}
                />
                <Menu
                    visible={menuVisible}
                    onDismiss={() => setMenuVisible(false)}
                    anchor={<Appbar.Action icon="dots-horizontal" onPress={() => setMenuVisible(true)} />}
                >
                    <Menu.Item onPress={clearHistory} title="Clear Context" leadingIcon="broom" />
                </Menu>
            </Appbar.Header>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0} // Android handles resize natively now
            >
                <View style={{ flex: 1 }}>
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={item => item.id.toString()}
                        renderItem={renderMessage}
                        contentContainerStyle={{ padding: 16 }}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        showsVerticalScrollIndicator={false}
                    />
                </View>

                {/* Modern Floating Input Bar */}
                <View style={[styles.inputContainer, { backgroundColor: theme.colors.background }]}>
                    <View style={[styles.inputWrapper, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <TextInput
                            placeholder="Ask Easey..."
                            value={inputText}
                            onChangeText={setInputText}
                            style={[styles.nativeInput, { color: theme.colors.onSurface }]}
                            placeholderTextColor={theme.colors.outline}
                            multiline
                        />
                        <IconButton
                            icon={loading ? "loading" : "arrow-up-circle"}
                            mode="contained"
                            containerColor="transparent"
                            iconColor={inputText.trim() ? theme.colors.primary : theme.colors.outline}
                            size={32}
                            onPress={sendMessage}
                            style={{ margin: 0 }}
                            disabled={!inputText.trim() && !loading}
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>

            <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.background }} />
        </View>
    );
}

const styles = StyleSheet.create({
    messageRow: {
        flexDirection: 'row',
        marginBottom: 16,
        maxWidth: '85%',
        alignItems: 'flex-end',
    },
    userRow: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end'
    },
    botRow: {
        alignSelf: 'flex-start'
    },
    bubble: {
        padding: 14,
        paddingHorizontal: 18,
        borderRadius: 22,
        minWidth: 60,
    },
    inputContainer: {
        padding: 8,
        paddingHorizontal: 16,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 2, // Slimmer vertical padding
        borderRadius: 24, // Slightly tighter radius
    },
    nativeInput: {
        flex: 1,
        fontSize: 16,
        maxHeight: 120, // Allow growth
        paddingTop: 8,
        paddingBottom: 8,
    }
});

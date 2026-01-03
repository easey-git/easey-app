import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Text, TextInput, IconButton, Surface, useTheme, ActivityIndicator, Avatar, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = 'https://easey-app.vercel.app/api/assistant';

export default function AssistantScreen({ navigation }) {
    const theme = useTheme();
    const [messages, setMessages] = useState([
        { id: 1, text: "Hi! I'm Easey. Ask me anything about your store data.", sender: 'bot' }
    ]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const flatListRef = useRef(null);

    useEffect(() => {
        // Scroll to bottom when messages change
        if (flatListRef.current) {
            setTimeout(() => flatListRef.current.scrollToEnd({ animated: true }), 100);
        }
    }, [messages]);

    const sendMessage = async () => {
        if (!inputText.trim()) return;

        const userMsg = { id: Date.now(), text: inputText, sender: 'user' };
        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        setLoading(true);
        // Keyboard.dismiss(); // Optional: keep keyboard up for faster typing

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userMsg.text })
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error);

            const botMsg = {
                id: Date.now() + 1,
                text: data.text || "I found something, but I'm not sure how to say it.",
                sender: 'bot',
                data: data.data
            };
            setMessages(prev => [...prev, botMsg]);

        } catch (error) {
            const errorMsg = { id: Date.now() + 1, text: "Sorry, I encountered an error: " + error.message, sender: 'bot' };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
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
                    <Avatar.Icon size={32} icon="robot" style={{ backgroundColor: theme.colors.primary, marginRight: 8 }} />
                )}
                <Surface style={[
                    styles.bubble,
                    isUser ? { backgroundColor: theme.colors.primary } : { backgroundColor: theme.colors.surfaceVariant }
                ]} elevation={1}>
                    <Text style={{
                        color: isUser ? theme.colors.onPrimary : theme.colors.onSurfaceVariant
                    }}>
                        {item.text}
                    </Text>
                </Surface>
            </View>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['bottom', 'left', 'right']}>
            <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="Easey Assistant" />
            </Appbar.Header>

            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id.toString()}
                renderItem={renderMessage}
                contentContainerStyle={styles.listContent}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
            >
                <Surface style={[styles.inputContainer, { backgroundColor: theme.colors.surface }]} elevation={4}>
                    <TextInput
                        mode="outlined"
                        placeholder="Ask Easey..."
                        value={inputText}
                        onChangeText={setInputText}
                        style={styles.input}
                        right={loading ? <TextInput.Icon icon={() => <ActivityIndicator />} /> : <TextInput.Icon icon="send" onPress={sendMessage} />}
                        onSubmitEditing={sendMessage}
                    />
                </Surface>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    listContent: {
        padding: 16,
        paddingBottom: 20
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'flex-end',
        maxWidth: '80%'
    },
    userRow: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end'
    },
    botRow: {
        alignSelf: 'flex-start'
    },
    bubble: {
        padding: 12,
        borderRadius: 16,
        borderBottomLeftRadius: 4, // Bot look
    },
    inputContainer: {
        padding: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    input: {
        backgroundColor: 'transparent'
    }
});

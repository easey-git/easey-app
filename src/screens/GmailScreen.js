import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, Alert, Platform } from 'react-native';
import { Text, useTheme, Surface, ActivityIndicator, FAB, Appbar, Avatar, IconButton, Dialog, Portal, TextInput, Button } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri, ResponseType } from 'expo-auth-session';
import { WebView } from 'react-native-webview';
import { Buffer } from 'buffer'; // Ensure this is installed

// Initialize WebBrowser for Auth Session
WebBrowser.maybeCompleteAuthSession();

const BASE_URL = 'https://easey-app.vercel.app/api'; // Adjust if local dev

// Scopes required for the app
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
];

const GmailScreen = ({ navigation }) => {
    const theme = useTheme();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [threadList, setThreadList] = useState([]);

    // Detail View State
    const [selectedThread, setSelectedThread] = useState(null);
    const [loadingThread, setLoadingThread] = useState(false);
    const [threadDetail, setThreadDetail] = useState(null);

    // Compose State
    const [composeVisible, setComposeVisible] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [sending, setSending] = useState(false);

    // Auth Request Setup
    const redirectUri = makeRedirectUri({ scheme: 'easey' });
    console.log("📢 YOUR REDIRECT URI: ", redirectUri);

    const [request, response, promptAsync] = Google.useAuthRequest({
        responseType: ResponseType.Code,
        scopes: SCOPES,
        // For Expo Go, this works automatically. For standalone, ensure scheme is set.
        redirectUri: redirectUri,
        clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
        androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '', // Ensure this is set in .env as EXPO_PUBLIC_GOOGLE_CLIENT_ID
        // We will pass the code to our backend to exchange.
        usePKCE: true,
        shouldAutoExchangeCode: false, // Critical: Backend handles the exchange
    });

    // Check Connection Status
    const checkStatus = useCallback(async () => {
        try {
            const res = await fetch(`${BASE_URL}/gmail?action=status&userId=${user.uid}`);
            const data = await res.json();
            setIsConnected(data.connected);
            if (data.connected) {
                fetchInbox();
            } else {
                setLoading(false);
            }
        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    }, [user.uid]);

    useEffect(() => {
        if (user) checkStatus();
    }, [user, checkStatus]);

    // Handle Auth Response
    useEffect(() => {
        if (response?.type === 'success') {
            const { code } = response.params;
            exchangeCode(code);
        }
    }, [response]);

    const exchangeCode = async (code) => {
        setConnecting(true);
        try {
            const redirectUri = makeRedirectUri({ scheme: 'easey' });
            const res = await fetch(`${BASE_URL}/gmail?action=auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    redirectUri,
                    userId: user.uid,
                    codeVerifier: request?.codeVerifier // Critical for PKCE
                })
            });

            if (res.ok) {
                setIsConnected(true);
                fetchInbox();
            } else {
                Alert.alert('Auth Failed', 'Could not connect to Gmail.');
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setConnecting(false);
        }
    };

    const fetchInbox = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${BASE_URL}/gmail?action=list&userId=${user.uid}`);
            const data = await res.json();
            if (data.threads) {
                setThreadList(data.threads);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const loadThread = async (thread) => {
        setSelectedThread(thread);
        setLoadingThread(true);
        try {
            const res = await fetch(`${BASE_URL}/gmail?action=get&userId=${user.uid}&id=${thread.id}`);
            const data = await res.json();
            setThreadDetail(data);
        } catch (error) {
            Alert.alert('Error', 'Could not load email.');
        } finally {
            setLoadingThread(false);
        }
    };

    const sendEmail = async () => {
        if (!composeTo || !composeSubject || !composeBody) {
            Alert.alert('Validation', 'Please fill all fields.');
            return;
        }

        setSending(true);
        try {
            const res = await fetch(`${BASE_URL}/gmail?action=send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.uid,
                    to: composeTo,
                    subject: composeSubject,
                    body: composeBody,
                    // If replying, add threadId here
                    threadId: selectedThread?.id
                })
            });

            if (res.ok) {
                setComposeVisible(false);
                setComposeTo('');
                setComposeSubject('');
                setComposeBody('');
                Alert.alert('Sent', 'Email sent successfully.');
                fetchInbox();
            } else {
                const err = await res.json();
                Alert.alert('Error', err.error || 'Failed to send.');
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setSending(false);
        }
    };

    // Helper to extract HTML body from message payload
    const getMessageBody = (payload) => {
        if (!payload) return '';

        let body = '';
        if (payload.body?.data) {
            body = payload.body.data;
        } else if (payload.parts) {
            // Find text/html part
            const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
            if (htmlPart && htmlPart.body?.data) {
                body = htmlPart.body.data;
            } else {
                // Fallback to text/plain
                const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
                if (textPart && textPart.body?.data) {
                    body = textPart.body.data;
                }
            }
        }

        if (body) {
            return Buffer.from(body, 'base64').toString('utf-8');
        }
        return '<i>(No content)</i>';
    };

    // Render Logic
    if (loading && !refreshing && !threadList.length) {
        return (
            <CRMLayout title="Gmail" navigation={navigation}>
                <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            </CRMLayout>
        );
    }

    if (!isConnected) {
        return (
            <CRMLayout title="Gmail" navigation={navigation}>
                <View style={[styles.center, { backgroundColor: theme.colors.background, padding: 32 }]}>
                    <Surface style={[styles.connectCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={2}>
                        <Avatar.Icon size={64} icon="email" style={{ backgroundColor: theme.colors.primary }} />
                        <Text variant="headlineSmall" style={{ marginTop: 16, fontWeight: 'bold', color: theme.colors.onSurface }}>Connect Gmail</Text>
                        <Text variant="bodyMedium" style={{ textAlign: 'center', marginVertical: 12, color: theme.colors.onSurfaceVariant }}>
                            Integrate your inbox to manage emails directly from Easey.
                        </Text>
                        <Button
                            mode="contained"
                            onPress={() => promptAsync()}
                            loading={connecting}
                            disabled={!request || connecting}
                            icon="google"
                        >
                            Sign in with Google
                        </Button>
                        {!request && (
                            <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
                                Configuration Error: Client ID missing.
                            </Text>
                        )}
                    </Surface>
                </View>
            </CRMLayout>
        );
    }

    // Detail View Rendering
    if (selectedThread) {
        return (
            <CRMLayout showHeader={false} fullWidth={true} navigation={navigation}>
                <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
                    <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
                        <Appbar.BackAction onPress={() => { setSelectedThread(null); setThreadDetail(null); }} />
                        <Appbar.Content title={selectedThread.subject || "Thread"} titleStyle={{ fontSize: 18, fontWeight: 'bold' }} />
                    </Appbar.Header>

                    {loadingThread || !threadDetail ? (
                        <View style={styles.center}><ActivityIndicator /></View>
                    ) : (
                        <FlatList
                            data={threadDetail.messages}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                            renderItem={({ item }) => {
                                const headers = item.payload.headers;
                                const from = headers.find(h => h.name === 'From')?.value;
                                const date = new Date(parseInt(item.internalDate)).toLocaleString();
                                const htmlContent = getMessageBody(item.payload);

                                return (
                                    <Surface style={[styles.messageCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                                        <View style={styles.messageHeader}>
                                            <Avatar.Text size={40} label={from?.charAt(0) || '?'} />
                                            <View style={{ marginLeft: 12, flex: 1 }}>
                                                <Text variant="titleSmall" numberOfLines={1}>{from}</Text>
                                                <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{date}</Text>
                                            </View>
                                        </View>
                                        <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant, marginVertical: 12 }} />
                                        <View style={{ height: 300 }}>
                                            {Platform.OS === 'web' ? (
                                                <iframe
                                                    srcDoc={`
                                                        <style>body { font-family: system-ui; color: ${theme.colors.onSurface}; background: transparent; margin: 0; padding: 0; overflow-x: hidden; }</style>
                                                        ${htmlContent}
                                                    `}
                                                    style={{ width: '100%', height: '100%', border: 'none', backgroundColor: 'transparent' }}
                                                    title="Email Content"
                                                />
                                            ) : (
                                                <WebView
                                                    originWhitelist={['*']}
                                                    source={{
                                                        html: `
                                                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                                        <style>body { font-family: system-ui; color: ${theme.colors.onSurface}; background: transparent; }</style>
                                                        ${htmlContent}
                                                    `}}
                                                    style={{ backgroundColor: 'transparent' }}
                                                />
                                            )}
                                        </View>
                                    </Surface>
                                );
                            }}
                        />
                    )}

                    <FAB
                        icon="reply"
                        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                        onPress={() => {
                            setComposeSubject(`Re: ${selectedThread.subject}`);
                            setComposeTo(selectedThread.from); // Simplified
                            setComposeVisible(true);
                        }}
                        label="Reply"
                    />
                </View>
            </CRMLayout>
        );
    }

    // Inbox List Rendering
    const renderThread = ({ item }) => (
        <TouchableOpacity onPress={() => loadThread(item)}>
            <Surface style={[styles.threadItem, { backgroundColor: theme.colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.outlineVariant }]} elevation={0}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12 }}>
                    <Avatar.Text size={40} label={item.from?.charAt(0).toUpperCase() || '?'} style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.onPrimaryContainer} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold' }} numberOfLines={1}>{item.from}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{item.date?.split(' ')[0]}</Text>
                        </View>
                        <Text variant="bodyMedium" style={{ fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>{item.subject}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>{item.snippet}</Text>
                    </View>
                </View>
            </Surface>
        </TouchableOpacity>
    );

    return (
        <CRMLayout
            title="Inbox"
            navigation={navigation}
            actions={<Appbar.Action icon="reload" onPress={() => { setRefreshing(true); fetchInbox(); }} />}
            scrollable={false}
            fullWidth={true}
        >
            <FlatList
                data={threadList}
                renderItem={renderThread}
                keyExtractor={item => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchInbox(); }} />}
                contentContainerStyle={{ paddingBottom: 80 }}
                ListEmptyComponent={
                    <View style={{ padding: 32, alignItems: 'center' }}>
                        <Text>No emails found.</Text>
                    </View>
                }
            />

            <FAB
                icon="pencil"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                onPress={() => {
                    setComposeTo('');
                    setComposeSubject('');
                    setComposeBody('');
                    setComposeVisible(true);
                }}
            />

            {/* Compose Dialog */}
            <Portal>
                <Dialog visible={composeVisible} onDismiss={() => setComposeVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                    <Dialog.Title>Compose Email</Dialog.Title>
                    <Dialog.Content>
                        <TextInput
                            label="To"
                            mode="outlined"
                            value={composeTo}
                            onChangeText={setComposeTo}
                            style={{ marginBottom: 12 }}
                            dense
                        />
                        <TextInput
                            label="Subject"
                            mode="outlined"
                            value={composeSubject}
                            onChangeText={setComposeSubject}
                            style={{ marginBottom: 12 }}
                            dense
                        />
                        <TextInput
                            label="Message"
                            mode="outlined"
                            value={composeBody}
                            onChangeText={setComposeBody}
                            multiline
                            numberOfLines={6}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setComposeVisible(false)}>Cancel</Button>
                        <Button mode="contained" onPress={sendEmail} loading={sending} disabled={sending}>Send</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    connectCard: {
        padding: 32,
        borderRadius: 16,
        alignItems: 'center',
        width: '100%',
        maxWidth: 400,
    },
    threadItem: {
        borderRadius: 0,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
    },
    messageCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    messageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    }
});

export default GmailScreen;

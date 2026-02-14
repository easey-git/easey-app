import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, Alert, Platform } from 'react-native';
import { Text, useTheme, Surface, ActivityIndicator, FAB, Appbar, Avatar, IconButton, Dialog, Portal, TextInput, Button } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
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
    const { isDesktop } = useResponsive();
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [threadList, setThreadList] = useState([]);
    const [nextPageToken, setNextPageToken] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);

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
        extraParams: {
            access_type: 'offline',
            prompt: 'consent'
        },
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

    const [searchQuery, setSearchQuery] = useState('');

    const onChangeSearch = query => setSearchQuery(query);

    const onSearch = () => {
        setNextPageToken(null);
        setThreadList([]);
        fetchInbox(false); // Reset and search
    };

    // Update fetchInbox to use searchQuery
    const fetchInbox = async (loadMore = false) => {
        if (loadingMore) return;
        if (loadMore && !nextPageToken) return;

        if (loadMore) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            let url = `${BASE_URL}/gmail?action=list&userId=${user.uid}`;
            if (searchQuery) {
                url += `&q=${encodeURIComponent(searchQuery)}`;
            }
            if (loadMore && nextPageToken) {
                url += `&pageToken=${nextPageToken}`;
            }

            const res = await fetch(url);

            if (res.status === 401) {
                setIsConnected(false);
                return;
            }

            const data = await res.json();

            if (data.threads) {
                if (loadMore) {
                    setThreadList(prev => [...prev, ...data.threads]);
                } else {
                    setThreadList(data.threads);
                }
                setNextPageToken(data.nextPageToken || null);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
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

    // Render Components
    const renderThreadList = () => (
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: theme.colors.outlineVariant, maxWidth: isDesktop ? 400 : '100%' }}>
            {/* List Header: Search + Compose */}
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, flexDirection: 'row', gap: 8 }}>
                <TextInput
                    mode="outlined"
                    placeholder="Search"
                    value={searchQuery}
                    onChangeText={onChangeSearch}
                    onSubmitEditing={onSearch} // Trigger search on enter
                    left={<TextInput.Icon icon="magnify" />}
                    dense
                    style={{ flex: 1, backgroundColor: theme.colors.surface }}
                />
                <IconButton
                    icon="pencil"
                    mode="contained"
                    containerColor={theme.colors.primary}
                    iconColor={theme.colors.onPrimary}
                    onPress={() => {
                        setComposeTo('');
                        setComposeSubject('');
                        setComposeBody('');
                        setComposeVisible(true);
                    }}
                />
            </View>

            {/* Scrollable List */}
            <FlatList
                data={threadList}
                renderItem={({ item }) => {
                    const isSelected = selectedThread?.id === item.id;
                    return (
                        <TouchableOpacity onPress={() => loadThread(item)}>
                            <View style={[
                                styles.threadItem,
                                {
                                    backgroundColor: isSelected ? theme.colors.secondaryContainer : theme.colors.surface,
                                    borderBottomWidth: StyleSheet.hairlineWidth,
                                    borderBottomColor: theme.colors.outlineVariant
                                }
                            ]}>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12 }}>
                                    <Avatar.Text
                                        size={40}
                                        label={item.from?.charAt(0).toUpperCase() || '?'}
                                        style={{ backgroundColor: isSelected ? theme.colors.primary : theme.colors.primaryContainer }}
                                        color={isSelected ? theme.colors.onPrimary : theme.colors.onPrimaryContainer}
                                    />
                                    <View style={{ marginLeft: 12, flex: 1 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                                            <Text variant="titleSmall" style={{ fontWeight: item.snippet ? 'bold' : 'normal' }} numberOfLines={1}>{item.from}</Text>
                                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{item.date?.split(' ')[0]}</Text>
                                        </View>
                                        <Text variant="bodyMedium" style={{ fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>{item.subject}</Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>{item.snippet}</Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                }}
                keyExtractor={item => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setNextPageToken(null); fetchInbox(false); }} />}
                onEndReached={() => fetchInbox(true)}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} /> : null}
                contentContainerStyle={{ flexGrow: 1 }} // Remove paddingBottom hack
            />
        </View>
    );

    const renderThreadDetail = () => {
        if (loadingThread || !threadDetail) {
            return <View style={styles.center}><ActivityIndicator size="large" /></View>;
        }

        return (
            <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
                {/* Detail Header */}
                <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, height: 64 }}>
                    {!isDesktop && <Appbar.BackAction onPress={() => { setSelectedThread(null); setThreadDetail(null); }} />}
                    <Appbar.Content title={selectedThread.subject || "Thread"} titleStyle={{ fontSize: 18, fontWeight: 'bold' }} />
                </Appbar.Header>

                {/* Scrollable Messages */}
                <FlatList
                    data={threadDetail.messages}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    renderItem={({ item, index }) => {
                        const headers = item.payload.headers;
                        const from = headers.find(h => h.name === 'From')?.value;
                        const to = headers.find(h => h.name === 'To')?.value;
                        const date = new Date(parseInt(item.internalDate)).toLocaleString(undefined, {
                            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        });
                        const htmlContent = getMessageBody(item.payload);
                        const isLast = index === threadDetail.messages.length - 1;

                        return (
                            <View style={{
                                backgroundColor: theme.colors.surface,
                                borderBottomWidth: isLast ? 0 : 1,
                                borderBottomColor: theme.colors.outlineVariant,
                                paddingVertical: 24,
                                paddingHorizontal: isDesktop ? 32 : 16
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
                                    <Avatar.Text size={40} label={from?.charAt(0) || '?'} style={{ backgroundColor: theme.colors.secondaryContainer }} color={theme.colors.onSecondaryContainer} />
                                    <View style={{ marginLeft: 16, flex: 1 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{from?.split('<')[0].trim()}</Text>
                                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{date}</Text>
                                        </View>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>to {to}</Text>
                                    </View>
                                </View>

                                {/* Content Box */}
                                <View style={{
                                    minHeight: 200,
                                    backgroundColor: '#fff',
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    borderWidth: 1,
                                    borderColor: theme.colors.outlineVariant
                                }}>
                                    {Platform.OS === 'web' ? (
                                        <iframe
                                            srcDoc={`
                                                <!DOCTYPE html>
                                                <html><head><style>
                                                    body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 20px; color: #000; }
                                                    a { color: ${theme.colors.primary}; }
                                                    img { max-width: 100%; height: auto; }
                                                    /* Hide weird gmail artifacts if any */
                                                    .gmail_quote { margin-left: 0; padding-left: 0; border-left: none; }
                                                </style></head>
                                                <body>
                                                    ${htmlContent}
                                                    <script>
                                                        // Auto-resize height
                                                        window.onload = function() {
                                                            var height = document.body.scrollHeight + 40;
                                                            window.frameElement.style.height = height + 'px';
                                                        }
                                                    </script>
                                                </body></html>
                                            `}
                                            style={{ width: '100%', height: '400px', border: 'none' }} // Default height, updated by script
                                            title="Email Content"
                                            sandbox="allow-same-origin allow-scripts"
                                        />
                                    ) : (
                                        <WebView source={{ html: htmlContent }} style={{ height: 400 }} />
                                    )}
                                </View>
                            </View>
                        );
                    }}
                />

                {/* Fixed Reply Footer */}
                <Surface elevation={2} style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }}>
                    <Button
                        mode="outlined"
                        icon="reply"
                        onPress={() => {
                            setComposeSubject(`Re: ${selectedThread.subject}`);
                            setComposeTo(selectedThread.from);
                            setComposeVisible(true);
                        }}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Reply
                    </Button>
                </Surface>
            </View>
        );
    };

    // Render Logic
    if (loading && !refreshing && !threadList.length && !isConnected) {
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

    return (
        <CRMLayout showHeader={!selectedThread || isDesktop} title="Inbox" navigation={navigation} fullWidth={true} scrollable={false}>
            {isDesktop ? (
                <View style={{ flexDirection: 'row', flex: 1, height: '100%' }}>
                    {renderThreadList()}
                    <View style={{ flex: 1, height: '100%' }}>
                        {selectedThread ? renderThreadDetail() : (
                            <View style={[styles.center, { opacity: 0.5 }]}>
                                <Avatar.Icon size={80} icon="email-outline" style={{ backgroundColor: 'transparent' }} />
                                <Text variant="headlineSmall" style={{ marginTop: 16 }}>Select an email to read</Text>
                            </View>
                        )}
                    </View>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    {selectedThread ? renderThreadDetail() : renderThreadList()}
                </View>
            )}

            <Portal>
                <Dialog visible={composeVisible} onDismiss={() => setComposeVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                    <Dialog.Title>Compose Email</Dialog.Title>
                    <Dialog.Content>
                        <TextInput label="To" mode="outlined" value={composeTo} onChangeText={setComposeTo} style={{ marginBottom: 12 }} dense />
                        <TextInput label="Subject" mode="outlined" value={composeSubject} onChangeText={setComposeSubject} style={{ marginBottom: 12 }} dense />
                        <TextInput label="Message" mode="outlined" value={composeBody} onChangeText={setComposeBody} multiline numberOfLines={10} style={{ maxHeight: 300 }} />
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

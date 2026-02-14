import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, Alert, Platform } from 'react-native';
import { Text, useTheme, Surface, ActivityIndicator, FAB, Appbar, Avatar, IconButton, Dialog, Portal, TextInput, Button, Checkbox } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import * as DocumentPicker from 'expo-document-picker';
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
    const activeThreadIdRef = useRef(null); // Track active thread request to prevent race conditions

    // List State
    const [currentLabel, setCurrentLabel] = useState('INBOX');
    const [selectedThreads, setSelectedThreads] = useState([]);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Helper: Fetch Inbox (Moved up for scope)
    const fetchInbox = async (loadMore = false) => {
        if (loadingMore) return;
        if (loadMore && !nextPageToken) return;

        if (loadMore) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            // Include Label in URL
            let url = `${BASE_URL}/gmail?action=list&userId=${user.uid}&label=${currentLabel}`;
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
                    setThreadList(prev => {
                        const existingIds = new Set(prev.map(t => t.id));
                        const newThreads = data.threads.filter(t => !existingIds.has(t.id));
                        return [...prev, ...newThreads];
                    });
                } else {
                    setThreadList(data.threads);
                }
                setNextPageToken(data.nextPageToken || null);
            } else {
                if (!loadMore) setThreadList([]); // Clear if no threads
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
        }
    };

    const toggleSelection = (id) => {
        setSelectedThreads(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return Array.from(newSet);
        });
    };

    // Effect to sync selection mode state
    useEffect(() => {
        setIsSelectionMode(selectedThreads.length > 0);
    }, [selectedThreads]);

    const handleBulkAction = async (actionType) => {
        if (selectedThreads.length === 0) return;

        const threadsToProcess = [...selectedThreads];

        // Optimistic UI: Remove from list
        setThreadList(prev => prev.filter(t => !threadsToProcess.includes(t.id)));
        setSelectedThreads([]);

        let body = { threadIds: threadsToProcess };
        if (actionType === 'archive') {
            body.removeLabelIds = ['INBOX'];
        } else if (actionType === 'trash') {
            body.addLabelIds = ['TRASH'];
            body.removeLabelIds = ['INBOX'];
        } else if (actionType === 'read') {
            body.removeLabelIds = ['UNREAD'];
        }

        try {
            await fetch(`${BASE_URL}/gmail?action=modify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, ...body })
            });
        } catch (error) {
            console.error(error);
            // Revert on error
            fetchInbox();
        }
    };
    const [loadingThread, setLoadingThread] = useState(false);
    const [threadDetail, setThreadDetail] = useState(null);

    // Compose State
    const [composeVisible, setComposeVisible] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [sending, setSending] = useState(false);

    // Helper: Convert Blob to Base64
    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const file = result.assets[0];
                // Read content
                const response = await fetch(file.uri);
                const blob = await response.blob();
                const base64 = await blobToBase64(blob);

                setAttachments(prev => [...prev, {
                    name: file.name,
                    mimeType: file.mimeType,
                    uri: file.uri,
                    data: base64
                }]);
            }
        } catch (err) {
            console.error('Attachment error:', err);
            Alert.alert('Error', 'Failed to attach file.');
        }
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // Auth Request Setup
    const redirectUri = makeRedirectUri({ scheme: 'easey' });


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

    // Refetch when label changes
    useEffect(() => {
        if (isConnected) {
            setThreadList([]);
            setNextPageToken(null);
            fetchInbox(false);
        }
    }, [currentLabel]);

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



    const onChangeSearch = query => setSearchQuery(query);

    const onSearch = () => {
        setNextPageToken(null);
        setThreadList([]);
        fetchInbox(false); // Reset and search
    };



    const loadThread = async (thread) => {
        // Track the latest requested thread ID
        activeThreadIdRef.current = thread.id;
        setSelectedThread(thread);
        setThreadDetail(null); // Clear previous detail immediately
        setLoadingThread(true);

        try {
            const res = await fetch(`${BASE_URL}/gmail?action=get&userId=${user.uid}&id=${thread.id}`);
            const data = await res.json();

            // Race Condition Check: Only update if this is still the active thread
            if (activeThreadIdRef.current === thread.id) {
                setThreadDetail(data);
            }
        } catch (error) {
            // Only alert if this is still the active thread
            if (activeThreadIdRef.current === thread.id) {
                Alert.alert('Error', 'Could not load email.');
            }
        } finally {
            // Only turn off loading if this is still the active thread
            if (activeThreadIdRef.current === thread.id) {
                setLoadingThread(false);
            }
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
                    threadId: selectedThread?.id,
                    attachments: attachments.map(a => ({
                        name: a.name,
                        mimeType: a.mimeType,
                        data: a.data
                    }))
                })
            });

            if (res.ok) {
                setComposeVisible(false);
                setComposeTo('');
                setComposeSubject('');
                setComposeBody('');
                setAttachments([]);
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

    const handleAction = async (actionType) => {
        if (!selectedThread) return;
        const threadId = selectedThread.id;

        let body = { threadId };

        if (actionType === 'read') {
            body.removeLabelIds = ['UNREAD'];
            // Optimistic Update for Read: Update list item to look read (optional, complex), or just do nothing visually for now 
            // The list will likely update on next fetch.
        } else {
            // Optimistic UI Update for Archive/Trash: Remove from list immediately
            setSelectedThread(null);
            setThreadDetail(null);
            setThreadList(prev => prev.filter(t => t.id !== threadId));

            if (actionType === 'archive') {
                body.removeLabelIds = ['INBOX'];
            } else if (actionType === 'trash') {
                body.addLabelIds = ['TRASH'];
                body.removeLabelIds = ['INBOX']; // Ensure it leaves Inbox
            }
        }

        try {
            await fetch(`${BASE_URL}/gmail?action=modify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, ...body })
            });
        } catch (error) {
            console.error('Action failed:', error);
            Alert.alert('Error', 'Action failed. Please refresh.');
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
            {/* List Header: Search or Selection Toolbar */}
            {isSelectionMode ? (
                <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.primaryContainer }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <IconButton icon="close" onPress={() => { setIsSelectionMode(false); setSelectedThreads([]); }} />
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{selectedThreads.length}</Text>
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                        <View style={{ flexDirection: 'row' }}>
                            <IconButton icon="select-all" onPress={() => setSelectedThreads(threadList.map(t => t.id))} />
                            <IconButton icon="email-open" onPress={() => handleBulkAction('read')} />
                            <IconButton icon="archive" onPress={() => handleBulkAction('archive')} />
                            <IconButton icon="delete" onPress={() => handleBulkAction('trash')} />
                        </View>
                    </View>
                </View>
            ) : (
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {/* Drawer Toggle for Mobile */}
                    {!isDesktop && <IconButton icon="menu" onPress={() => navigation.toggleDrawer?.()} />}

                    <TextInput
                        mode="outlined"
                        placeholder={`Search ${currentLabel.toLowerCase()}`}
                        value={searchQuery}
                        onChangeText={onChangeSearch}
                        onSubmitEditing={onSearch} // Trigger search on enter
                        left={<TextInput.Icon icon="magnify" />}
                        dense
                        style={{ flex: 1, backgroundColor: theme.colors.surface }}
                    />

                    {/* Folder Toggle: Inbox <-> Trash */}
                    <IconButton
                        icon={currentLabel === 'TRASH' ? 'inbox-arrow-down' : 'trash-can-outline'}
                        mode={currentLabel === 'TRASH' ? 'contained' : 'outlined'}
                        containerColor={currentLabel === 'TRASH' ? theme.colors.errorContainer : undefined}
                        iconColor={currentLabel === 'TRASH' ? theme.colors.onErrorContainer : theme.colors.error}
                        onPress={() => {
                            const newLabel = currentLabel === 'TRASH' ? 'INBOX' : 'TRASH';
                            setCurrentLabel(newLabel);
                        }}
                    />

                    {/* Compose Button */}
                    <IconButton
                        icon="pencil"
                        mode="contained"
                        containerColor={theme.colors.primary}
                        iconColor={theme.colors.onPrimary}
                        onPress={() => {
                            setComposeTo('');
                            setComposeSubject('');
                            setComposeBody('');
                            setAttachments([]);
                            setComposeVisible(true);
                        }}
                    />
                </View>
            )}



            {/* Scrollable List */}
            <FlatList
                data={threadList}
                renderItem={({ item }) => (
                    <ThreadItem
                        item={item}
                        theme={theme}
                        currentLabel={currentLabel}
                        isSelected={selectedThread?.id === item.id}
                        isMultiSelect={isSelectionMode}
                        isChecked={selectedThreads.includes(item.id)}
                        onToggle={() => toggleSelection(item.id)}
                        onPress={() => {
                            if (isSelectionMode) toggleSelection(item.id);
                            else loadThread(item);
                        }}
                        onLongPress={() => toggleSelection(item.id)}
                    />
                )}
                keyExtractor={item => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setNextPageToken(null); fetchInbox(false); }} />}
                onEndReached={() => fetchInbox(true)}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} /> : null}
                contentContainerStyle={{ flexGrow: 1 }}
            />
        </View>
    );

    // Optimized List Item
    const ThreadItem = React.memo(({ item, theme, isSelected, isMultiSelect, isChecked, onToggle, onPress, onLongPress }) => {
        const isUnread = item.isUnread; // Use backend flag
        return (
            <TouchableOpacity onPress={onPress} onLongPress={onLongPress} delayLongPress={300}>
                <View style={[
                    styles.threadItem,
                    {
                        backgroundColor: isChecked ? theme.colors.primaryContainer :
                            (isSelected ? theme.colors.secondaryContainer :
                                (isUnread ? theme.colors.surfaceVariant : theme.colors.surface)), // Highlight unread slightly
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.outlineVariant
                    }
                ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
                        {/* Selection Checkbox / Avatar */}
                        <TouchableOpacity onPress={onToggle}>
                            {isMultiSelect || isChecked ? (
                                <View style={{ justifyContent: 'center', height: 40, width: 40, alignItems: 'center', backgroundColor: isChecked ? theme.colors.primary : 'transparent', borderRadius: 20 }}>
                                    <Checkbox status={isChecked ? 'checked' : 'unchecked'} onPress={onToggle} color={isChecked ? theme.colors.onPrimary : theme.colors.onSurfaceVariant} />
                                </View>
                            ) : (
                                <Avatar.Text
                                    size={40}
                                    label={item.from?.charAt(0).toUpperCase() || '?'}
                                    style={{ backgroundColor: isUnread ? theme.colors.primary : theme.colors.secondaryContainer }}
                                    color={isUnread ? theme.colors.onPrimary : theme.colors.onSecondaryContainer}
                                />
                            )}
                        </TouchableOpacity>

                        <View style={{ marginLeft: 12, flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                                <Text variant="titleSmall" style={{ fontWeight: isUnread ? '800' : 'normal', color: theme.colors.onSurface }} numberOfLines={1}>
                                    {item.from}
                                </Text>
                                <Text variant="bodySmall" style={{ color: isUnread ? theme.colors.primary : theme.colors.outline, fontWeight: isUnread ? 'bold' : 'normal' }}>
                                    {item.date?.split(' ')[0]}
                                </Text>
                            </View>
                            <Text variant="bodyMedium" style={{ fontWeight: isUnread ? '700' : '500', marginBottom: 2, color: theme.colors.onSurface }} numberOfLines={1}>
                                {item.subject}
                            </Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                                {item.snippet}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        )
    });

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
                    <Appbar.Action icon="email-open-outline" onPress={() => handleAction('read')} />
                    <Appbar.Action icon="archive-outline" onPress={() => handleAction('archive')} />
                    <Appbar.Action icon="delete-outline" onPress={() => handleAction('trash')} />
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

                                {/* Attachments */}
                                {item.payload.parts && item.payload.parts.map((part, pIndex) => {
                                    if (part.filename && part.body && part.body.attachmentId) {
                                        return (
                                            <TouchableOpacity
                                                key={pIndex}
                                                style={{
                                                    marginTop: 12,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    backgroundColor: theme.colors.surfaceVariant,
                                                    padding: 8,
                                                    borderRadius: 8,
                                                    alignSelf: 'flex-start'
                                                }}
                                                onPress={() => {
                                                    // Open attachment proxy url
                                                    const attachUrl = `${BASE_URL}/gmail?action=attachment&userId=${user.uid}&messageId=${item.id}&attachmentId=${part.body.attachmentId}`;
                                                    WebBrowser.openBrowserAsync(attachUrl);
                                                }}
                                            >
                                                <Avatar.Icon size={32} icon="paperclip" style={{ backgroundColor: 'transparent' }} color={theme.colors.onSurfaceVariant} />
                                                <Text style={{ marginLeft: 8, fontWeight: '500', color: theme.colors.onSurfaceVariant }}>{part.filename}</Text>
                                            </TouchableOpacity>
                                        );
                                    }
                                    return null;
                                })}
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
                            setComposeBody('');
                            setAttachments([]);
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
                        <TextInput label="Message" mode="outlined" value={composeBody} onChangeText={setComposeBody} multiline numberOfLines={10} style={{ maxHeight: 300, marginBottom: 12 }} />

                        {/* Attachments List */}
                        {attachments.length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                {attachments.map((file, index) => (
                                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceVariant, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 16 }}>
                                        <Avatar.Icon size={24} icon="file" style={{ backgroundColor: 'transparent' }} color={theme.colors.onSurfaceVariant} />
                                        <Text variant="bodySmall" style={{ maxWidth: 150 }} numberOfLines={1}>{file.name}</Text>
                                        <IconButton icon="close" size={16} onPress={() => removeAttachment(index)} />
                                    </View>
                                ))}
                            </View>
                        )}

                        <Button icon="paperclip" mode="text" onPress={pickDocument} style={{ alignSelf: 'flex-start' }}>
                            Attach File
                        </Button>
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

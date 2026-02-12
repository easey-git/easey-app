import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { Text, useTheme, Surface, FAB, Dialog, Portal, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';

const API_URL = 'https://easey-app.vercel.app/api/yahoo-mail';

const MailScreen = ({ navigation }) => {
    const theme = useTheme();
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Compose State
    const [composeVisible, setComposeVisible] = useState(false);
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        fetchEmails();
    }, []);

    const fetchEmails = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}?action=list&limit=20`);
            const data = await response.json();
            if (data.success) {
                setEmails(data.messages || []);
            } else {
                // If it's a 500 error about credentials
                if (data.error && data.error.includes('Missing Yahoo Credentials')) {
                    Alert.alert("Setup Required", "Please add YAHOO_EMAIL and YAHOO_APP_PASSWORD to your Vercel Environment Variables.");
                } else {
                    console.error("Mail Error:", data.error);
                }
            }
        } catch (error) {
            console.error(error);
            // Alert.alert("Error", "Network or Server Error");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleSend = async () => {
        if (!to || !subject || !body) return Alert.alert("Missing Fields", "Please fill all fields");

        setSending(true);
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'send',
                    to,
                    subject,
                    body
                })
            });
            const data = await response.json();
            if (data.success) {
                Alert.alert("Success", "Email Sent");
                setComposeVisible(false);
                setTo(''); setSubject(''); setBody('');
                fetchEmails();
            } else {
                Alert.alert("Error", data.error || "Failed to send");
            }
        } catch (error) {
            Alert.alert("Error", error.message);
        } finally {
            setSending(false);
        }
    };

    const renderItem = ({ item }) => (
        <Surface style={[styles.emailItem, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <View style={styles.headerRow}>
                <Text variant="titleSmall" style={{ fontWeight: 'bold', flex: 1 }} numberOfLines={1}>{item.from}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.date ? new Date(item.date).toLocaleDateString() : ''}</Text>
            </View>
            <Text variant="bodyMedium" numberOfLines={1} style={{ marginTop: 4, fontWeight: '500' }}>{item.subject}</Text>
            <Text variant="bodySmall" numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                {item.snippet || 'Loading message content...'}
            </Text>
        </Surface>
    );

    return (
        <CRMLayout title="Yahoo Mail" navigation={navigation} scrollable={false}>
            <View style={{ flex: 1, position: 'relative' }}>
                {loading && !refreshing && (
                    <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                        <ActivityIndicator size="large" />
                        <Text style={{ marginTop: 10, color: theme.colors.onSurface }}>Connecting to Yahoo...</Text>
                    </View>
                )}

                {(!loading || refreshing) && (
                    <FlatList
                        data={emails}
                        keyExtractor={(item) => item.id ? item.id.toString() : Math.random().toString()}
                        renderItem={renderItem}
                        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEmails(); }} />
                        }
                        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 32, color: theme.colors.onSurfaceVariant }}>No emails found in the last 7 days.</Text>}
                    />
                )}

                <FAB
                    icon="email-plus"
                    style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
                    color={theme.colors.onPrimaryContainer}
                    onPress={() => setComposeVisible(true)}
                    label="Compose"
                />

                <Portal>
                    <Dialog visible={composeVisible} onDismiss={() => setComposeVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                        <Dialog.Title>Compose Email</Dialog.Title>
                        <Dialog.Content>
                            <TextInput
                                label="To"
                                value={to}
                                onChangeText={setTo}
                                mode="outlined"
                                style={{ marginBottom: 12 }}
                            />
                            <TextInput
                                label="Subject"
                                value={subject}
                                onChangeText={setSubject}
                                mode="outlined"
                                style={{ marginBottom: 12 }}
                            />
                            <TextInput
                                label="Message"
                                value={body}
                                onChangeText={setBody}
                                mode="outlined"
                                multiline
                                numberOfLines={6}
                                style={{ maxHeight: 200 }}
                            />
                        </Dialog.Content>
                        <Dialog.Actions>
                            <Button onPress={() => setComposeVisible(false)}>Cancel</Button>
                            <Button onPress={handleSend} loading={sending} mode="contained">Send</Button>
                        </Dialog.Actions>
                    </Dialog>
                </Portal>
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    emailItem: {
        padding: 16,
        borderRadius: 12,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
        borderRadius: 16,
    },
});

export default MailScreen;

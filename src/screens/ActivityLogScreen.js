import React, { useEffect, useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, Platform } from 'react-native';
import { Text, useTheme, Surface, Avatar, Chip, ActivityIndicator, List, Icon } from 'react-native-paper';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

const ActivityLogScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission } = useAuth();
    const [logs, setLogs] = useState([]);
    const [users, setUsers] = useState({});
    const [loading, setLoading] = useState(true);

    if (!hasPermission('manage_users')) {
        return <AccessDenied title="Access Denied" message="You need permission to view activity logs." />;
    }

    // 1. Fetch Users for "Online Status"
    useEffect(() => {
        const q = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const userMap = {};
            snapshot.docs.forEach(doc => {
                userMap[doc.id] = { id: doc.id, ...doc.data() };
            });
            setUsers(userMap);
        });
        return () => unsubscribe();
    }, []);

    // 2. Fetch Logs Realtime
    useEffect(() => {
        setLoading(true);
        const q = query(
            collection(db, 'activity_logs'),
            orderBy('timestamp', 'desc'),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLogs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setLogs(fetchedLogs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching logs:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const getActionIcon = (action) => {
        if (action.includes('LOGIN')) return 'login';
        if (action.includes('LOGOUT')) return 'logout';
        if (action.includes('VIEW')) return 'eye-outline';
        if (action.includes('EDIT')) return 'pencil-outline';
        if (action.includes('DELETE')) return 'trash-can-outline';
        if (action.includes('CREATE') || action.includes('ADD')) return 'plus-circle-outline';
        return 'history';
    };

    const getActionColor = (action) => {
        if (action.includes('LOGIN')) return theme.colors.primary;
        if (action.includes('DELETE')) return theme.colors.error;
        if (action.includes('EDIT')) return theme.colors.tertiary;
        return theme.colors.secondary;
    };

    const formatDateTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const OnlineUsers = useMemo(() => {
        // Filter users who were active in last 5 minutes
        const now = new Date();
        const activeThreshold = 5 * 60 * 1000; // 5 mins

        return Object.values(users).filter(u => {
            if (!u.lastActive) return false;
            const lastActive = u.lastActive.toDate ? u.lastActive.toDate() : new Date(u.lastActive);
            return (now - lastActive) < activeThreshold;
        });
    }, [users, logs]); // Re-calc when logs update (as heartbeat updates user doc)

    const renderLogItem = ({ item }) => (
        <View style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16 }}>
            {/* Timeline Line */}
            <View style={{ alignItems: 'center', marginRight: 16 }}>
                <View style={{
                    width: 2,
                    flex: 1,
                    backgroundColor: theme.colors.outlineVariant,
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 15 // Center of 32px avatar
                }} />
                <Avatar.Text
                    size={32}
                    label={item.userEmail ? item.userEmail.charAt(0).toUpperCase() : '?'}
                    style={{ backgroundColor: theme.colors.surfaceVariant, marginBottom: 4 }}
                />
            </View>

            <Surface style={[styles.logCard, { backgroundColor: theme.colors.surface }]} elevation={0}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                        {item.userEmail}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                        {formatDateTime(item.timestamp)}
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Icon source={getActionIcon(item.action)} size={14} color={getActionColor(item.action)} />
                    <Text variant="bodySmall" style={{ fontWeight: 'bold', color: getActionColor(item.action) }}>
                        {item.action}
                    </Text>
                </View>

                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.description}
                </Text>

                {item.meta && Object.keys(item.meta).length > 0 && (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                        {Object.entries(item.meta).map(([k, v]) => (
                            <Text key={k} variant="labelSmall" style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                                {k}: {String(v).substring(0, 50)}
                            </Text>
                        ))}
                    </View>
                )}
            </Surface>
        </View>
    );

    return (
        <CRMLayout title="Activity Log" navigation={navigation} scrollable={false} fullWidth={true}>
            {/* Online Users Header */}
            <View style={{ padding: 16, backgroundColor: theme.colors.surfaceVariant }}>
                <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 8, color: theme.colors.onSurfaceVariant }}>
                    Online Agents ({OnlineUsers.length})
                </Text>
                {OnlineUsers.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {OnlineUsers.map(u => (
                            <Chip
                                key={u.id}
                                avatar={<Avatar.Text size={24} label={u.email.charAt(0).toUpperCase()} />}
                                compact
                            >
                                {u.email}
                            </Chip>
                        ))}
                    </View>
                ) : (
                    <Text variant="bodySmall" style={{ color: theme.colors.outline }}>No active agents right now.</Text>
                )}
            </View>

            {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator />
                </View>
            ) : (
                <FlatList
                    data={logs}
                    renderItem={renderLogItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingBottom: 24 }}
                // Reverse Layout logic simulation (Newest top is standard for feeds, so our orderby desc is correct)
                />
            )}
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    logCard: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        marginBottom: 4
    }
});

export default ActivityLogScreen;

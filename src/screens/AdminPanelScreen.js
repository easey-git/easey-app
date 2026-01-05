import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ScrollView } from 'react-native';
import { Text, useTheme, Avatar, Surface, IconButton, ActivityIndicator, Chip, Divider, Button, Portal, Dialog, Switch } from 'react-native-paper';
import { collection, getDocs, query, orderBy, doc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CRMLayout } from '../components/CRMLayout';

const AdminPanelScreen = ({ navigation }) => {
    const theme = useTheme();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Realtime listener for users
        const q = query(collection(db, 'users'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const userList = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .filter(user => user.email); // Only show users with an email
            setUsers(userList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching users:", error);
            setLoading(false);
        });

        // Cleanup subscription
        return () => unsubscribe();
    }, []);

    const [selectedUser, setSelectedUser] = useState(null);
    const [permissionsDialogVisible, setPermissionsDialogVisible] = useState(false);
    const [tempPermissions, setTempPermissions] = useState([]);

    const AVAILABLE_PERMISSIONS = [
        // Dashboard
        { id: 'view_financial_stats', label: 'View Financial Stats' },
        { id: 'view_order_stats', label: 'View Order Stats' },

        // Features
        { id: 'access_orders', label: 'Access Orders' },
        { id: 'access_wallet', label: 'Access Wallet' },
        { id: 'access_campaigns', label: 'Access Campaigns' },
        { id: 'access_whatsapp', label: 'Access WhatsApp' },
        { id: 'access_analytics', label: 'Access Analytics' },

        // Management
        { id: 'manage_orders', label: 'Manage Orders' },
        { id: 'manage_wallet', label: 'Manage Wallet' },
        { id: 'manage_campaigns', label: 'Manage Campaigns' },
        { id: 'manage_users', label: 'Manage Users' },
    ];

    const openPermissionsDialog = (user) => {
        setSelectedUser(user);
        setTempPermissions(user.permissions || []);
        setPermissionsDialogVisible(true);
    };

    const togglePermission = (permissionId) => {
        if (tempPermissions.includes(permissionId)) {
            setTempPermissions(prev => prev.filter(id => id !== permissionId));
        } else {
            setTempPermissions(prev => [...prev, permissionId]);
        }
    };

    const handleSavePermissions = async () => {
        if (!selectedUser) return;
        try {
            const userRef = doc(db, 'users', selectedUser.id);
            await updateDoc(userRef, {
                permissions: tempPermissions
            });
            setPermissionsDialogVisible(false);
        } catch (error) {
            console.error("Error updating permissions:", error);
        }
    };

    const cleanupInvalidUsers = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            const deletePromises = [];
            querySnapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                if (!data.email) {
                    deletePromises.push(deleteDoc(docSnapshot.ref));
                }
            });
            await Promise.all(deletePromises);
            if (deletePromises.length > 0) {
                alert(`Cleaned up ${deletePromises.length} invalid users.`);
            } else {
                alert("No invalid users found.");
            }
        } catch (error) {
            console.error("Error cleaning users:", error);
            alert("Failed to cleanup users.");
        }
    };

    const renderItem = ({ item }) => (
        <Surface style={[styles.userCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Avatar.Text
                    size={48}
                    label={item.email ? item.email.charAt(0).toUpperCase() : "U"}
                    style={{ backgroundColor: theme.colors.primaryContainer }}
                    color={theme.colors.onPrimaryContainer}
                />
                <View style={{ marginLeft: 16, flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                        {item.email}
                    </Text>
                    {item.displayName && item.displayName !== item.email && item.displayName !== 'User' && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {item.displayName}
                        </Text>
                    )}
                    <View style={{ flexDirection: 'row', marginTop: 12, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <View style={{
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: item.role === 'admin' ? theme.colors.primary : theme.colors.outline,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            backgroundColor: item.role === 'admin' ? theme.colors.primaryContainer : 'transparent',
                        }}>
                            <Text style={{
                                fontSize: 12,
                                fontWeight: 'bold',
                                color: item.role === 'admin' ? theme.colors.primary : theme.colors.onSurfaceVariant
                            }}>
                                {item.role === 'admin' ? 'Admin' : 'User'}
                            </Text>
                        </View>
                        {item.permissions && item.permissions.slice(0, 2).map(perm => (
                            <View key={perm} style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>{perm.replace('_', ' ')}</Text>
                            </View>
                        ))}
                        {item.permissions && item.permissions.length > 2 && (
                            <Text style={{ fontSize: 10, color: theme.colors.outline }}>+{item.permissions.length - 2} more</Text>
                        )}
                    </View>
                </View>
                <IconButton icon="pencil" onPress={() => openPermissionsDialog(item)} />
            </View>
        </Surface>
    );

    return (
        <CRMLayout title="Admin Panel" navigation={navigation} actions={<IconButton icon="broom" onPress={cleanupInvalidUsers} />}>
            <View style={{ flex: 1 }}>
                <View style={{ paddingVertical: 16 }}>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', paddingHorizontal: 16 }}>User Management</Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 16 }}>
                        Manage access and roles for all registered users.
                    </Text>
                </View>

                {loading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={theme.colors.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={users}
                        renderItem={renderItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ padding: 16 }}
                        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                        ListEmptyComponent={
                            <View style={{ alignItems: 'center', marginTop: 50 }}>
                                <Text style={{ color: theme.colors.outline }}>No users found.</Text>
                            </View>
                        }
                    />
                )}

                {/* Permissions Dialog */}
                <Portal>
                    <Dialog visible={permissionsDialogVisible} onDismiss={() => setPermissionsDialogVisible(false)}>
                        <Dialog.Title>Edit Permissions</Dialog.Title>
                        <Dialog.Content style={{ paddingBottom: 0 }}>
                            <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                                Assign fine-grained access to {selectedUser?.email}
                            </Text>
                        </Dialog.Content>
                        <Dialog.ScrollArea style={{ maxHeight: 400, paddingHorizontal: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.outlineVariant }}>
                            <ScrollView contentContainerStyle={{ padding: 24 }}>
                                <View style={{ gap: 8 }}>
                                    {AVAILABLE_PERMISSIONS.map((perm) => (
                                        <Surface
                                            key={perm.id}
                                            style={{
                                                padding: 12,
                                                borderRadius: 8,
                                                backgroundColor: tempPermissions.includes(perm.id) ? theme.colors.secondaryContainer : theme.colors.surface,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                borderWidth: 1,
                                                borderColor: tempPermissions.includes(perm.id) ? 'transparent' : theme.colors.outlineVariant
                                            }}
                                            mode="flat"
                                        >
                                            <Text variant="bodyMedium" style={{ fontWeight: tempPermissions.includes(perm.id) ? 'bold' : 'normal' }}>{perm.label}</Text>
                                            <Switch
                                                value={tempPermissions.includes(perm.id)}
                                                onValueChange={() => togglePermission(perm.id)}
                                            />
                                        </Surface>
                                    ))}
                                </View>
                            </ScrollView>
                        </Dialog.ScrollArea>
                        <Dialog.Actions>
                            <Button onPress={() => setPermissionsDialogVisible(false)}>Cancel</Button>
                            <Button onPress={handleSavePermissions} mode="contained">Save</Button>
                        </Dialog.Actions>
                    </Dialog>
                </Portal>
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    userCard: {
        padding: 16,
        borderRadius: 16,
    }
});

export default AdminPanelScreen;

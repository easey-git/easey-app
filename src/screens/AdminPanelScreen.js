import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ScrollView, useWindowDimensions, Alert, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Text, useTheme, Avatar, Surface, IconButton, ActivityIndicator, Chip, Divider, Button, Portal, Dialog, Switch } from 'react-native-paper';
import { collection, getDocs, query, orderBy, doc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { ActivityLogService } from '../services/activityLogService';
import { CRMLayout } from '../components/CRMLayout';

const AdminPanelScreen = ({ navigation }) => {
    const theme = useTheme();
    const { width, height } = useWindowDimensions();
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

    const ROLE_PRESETS = {
        'Manager': ['view_financial_stats', 'view_order_stats', 'access_orders', 'access_wallet', 'access_campaigns', 'access_whatsapp', 'access_analytics', 'manage_orders', 'manage_wallet', 'manage_campaigns', 'manage_users'],
        'Support': ['view_order_stats', 'access_orders', 'access_whatsapp', 'manage_orders'],
        'Analyst': ['view_financial_stats', 'view_order_stats', 'access_orders', 'access_analytics', 'access_campaigns'],
        'Viewer': ['view_order_stats', 'access_orders']
    };

    const applyPreset = (presetName) => {
        setTempPermissions(ROLE_PRESETS[presetName]);
    };

    const AVAILABLE_PERMISSIONS = [
        // Dashboard
        { id: 'view_financial_stats', label: 'View Financial Stats' },
        { id: 'view_order_stats', label: 'View Order Stats' },
        { id: 'view_date_filters', label: 'View Date Filters' },

        // Features
        { id: 'access_orders', label: 'Access Orders' },
        { id: 'access_wallet', label: 'Access Wallet' },
        { id: 'access_campaigns', label: 'Access Campaigns' },
        { id: 'access_whatsapp', label: 'Access WhatsApp' },
        { id: 'access_logistics', label: 'Access Logistics' },
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

            // Log Activity
            if (currentUser) {
                ActivityLogService.log(
                    currentUser.uid,
                    currentUser.email,
                    'UPDATE_PERMISSIONS',
                    `Updated permissions for user ${selectedUser.email}`,
                    { targetUserId: selectedUser.id, permissions: tempPermissions }
                );
            }

            setPermissionsDialogVisible(false);
        } catch (error) {
            console.error("Error updating permissions:", error);
        }
    };

    const { user: currentUser } = useAuth();

    // Generic Confirmation Dialog State
    const [confirmDialogVisible, setConfirmDialogVisible] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState({
        title: '',
        message: '',
        action: null,
        confirmLabel: 'Confirm',
        isDestructive: false
    });

    const confirmDelete = (user) => {
        setConfirmConfig({
            title: "Delete User",
            message: `Are you sure you want to delete user ${user.email}? This cannot be undone.`,
            action: () => handleDeleteUser(user.id),
            confirmLabel: "Delete",
            isDestructive: true
        });
        setConfirmDialogVisible(true);
    };

    const handleDeleteUser = async (userId) => {
        try {
            await deleteDoc(doc(db, 'users', userId));

            // Log Activity
            if (currentUser) {
                ActivityLogService.log(
                    currentUser.uid,
                    currentUser.email,
                    'DELETE_USER',
                    `Deleted user ${userId}`,
                    { targetUserId: userId }
                );
            }

            setConfirmDialogVisible(false);
        } catch (error) {
            console.error("Error deleting user:", error);
            Alert.alert("Error", "Failed to delete user.");
        }
    };


    const confirmToggleStatus = (user) => {
        const action = user.disabled ? "Enable" : "Disable";
        setConfirmConfig({
            title: `${action} User`,
            message: `Are you sure you want to ${action.toLowerCase()} account access for ${user.email}?`,
            action: () => handleToggleStatus(user),
            confirmLabel: action,
            isDestructive: !user.disabled // Disable is destructive (red), Enable is neutral
        });
        setConfirmDialogVisible(true);
    };

    const handleToggleStatus = async (user) => {
        setLoading(true);
        try {
            const toggleUserStatus = httpsCallable(functions, 'toggleUserStatus');

            await toggleUserStatus({
                uid: user.id,
                disabled: !user.disabled
            });

            // Optimistic update
            setUsers(prev => prev.map(u =>
                u.id === user.id ? { ...u, disabled: !user.disabled } : u
            ));

            Alert.alert("Success", `User ${!user.disabled ? 'disabled' : 'enabled'} successfully.`);

            // Log Activity
            if (currentUser) {
                ActivityLogService.log(
                    currentUser.uid,
                    currentUser.email,
                    'TOGGLE_USER_STATUS',
                    `${!user.disabled ? 'Disabled' : 'Enabled'} user ${user.email}`,
                    { targetUserId: user.id, newStatus: !user.disabled ? 'disabled' : 'enabled' }
                );
            }
        } catch (error) {
            console.error("Error toggling status:", error);
            Alert.alert("Error", error.message || "Failed to update user status.");
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }) => {
        const isMobile = width < 600;

        return (
            <Surface style={[
                styles.userCard,
                {
                    backgroundColor: theme.colors.elevation.level1,
                    padding: isMobile ? 12 : 16
                }
            ]} elevation={0}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    {/* Avatar */}
                    <Avatar.Text
                        size={isMobile ? 40 : 48}
                        label={item.email ? item.email.charAt(0).toUpperCase() : "U"}
                        style={{ backgroundColor: theme.colors.primaryContainer }}
                        color={theme.colors.onPrimaryContainer}
                    />

                    {/* User Info */}
                    <View style={{ marginLeft: isMobile ? 12 : 16, flex: 1, minWidth: 0 }}>
                        <Text
                            variant={isMobile ? "bodyLarge" : "titleMedium"}
                            style={{ fontWeight: 'bold', color: theme.colors.onSurface }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.65}
                        >
                            {item.email}
                        </Text>
                        {item.displayName && item.displayName !== item.email && item.displayName !== 'User' && (
                            <Text
                                variant="bodySmall"
                                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.7}
                            >
                                {item.displayName}
                            </Text>
                        )}

                        {/* Role and Permissions */}
                        <View style={{ flexDirection: 'row', marginTop: 8, alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <View style={{
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: item.role === 'admin' ? theme.colors.primary : theme.colors.outline,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                backgroundColor: item.role === 'admin' ? theme.colors.primaryContainer : 'transparent',
                            }}>
                                <Text style={{
                                    fontSize: 11,
                                    fontWeight: 'bold',
                                    color: item.role === 'admin' ? theme.colors.primary : theme.colors.onSurfaceVariant
                                }}>
                                    {item.role === 'admin' ? 'Admin' : 'User'}
                                </Text>
                            </View>
                            {!isMobile && item.permissions && item.permissions.slice(0, 2).map(perm => (
                                <View key={perm} style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                    <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>{perm.replace('_', ' ')}</Text>
                                </View>
                            ))}
                            {!isMobile && item.permissions && item.permissions.length > 2 && (
                                <Text style={{ fontSize: 10, color: theme.colors.outline }}>+{item.permissions.length - 2} more</Text>
                            )}
                            {isMobile && item.permissions && item.permissions.length > 0 && (
                                <Text style={{ fontSize: 10, color: theme.colors.outline }}>
                                    {item.permissions.length} permission{item.permissions.length !== 1 ? 's' : ''}
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={{ flexDirection: 'row', marginLeft: isMobile ? 4 : 8, flexShrink: 0 }}>
                        <IconButton
                            icon={item.disabled ? "account-off" : "account-check"}
                            iconColor={item.disabled ? theme.colors.error : theme.colors.primary}
                            onPress={() => confirmToggleStatus(item)}
                            disabled={currentUser?.uid === item.id}
                            size={isMobile ? 20 : 24}
                            style={{ margin: 0 }}
                        />
                        <IconButton
                            icon="pencil"
                            onPress={() => openPermissionsDialog(item)}
                            size={isMobile ? 20 : 24}
                            style={{ margin: 0 }}
                        />
                        <IconButton
                            icon="delete"
                            iconColor={theme.colors.error}
                            onPress={() => confirmDelete(item)}
                            disabled={currentUser?.uid === item.id}
                            size={isMobile ? 20 : 24}
                            style={{ margin: 0 }}
                        />
                    </View>
                </View>
            </Surface>
        );
    };
    return (
        <CRMLayout title="Admin Panel" navigation={navigation} scrollable={false}>
            <View style={{ flex: 1 }}>
                <View style={{ paddingVertical: 16 }}>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', paddingHorizontal: 16 }}>User Management</Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 16 }}>
                        Manage access and roles for all registered users.
                    </Text>
                    <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                        <Button
                            mode="contained-tonal"
                            icon="history"
                            onPress={() => navigation.navigate('ActivityLog')}
                        >
                            View Activity Logs
                        </Button>
                    </View>
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
                        contentContainerStyle={{ padding: width < 600 ? 12 : 16 }}
                        ItemSeparatorComponent={() => <View style={{ height: width < 600 ? 8 : 12 }} />}
                        ListEmptyComponent={
                            <View style={{ alignItems: 'center', marginTop: 50 }}>
                                <Text style={{ color: theme.colors.outline }}>No users found.</Text>
                            </View>
                        }
                    />
                )}

                {/* Permissions Dialog */}
                <Portal>
                    <Dialog
                        visible={permissionsDialogVisible}
                        onDismiss={() => setPermissionsDialogVisible(false)}
                        style={{
                            maxHeight: height * 0.85,
                            width: width > 768 ? 600 : '90%',
                            alignSelf: 'center'
                        }}
                    >
                        <Dialog.Title>Edit Permissions</Dialog.Title>
                        <Dialog.Content style={{ paddingBottom: 0 }}>
                            <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
                                Quick Presets:
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                {Object.keys(ROLE_PRESETS).map(role => (
                                    <Chip
                                        key={role}
                                        onPress={() => applyPreset(role)}
                                        mode="outlined"
                                        style={{ height: 32 }}
                                        textStyle={{ fontSize: 12, lineHeight: 18 }}
                                    >
                                        {role}
                                    </Chip>
                                ))}
                            </View>
                            <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                                Assign fine-grained access to {selectedUser?.email}
                            </Text>
                        </Dialog.Content>
                        <Dialog.ScrollArea style={{ borderColor: theme.colors.outlineVariant, borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: 0 }}>
                            <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={{ padding: 24 }}>
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

                {/* Confirmation Dialog */}
                <Portal>
                    <Dialog
                        visible={confirmDialogVisible}
                        onDismiss={() => setConfirmDialogVisible(false)}
                        style={{
                            width: width > 600 ? 400 : '90%',
                            alignSelf: 'center',
                            borderRadius: 12,
                            backgroundColor: theme.colors.elevation.level3
                        }}
                    >
                        <Dialog.Title style={{ textAlign: 'center', fontSize: 20, fontWeight: 'bold' }}>
                            {confirmConfig.title}
                        </Dialog.Title>
                        <Dialog.Content>
                            <Text variant="bodyMedium" style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant }}>
                                {confirmConfig.message}
                            </Text>
                        </Dialog.Content>
                        <Dialog.Actions style={{ justifyContent: 'space-around', paddingBottom: 16 }}>
                            <Button
                                mode="outlined"
                                onPress={() => setConfirmDialogVisible(false)}
                                style={{ flex: 1, marginRight: 8, borderColor: theme.colors.outline }}
                                textColor={theme.colors.onSurface}
                            >
                                Cancel
                            </Button>
                            <Button
                                mode="contained"
                                onPress={() => {
                                    if (confirmConfig.action) confirmConfig.action();
                                    setConfirmDialogVisible(false);
                                }}
                                style={{ flex: 1, marginLeft: 8, backgroundColor: confirmConfig.isDestructive ? theme.colors.error : theme.colors.primary }}
                                textColor={theme.colors.onError}
                            >
                                {confirmConfig.confirmLabel}
                            </Button>
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

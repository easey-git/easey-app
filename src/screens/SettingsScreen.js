import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme, Appbar, List, Switch, Divider, Surface, Avatar, Button, Dialog, Portal } from 'react-native-paper';
import * as LocalAuthentication from 'expo-local-authentication';
import { usePreferences } from '../context/PreferencesContext';
import { useAuth } from '../context/AuthContext';
import { CRMLayout } from '../components/CRMLayout';
import { ActivityLogService } from '../services/activityLogService';

const SettingsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { user, logout, isAdmin } = useAuth();
    const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);

    useEffect(() => {
        (async () => {
            const compatible = await LocalAuthentication.hasHardwareAsync();
            setIsBiometricSupported(compatible);
        })();
    }, []);

    const {
        isThemeDark,
        toggleTheme,
        notificationsEnabled,
        toggleNotifications,
        biometricsEnabled,
        toggleBiometrics
    } = usePreferences();

    const handleLogout = async () => {
        await logout();
        setLogoutDialogVisible(false);
    };

    return (
        <CRMLayout title="Settings" navigation={navigation} scrollable={true}>
            {/* Profile Section */}
            <Surface style={[styles.profileCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Avatar.Text size={56} label={user?.email?.charAt(0).toUpperCase() || "U"} style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.onPrimaryContainer} />
                    <View style={{ marginLeft: 16, flex: 1 }}>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{user?.email || "No email"}</Text>
                    </View>
                </View>
            </Surface>

            <List.Section title="Appearance">
                <List.Item
                    title="Dark Mode"
                    left={props => <List.Icon {...props} icon="theme-light-dark" />}
                    right={() => <Switch value={isThemeDark} onValueChange={() => {
                        toggleTheme();
                        if (user) {
                            ActivityLogService.log(
                                user.uid,
                                user.email,
                                'UPDATE_PREFERENCE',
                                `Changed theme to ${!isThemeDark ? 'Dark' : 'Light'}`,
                                { type: 'theme', value: !isThemeDark }
                            );
                        }
                    }} />}
                    style={styles.listItem}
                />
            </List.Section>

            <Divider />

            <List.Section title="Notifications">
                <List.Item
                    title="Push Notifications"
                    description="Receive alerts for new orders"
                    left={props => <List.Icon {...props} icon="bell-outline" />}
                    right={() => <Switch value={notificationsEnabled} onValueChange={() => {
                        toggleNotifications();
                        if (user) {
                            ActivityLogService.log(
                                user.uid,
                                user.email,
                                'UPDATE_PREFERENCE',
                                `${!notificationsEnabled ? 'Enabled' : 'Disabled'} notifications`,
                                { type: 'notifications', value: !notificationsEnabled }
                            );
                        }
                    }} />}
                    style={styles.listItem}
                />
            </List.Section>

            <Divider />

            <List.Section title="Security">
                <List.Item
                    title="Fingerprint Login"
                    left={props => <List.Icon {...props} icon="fingerprint" />}
                    right={() => <Switch value={biometricsEnabled} onValueChange={() => {
                        toggleBiometrics();
                        if (user) {
                            ActivityLogService.log(
                                user.uid,
                                user.email,
                                'UPDATE_PREFERENCE',
                                `${!biometricsEnabled ? 'Enabled' : 'Disabled'} biometrics`,
                                { type: 'biometrics', value: !biometricsEnabled }
                            );
                        }
                    }} disabled={!isBiometricSupported} />}
                    style={styles.listItem}
                />
            </List.Section>

            <Divider />

            <List.Section title="About">
                <List.Item
                    title="Version"
                    description="1.0.0 (Build 2025.12.17)"
                    left={props => <List.Icon {...props} icon="information-outline" />}
                    style={styles.listItem}
                />
            </List.Section>

            <Divider />

            {/* Admin Section - Only visible to admins */}
            {isAdmin && (
                <>
                    <List.Section title="System Administration">
                        <List.Item
                            title="Admin Panel"
                            description="Manage users and system settings"
                            left={props => <List.Icon {...props} icon="shield-crown-outline" color={theme.colors.primary} />}
                            onPress={() => navigation.navigate('AdminPanel')}
                            style={styles.listItem}
                        />
                    </List.Section>
                    <Divider />
                </>
            )}

            {/* Logout Button */}
            <View style={{ marginTop: 24, marginBottom: 32 }}>
                <Button
                    mode="outlined"
                    onPress={() => setLogoutDialogVisible(true)}
                    icon="logout"
                    textColor={theme.colors.error}
                    style={{ borderColor: theme.colors.error }}
                >
                    Sign Out
                </Button>
            </View>

            {/* Logout Confirmation Dialog */}
            <Portal>
                <Dialog visible={logoutDialogVisible} onDismiss={() => setLogoutDialogVisible(false)}>
                    <Dialog.Icon icon="logout" />
                    <Dialog.Title style={{ textAlign: 'center' }}>Sign Out</Dialog.Title>
                    <Dialog.Content>
                        <Text variant="bodyMedium" style={{ textAlign: 'center' }}>
                            Are you sure you want to sign out?
                        </Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setLogoutDialogVisible(false)}>Cancel</Button>
                        <Button onPress={handleLogout} textColor={theme.colors.error}>Sign Out</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    profileCard: {
        padding: 20,
        borderRadius: 16,
        marginBottom: 24,
        marginTop: 16,
    },
    listItem: {
        paddingVertical: 8,
    }
});

export default SettingsScreen;

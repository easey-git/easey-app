import React from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import { Text, TouchableRipple, useTheme, Drawer, Avatar } from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

export const Sidebar = ({ onClose }) => {
    const theme = useTheme();
    const route = useRoute();
    const navigation = useNavigation();
    const { logout, user, role, hasPermission } = useAuth();

    // Helper to get display name
    const getDisplayName = () => {
        if (user?.displayName) return user.displayName;
        if (user?.email) return user.email.split('@')[0];
        return 'User';
    };

    const displayName = getDisplayName();
    const displayRole = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';

    const menuItems = [
        { label: 'Dashboard', icon: 'view-dashboard', route: 'Home' }, // Always visible
        { label: 'Orders', icon: 'package-variant', route: 'DatabaseManager', permission: 'access_orders' },
        { label: 'Analytics', icon: 'chart-bar', route: 'Stats', permission: 'access_analytics' },
        { label: 'Wallet', icon: 'wallet-outline', route: 'Wallet', permission: 'access_wallet' },
        { label: 'WhatsApp', icon: 'whatsapp', route: 'WhatsAppManager', permission: 'access_whatsapp' },
        { label: 'Campaigns', icon: 'bullhorn', route: 'Campaigns', permission: 'access_campaigns' },
        { label: 'Notes', icon: 'notebook', route: 'Notes' }, // Always visible
        { label: 'Settings', icon: 'cog', route: 'Settings' }, // Always visible
    ];

    const visibleMenuItems = menuItems.filter(item => !item.permission || hasPermission(item.permission));

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.outlineVariant }]}>
            {/* Header / Logo */}
            <View style={styles.header}>
                <Image
                    source={theme.dark ? require('../../logo/easey-white.png') : require('../../logo/easey-dark.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </View>

            {/* Navigation Items */}
            <ScrollView style={styles.content}>
                <Drawer.Section showDivider={false}>
                    {visibleMenuItems.map((item, index) => {
                        const isActive = route.name === item.route;
                        return (
                            <Drawer.Item
                                key={index}
                                icon={item.icon}
                                label={item.label}
                                active={isActive}
                                onPress={() => {
                                    navigation.navigate(item.route);
                                    if (onClose) onClose();
                                }}
                                style={{ borderRadius: 8, marginBottom: 4 }}
                                theme={theme}
                            />
                        );
                    })}
                </Drawer.Section>
            </ScrollView>

            {/* User / Footer */}
            <View style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
                <TouchableRipple onPress={logout} style={styles.userCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar.Text
                            size={32}
                            label={displayName.substring(0, 2).toUpperCase()}
                            style={{ backgroundColor: theme.colors.primaryContainer }}
                            color={theme.colors.onPrimaryContainer}
                        />
                        <View style={{ marginLeft: 12 }}>
                            <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>{displayRole}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Logout</Text>
                        </View>
                    </View>
                </TouchableRipple>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 260,
        height: '100%',
        borderRightWidth: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        padding: 24,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    logo: {
        width: 120,
        height: 40,
    },
    content: {
        flex: 1,
        paddingHorizontal: 12,
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
    },
    userCard: {
        padding: 8,
        borderRadius: 8,
    }
});

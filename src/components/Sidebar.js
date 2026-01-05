import React from 'react';
import { View, StyleSheet, Image, ScrollView, Pressable } from 'react-native';
import { Text, useTheme, Drawer, Avatar } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { LAYOUT } from '../theme/layout';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../context/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';

export const Sidebar = ({ onClose }) => {
    const theme = useTheme();
    const { logout, user, role, hasPermission } = useAuth();
    const navigation = useNavigation();
    const { closeDrawer } = useDrawer();
    const { isDesktop } = useResponsive();

    // Track active route manually to support Root-level rendering (MobileDrawer)
    const [activeRoute, setActiveRoute] = React.useState('Home');

    React.useEffect(() => {
        // Initial route check, safe for all environments
        const getRouteName = () => {
            if (navigation && typeof navigation.getCurrentRoute === 'function') {
                const route = navigation.getCurrentRoute();
                return route ? route.name : 'Home';
            }
            return 'Home';
        };

        setActiveRoute(getRouteName());

        // Listen for changes if navigation object is valid
        if (navigation) {
            const unsubscribe = navigation.addListener('state', () => {
                setActiveRoute(getRouteName());
            });

            return unsubscribe;
        }
    }, [navigation]);

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
        { label: 'Orders', icon: 'package-variant', route: 'DatabaseManager', params: { collection: 'orders' }, permission: 'access_orders' },
        { label: 'Analytics', icon: 'chart-bar', route: 'Stats', permission: 'access_analytics' },
        { label: 'Wallet', icon: 'wallet-outline', route: 'Wallet', permission: 'access_wallet' },
        { label: 'WhatsApp', icon: 'whatsapp', route: 'WhatsAppManager', permission: 'access_whatsapp' },
        { label: 'Campaigns', icon: 'bullhorn', route: 'Campaigns', permission: 'access_campaigns' },
        { label: 'Notes', icon: 'notebook', route: 'Notes' }, // Always visible
        { label: 'Settings', icon: 'cog', route: 'Settings' }, // Always visible
    ];

    const visibleMenuItems = menuItems.filter(item => !item.permission || hasPermission(item.permission));

    const handleNavigation = (item) => {
        if (!isDesktop) {
            // Mobile: Close drawer and navigate
            closeDrawer();
            // Small buffer to look smooth, though the global drawer persists
            setTimeout(() => {
                navigation.navigate(item.route, item.params);
            }, 150);
        } else {
            navigation.navigate(item.route, item.params);
        }
    };

    return (
        <View style={[
            styles.container,
            {
                backgroundColor: theme.colors.surface,
                borderRightColor: theme.colors.outlineVariant,
                borderRightWidth: isDesktop ? 1 : 0 // Border only on desktop
            }
        ]}>
            {/* Header / Logo */}
            <View style={styles.header}>
                <Image
                    source={theme.dark ? require('../../logo/easey-white.png') : require('../../logo/easey-dark.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </View>

            {/* Navigation Items */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <Drawer.Section showDivider={false}>
                    {visibleMenuItems.map((item, index) => {
                        const isActive = activeRoute === item.route;
                        return (
                            <Drawer.Item
                                key={index}
                                icon={item.icon}
                                label={item.label}
                                active={isActive}
                                onPress={() => handleNavigation(item)}
                                style={{ borderRadius: 8, marginBottom: 4 }}
                                theme={theme}
                            />
                        );
                    })}
                </Drawer.Section>
            </ScrollView>

            {/* User / Footer */}
            <View style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
                <Pressable onPress={logout} style={styles.userCard}>
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
                </Pressable>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 280,
        height: '100%',
        borderRightWidth: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        padding: LAYOUT.spacing.l,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    logo: {
        width: 120,
        height: 40,
    },
    content: {
        flex: 1,
        paddingHorizontal: LAYOUT.spacing.m,
    },
    footer: {
        padding: LAYOUT.spacing.m,
        borderTopWidth: 1,
    },
    userCard: {
        padding: LAYOUT.spacing.s,
        borderRadius: 8,
    }
});

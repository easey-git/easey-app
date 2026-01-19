import React from 'react';
import { View, StyleSheet, Image, ScrollView, Pressable } from 'react-native';
import { Text, useTheme, Drawer, Avatar } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { LAYOUT } from '../theme/layout';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../context/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';

export const Sidebar = React.memo(({ onClose }) => {
    const theme = useTheme();
    const { logout, user, role, hasPermission } = useAuth();
    const navigation = useNavigation();
    const { closeDrawer } = useDrawer();
    const { isDesktop } = useResponsive();

    // Track active route - use try-catch to handle both navigation contexts
    const [activeRoute, setActiveRoute] = React.useState('Home');

    React.useEffect(() => {
        const updateRoute = () => {
            try {
                // Try to get navigation state
                const state = navigation.getState();
                if (state && state.routes && state.routes[state.index]) {
                    setActiveRoute(state.routes[state.index].name);
                }
            } catch (error) {
                // Fallback for when navigation context is not available
            }
        };

        updateRoute();

        // Listen for navigation state changes
        const unsubscribe = navigation.addListener('state', updateRoute);

        return unsubscribe;
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
        { label: 'Logistics', icon: 'truck-delivery', route: 'Logistics', permission: 'access_logistics' },
        { label: 'Analytics', icon: 'chart-bar', route: 'Stats', permission: 'access_analytics' },
        { label: 'Wallet', icon: 'wallet-outline', route: 'Wallet', permission: 'access_wallet' },
        { label: 'WhatsApp', icon: 'whatsapp', route: 'WhatsAppManager', permission: 'access_whatsapp' },
        { label: 'Meta', icon: 'infinity', route: 'Meta', permission: 'access_campaigns' },
        { label: 'Notes', icon: 'notebook', route: 'Notes' }, // Always visible
        { label: 'Settings', icon: 'cog', route: 'Settings' }, // Always visible
    ];

    const visibleMenuItems = menuItems.filter(item => !item.permission || hasPermission(item.permission));

    const handleNavigation = (item) => {
        if (!isDesktop) {
            // Mobile: Navigate immediately, then close drawer
            // This prevents the lag from waiting for drawer animation
            navigation.navigate(item.route, item.params);

            // Defer drawer close to next frame to avoid blocking navigation
            requestAnimationFrame(() => {
                closeDrawer();
            });
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
});

const styles = StyleSheet.create({
    container: {
        width: LAYOUT.drawerWidth,
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

import React from 'react';
import { View, StyleSheet, Image, ScrollView, Pressable, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Text, useTheme, Drawer, Avatar, IconButton } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { LAYOUT } from '../theme/layout';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../context/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';

const MENU_ITEMS = [
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

export const Sidebar = React.memo(({ floating = false }) => {
    const theme = useTheme();
    const { logout, user, role, hasPermission } = useAuth();
    const navigation = useNavigation();
    const { closeDrawer, isSidebarExpanded, setSidebarExpanded, isSidebarPinned, toggleSidebarPinned } = useDrawer();
    const { isDesktop } = useResponsive();
    const COLLAPSED_WIDTH = LAYOUT.drawerCollapsedWidth || 76;
    const EXPANDED_WIDTH = LAYOUT.drawerWidth;
    const widthValue = useSharedValue(
        isDesktop
            ? ((isSidebarPinned || isSidebarExpanded) ? EXPANDED_WIDTH : COLLAPSED_WIDTH)
            : EXPANDED_WIDTH
    );
    const [tooltip, setTooltip] = React.useState({ visible: false, label: '', y: 0 });
    const hoverStateRef = React.useRef({ overRail: false, overPanel: false });

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
        return () => {
            unsubscribe();
        };
    }, [navigation]);

    const displayName = React.useMemo(() => {
        if (user?.displayName) return user.displayName;
        if (user?.email) return user.email.split('@')[0];
        return 'User';
    }, [user?.displayName, user?.email]);

    const displayRole = React.useMemo(() => {
        return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
    }, [role]);

    React.useEffect(() => {
        if (!isDesktop) setSidebarExpanded(true);
    }, [isDesktop, isSidebarPinned, setSidebarExpanded]);

    React.useEffect(() => {
        if (isSidebarPinned) setSidebarExpanded(true);
    }, [isSidebarPinned, setSidebarExpanded]);

    const expanded = isDesktop ? (isSidebarPinned || isSidebarExpanded) : true;
    React.useEffect(() => {
        widthValue.value = withTiming(
            expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
            {
                duration: 260,
                easing: Easing.bezier(0.2, 0, 0, 1),
            }
        );
    }, [expanded, widthValue, EXPANDED_WIDTH, COLLAPSED_WIDTH]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            width: isDesktop ? widthValue.value : EXPANDED_WIDTH,
        };
    }, [isDesktop, EXPANDED_WIDTH]);

    const updateHover = () => {
        if (isSidebarPinned) return;
        if (hoverStateRef.current.overRail || hoverStateRef.current.overPanel) {
            setSidebarExpanded(true);
        } else {
            setSidebarExpanded(false);
        }
    };

    const handleTogglePinned = () => {
        if (!isSidebarPinned) setSidebarExpanded(true);
        toggleSidebarPinned();
    };

    const visibleMenuItems = React.useMemo(() => {
        return MENU_ITEMS.filter(item => !item.permission || hasPermission(item.permission));
    }, [hasPermission]);

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
        <View
            style={[
                styles.hoverWrapper,
                floating && styles.hoverWrapperFloating,
                isDesktop && { width: EXPANDED_WIDTH }
            ]}
            pointerEvents="box-none"
        >
            {isDesktop && (
                <View
                    onMouseEnter={() => {
                        hoverStateRef.current.overRail = true;
                        updateHover();
                    }}
                    onMouseLeave={() => {
                        hoverStateRef.current.overRail = false;
                        updateHover();
                    }}
                    style={[
                        styles.railHitbox,
                        { width: COLLAPSED_WIDTH }
                    ]}
                    pointerEvents="auto"
                />
            )}
            <Animated.View
                onMouseEnter={() => {
                    if (!isDesktop) return;
                    hoverStateRef.current.overPanel = true;
                    updateHover();
                }}
                onMouseLeave={() => {
                    if (!isDesktop) return;
                    hoverStateRef.current.overPanel = false;
                    updateHover();
                }}
                style={[
                    styles.container,
                    animatedStyle,
                    {
                        backgroundColor: theme.colors.surface,
                        borderRightColor: theme.colors.outlineVariant,
                        borderRightWidth: isDesktop ? 1 : 0, // Border only on desktop
                        ...(
                            expanded
                                ? Platform.select({
                                    web: { boxShadow: '6px 0px 18px rgba(0, 0, 0, 0.25)' },
                                    default: {
                                        shadowColor: '#000',
                                        shadowOffset: { width: 6, height: 0 },
                                        shadowOpacity: 0.2,
                                        shadowRadius: 12,
                                        elevation: 18,
                                    }
                                })
                                : {}
                        ),
                    }
                ]}
                pointerEvents="auto"
            >
            {/* Header / Logo */}
            <View style={[styles.header, !expanded && styles.headerCollapsed]}>
                <Image
                    source={theme.dark ? require('../../logo/easey-white.png') : require('../../logo/easey-dark.png')}
                    style={expanded ? styles.logo : styles.logoCollapsed}
                    resizeMode="contain"
                />
                {expanded && isDesktop && (
                    <IconButton
                        icon={isSidebarPinned ? 'pin' : 'pin-outline'}
                        size={18}
                        onPress={handleTogglePinned}
                        style={styles.pinButton}
                    />
                )}
            </View>

            {/* Navigation Items */}
            <ScrollView style={[styles.content, !expanded && styles.contentCollapsed]} showsVerticalScrollIndicator={false}>
                <Drawer.Section showDivider={false}>
                    {visibleMenuItems.map((item, index) => {
                        const isActive = activeRoute === item.route;
                        if (!expanded) {
                            const activeColor = theme.colors.primary;
                            const inactiveColor = theme.colors.onSurfaceVariant;
                            const activeBg = theme.colors.secondaryContainer || theme.colors.primaryContainer;
                            return (
                                <Pressable
                                    key={index}
                                    onPress={() => handleNavigation(item)}
                                    onHoverIn={(e) => {
                                        if (!isDesktop) return;
                                        const y = e?.nativeEvent?.pageY ?? 0;
                                        setTooltip({ visible: true, label: item.label, y });
                                    }}
                                    onHoverOut={() => setTooltip({ visible: false, label: '', y: 0 })}
                                    accessibilityLabel={item.label}
                                    style={[
                                        styles.iconOnlyItem,
                                        isActive && { backgroundColor: activeBg }
                                    ]}
                                >
                                    <IconButton
                                        icon={item.icon}
                                        size={22}
                                        iconColor={isActive ? activeColor : inactiveColor}
                                        style={styles.iconOnlyButton}
                                    />
                                </Pressable>
                            );
                        }
                        return (
                            <Drawer.Item
                                key={index}
                                icon={item.icon}
                                label={expanded ? item.label : ''}
                                active={isActive}
                                onPress={() => handleNavigation(item)}
                                accessibilityLabel={item.label}
                                style={[
                                    styles.drawerItem,
                                    !expanded && styles.drawerItemCollapsed,
                                ]}
                                theme={theme}
                            />
                        );
                    })}
                </Drawer.Section>
            </ScrollView>

            {/* User / Footer */}
            <View style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
                <Pressable onPress={logout} style={[styles.userCard, !expanded && styles.userCardCollapsed]}>
                    <View style={[styles.userRow, !expanded && styles.userRowCollapsed]}>
                        <Avatar.Text
                            size={32}
                            label={displayName.substring(0, 2).toUpperCase()}
                            style={{ backgroundColor: theme.colors.primaryContainer }}
                            color={theme.colors.onPrimaryContainer}
                        />
                        {expanded && (
                            <View style={{ marginLeft: 12 }}>
                                <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>{displayRole}</Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Logout</Text>
                            </View>
                        )}
                    </View>
                </Pressable>
            </View>
            {isDesktop && !expanded && tooltip.visible && (
                <View
                    pointerEvents="none"
                    style={[
                        styles.tooltip,
                        {
                            top: tooltip.y - 14,
                            left: COLLAPSED_WIDTH + 10,
                            backgroundColor: theme.colors.elevation?.level2 || theme.colors.surfaceVariant,
                            borderColor: theme.colors.outlineVariant,
                        }
                    ]}
                >
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurface }}>
                        {tooltip.label}
                    </Text>
                </View>
            )}
            </Animated.View>
        </View>
    );
});

const styles = StyleSheet.create({
    hoverWrapper: {
        height: '100%',
        overflow: 'visible',
    },
    railHitbox: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 25,
        backgroundColor: 'transparent',
    },
    hoverWrapperFloating: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 20,
    },
    container: {
        height: '100%',
        borderRightWidth: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        padding: LAYOUT.spacing.l,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerCollapsed: {
        alignItems: 'center',
        paddingHorizontal: LAYOUT.spacing.xs,
    },
    pinButton: {
        position: 'absolute',
        right: 8,
        top: 8,
    },
    logo: {
        width: 120,
        height: 40,
    },
    logoCollapsed: {
        width: 28,
        height: 28,
    },
    content: {
        flex: 1,
        paddingHorizontal: LAYOUT.spacing.m,
    },
    contentCollapsed: {
        paddingHorizontal: LAYOUT.spacing.xs,
    },
    footer: {
        padding: LAYOUT.spacing.m,
        borderTopWidth: 1,
    },
    userCard: {
        padding: LAYOUT.spacing.s,
        borderRadius: 8,
    },
    userCardCollapsed: {
        alignItems: 'center',
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    userRowCollapsed: {
        justifyContent: 'center',
    },
    drawerItem: {
        borderRadius: 8,
        marginBottom: 4,
    },
    drawerItemCollapsed: {
        paddingHorizontal: 0,
        justifyContent: 'center',
    },
    iconOnlyItem: {
        borderRadius: 8,
        marginBottom: 4,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconOnlyButton: {
        margin: 0,
    },
    tooltip: {
        position: 'absolute',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        zIndex: 30,
    },
});

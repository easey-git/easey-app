import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTheme, Appbar, Portal } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sidebar } from './Sidebar';
import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import { useRoute } from '@react-navigation/native';

export const CRMLayout = ({ children, title = "Dashboard", navigation, showHeader = true, scrollable = true, actions }) => {
    const theme = useTheme();
    const { isDesktop } = useResponsive();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Safely get route name, defaulting to empty if context missing (though unlikely in Screens)
    let routeName = 'Home';
    try {
        const route = useRoute();
        routeName = route.name;
    } catch (e) {
        // Ignore error if used outside navigation context usually
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
            {/* Desktop Sidebar - Always visible on Desktop */}
            {isDesktop && <Sidebar activeRoute={routeName} navigation={navigation} />}

            {/* Mobile/Tablet Sidebar - Full-height Drawer */}
            {!isDesktop && isMobileMenuOpen && (
                <Portal>
                    <View style={styles.backdrop} >
                        <Pressable style={styles.backdropPressable} onPress={() => setIsMobileMenuOpen(false)} />
                        <View style={[styles.mobileSidebar, { backgroundColor: theme.colors.surface }]}>
                            <SafeAreaView edges={['top', 'bottom', 'left']} style={{ flex: 1 }}>
                                <Sidebar onClose={() => setIsMobileMenuOpen(false)} activeRoute={routeName} navigation={navigation} />
                            </SafeAreaView>
                        </View>
                    </View>
                </Portal>
            )}

            {/* Main Content Area */}
            <View style={styles.main}>
                {/* Header */}
                {showHeader && (
                    <Appbar.Header
                        statusBarHeight={0} // Let SafeAreaView handle the top padding to avoid duplicates
                        style={{ backgroundColor: theme.colors.background, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, height: 64 }}
                        mode="center-aligned"
                    >
                        {!isDesktop && (
                            <Appbar.Action icon="menu" onPress={() => setIsMobileMenuOpen(true)} />
                        )}
                        <Appbar.Content title={title} titleStyle={{ fontWeight: 'bold' }} />
                        {actions ? actions : (
                            <>
                                <Appbar.Action icon="bell-outline" onPress={() => { }} />
                                <Appbar.Action icon="magnify" onPress={() => { }} />
                            </>
                        )}
                    </Appbar.Header>
                )}

                {/* Content */}
                <View style={{ flex: 1 }}>
                    {scrollable ? (
                        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
                            <ResponsiveContainer>
                                {children}
                            </ResponsiveContainer>
                        </ScrollView>
                    ) : (
                        <View style={styles.fixedContent}>
                            <ResponsiveContainer style={{ height: '100%' }}>
                                {children}
                            </ResponsiveContainer>
                        </View>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
    },
    main: {
        flex: 1,
        flexDirection: 'column',
    },
    fixedContent: {
        flex: 1,
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
    },
    backdropPressable: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    mobileSidebar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 280,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
    }
});


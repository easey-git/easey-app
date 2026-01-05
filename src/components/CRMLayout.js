import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme, Appbar, Portal, Modal } from 'react-native-paper';
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
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Desktop Sidebar - Always visible on Desktop */}
            {isDesktop && <Sidebar activeRoute={routeName} />}

            {/* Mobile/Tablet Sidebar - Drawer via Portal */}
            {!isDesktop && (
                <Portal>
                    <Modal
                        visible={isMobileMenuOpen}
                        onDismiss={() => setIsMobileMenuOpen(false)}
                        contentContainerStyle={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 280, // Standard drawer width
                            backgroundColor: theme.colors.surface,
                            padding: 0,
                            margin: 0
                        }}
                        style={{ justifyContent: 'flex-start' }}
                    >
                        <Sidebar onClose={() => setIsMobileMenuOpen(false)} activeRoute={routeName} />
                    </Modal>
                </Portal>
            )}

            {/* Main Content Area */}
            <View style={styles.main}>
                {/* Header */}
                {showHeader && (
                    <Appbar.Header style={{ backgroundColor: theme.colors.background, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, height: 64 }} mode="center-aligned">
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
                {scrollable ? (
                    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
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
        paddingVertical: 24,
    }
});


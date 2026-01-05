import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sidebar } from './Sidebar';
import { useResponsive } from '../hooks/useResponsive';
import { ResponsiveContainer } from './ResponsiveContainer';
import { useDrawer } from '../context/DrawerContext';

export const CRMLayout = ({ children, title = "Dashboard", navigation, showHeader = true, scrollable = true, fullWidth = false, actions, floatingButton }) => {
    const theme = useTheme();
    const { isDesktop } = useResponsive();
    const { openDrawer } = useDrawer();

    const containerProps = fullWidth ? {
        maxWidth: '100%',
        style: { paddingHorizontal: 0, height: '100%' }
    } : {
        style: { height: '100%' }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
            {/* Desktop Sidebar - Always visible on Desktop */}
            {isDesktop && <Sidebar />}

            {/* Mobile Sidebar is handled globally in App.js via Context/Portal */}

            {/* Main Content Area */}
            <View style={styles.main}>
                {/* Header */}
                {showHeader && (
                    <Appbar.Header
                        statusBarHeight={0}
                        style={{ backgroundColor: theme.colors.background, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, height: 64 }}
                        mode="center-aligned"
                    >
                        {!isDesktop && (
                            <Appbar.Action icon="menu" onPress={openDrawer} />
                        )}
                        <Appbar.Content title={title} titleStyle={{ fontWeight: 'bold' }} />
                        {actions}
                    </Appbar.Header>
                )}

                {/* Content */}
                <View style={{ flex: 1 }}>
                    {scrollable ? (
                        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
                            <ResponsiveContainer {...containerProps} style={fullWidth ? { paddingHorizontal: 0 } : undefined}>
                                {children}
                            </ResponsiveContainer>
                        </ScrollView>
                    ) : (
                        <View style={styles.fixedContent}>
                            <ResponsiveContainer {...containerProps}>
                                {children}
                            </ResponsiveContainer>
                        </View>
                    )}
                </View>

                {/* Floating Elements Layer */}
                {/* Floating Elements Layer */}
                {floatingButton && (
                    <View style={styles.floatingContainer} pointerEvents="box-none">
                        {floatingButton}
                    </View>
                )}
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
    floatingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
    }
});


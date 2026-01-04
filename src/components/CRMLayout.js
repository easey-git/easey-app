import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions, ScrollView } from 'react-native';
import { useTheme, Appbar, IconButton, Text } from 'react-native-paper';
import { Sidebar } from './Sidebar';

export const CRMLayout = ({ children, title = "Dashboard", navigation, showHeader = true, scrollable = true, actions }) => {
    const theme = useTheme();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 1024; // Standard Desktop Breakpoint
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Desktop Sidebar - Always visible */}
            {isDesktop && <Sidebar />}

            {/* Main Content Area */}
            <View style={styles.main}>
                {/* Header (Mobile & Desktop) */}
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
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {children}
                    </ScrollView>
                ) : (
                    <View style={styles.fixedContent}>
                        {children}
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
    scrollContent: {
        padding: 24,
        paddingBottom: 48,
        maxWidth: 1600, // Prevent content from getting too wide on ultra-wide monitors
        width: '100%',
        alignSelf: 'center'
    },
    fixedContent: {
        flex: 1,
        padding: 24,
    }
});

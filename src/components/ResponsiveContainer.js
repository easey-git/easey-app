import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

export const ResponsiveContainer = ({ children, style }) => {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768;

    return (
        <View style={[
            styles.container,
            isDesktop && styles.desktopContainer,
            style
        ]}>
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
    },
    desktopContainer: {
        maxWidth: 1200,
        alignSelf: 'center',
        paddingHorizontal: 24, // Add some breathing room on desktop
    },
});

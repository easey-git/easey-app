import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

export const ResponsiveContainer = ({ children, style, maxWidth }) => {
    const { containerStyle } = useResponsive();

    return (
        <View style={[
            styles.container,
            containerStyle,
            maxWidth && { maxWidth }, // specific override
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
    }
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';

const LogisticsScreen = ({ navigation }) => {
    const theme = useTheme();

    return (
        <CRMLayout title="Logistics" navigation={navigation}>
            <View style={styles.container}>
                <Text variant="headlineMedium" style={{ color: theme.colors.onSurface }}>
                    Logistics Management
                </Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                    Coming Soon
                </Text>
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
});

export default LogisticsScreen;

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CRMLayout } from '../components/CRMLayout';
import { DelhiveryView } from '../components/logistics/DelhiveryView';

const LogisticsScreen = ({ navigation }) => {
    return (
        <CRMLayout title="Logistics Hub" navigation={navigation}>
            <View style={styles.container}>
                <DelhiveryView />
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    }
});

export default LogisticsScreen;

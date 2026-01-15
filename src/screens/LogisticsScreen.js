import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { LogisticsServiceSelector } from '../components/logistics/LogisticsServiceSelector';
import { DelhiveryView } from '../components/logistics/DelhiveryView';
import { XpressbeesView } from '../components/logistics/XpressbeesView';

const LogisticsScreen = ({ navigation }) => {
    const theme = useTheme();
    const [activeService, setActiveService] = useState('delhivery');

    // Service Registry - Add new services here
    const renderContent = () => {
        switch (activeService) {
            case 'delhivery':
                return <DelhiveryView />;
            case 'xpressbees':
                return <XpressbeesView />;
            default:
                return null;
        }
    };

    return (
        <CRMLayout title="Logistics Hub" navigation={navigation}>
            <View style={styles.container}>
                {/* Scalable Service Selector */}
                <LogisticsServiceSelector
                    selectedService={activeService}
                    onSelectService={setActiveService}
                />

                {/* Dynamic Content Area */}
                <View style={styles.contentArea}>
                    {renderContent()}
                </View>
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    },
    contentArea: {
        flex: 1,
        marginTop: 8,
    }
});

export default LogisticsScreen;

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Text, useTheme, Surface, Icon } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { DelhiveryView } from '../components/logistics/DelhiveryView';
import { NDRView } from '../components/logistics/NDRView';

// Placeholder components for future features
const WalletView = () => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="titleMedium" style={{ color: '#666' }}>Logistics Wallet Coming Soon</Text>
    </View>
);

// 1. Service/Feature Registry
// Currently all features belong to Delhivery. 
// In the future, we can wrap this in a "Provider" selector.
const SERVICES = [
    {
        id: 'shipments',
        label: 'Shipments',
        component: DelhiveryView,
        icon: 'package-variant-closed', // Box icon
        color: '#D32F2F', // Delhivery Red
    },
    {
        id: 'ndr',
        label: 'NDR',
        component: NDRView,
        icon: 'alert-circle-outline',
        color: '#F57C00', // Orange for Attention
    },
    {
        id: 'wallet',
        label: 'Wallet',
        component: WalletView,
        icon: 'wallet-outline',
        color: '#388E3C', // Green for Money
    },
];

const LogisticsScreen = ({ navigation }) => {
    const theme = useTheme();
    const [activeServiceId, setActiveServiceId] = useState('shipments');

    // 2. Dynamic Component Resolution
    const ActiveComponent = SERVICES.find(s => s.id === activeServiceId)?.component || DelhiveryView;

    return (
        <CRMLayout title="Logistics Hub" navigation={navigation}>
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

                {/* Brand Header */}
                <View style={styles.brandHeader}>
                    <View style={styles.brandRow}>
                        {/* Simulated Logo */}
                        <View style={[styles.logoPlaceholder, { backgroundColor: '#D32F2F' }]}>
                            <Icon source="truck-delivery" color="#FFF" size={24} />
                        </View>
                        <View>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>Delhivery</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>Standard Integration • Active</Text>
                        </View>
                    </View>
                </View>

                {/* Feature Selector (Shipments, NDR, Wallet) */}
                <View style={styles.selectorContainer}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.selectorContent}
                    >
                        {SERVICES.map((service) => {
                            const isActive = activeServiceId === service.id;
                            const activeColor = service.color || theme.colors.primary;

                            return (
                                <TouchableOpacity
                                    key={service.id}
                                    onPress={() => setActiveServiceId(service.id)}
                                    activeOpacity={0.7}
                                    style={[
                                        styles.pill,
                                        isActive
                                            ? { backgroundColor: activeColor, borderColor: activeColor }
                                            : { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }
                                    ]}
                                >
                                    <Icon
                                        source={service.icon}
                                        size={18}
                                        color={isActive ? '#FFF' : theme.colors.onSurfaceVariant}
                                    />
                                    <Text
                                        variant="labelLarge"
                                        style={{
                                            color: isActive ? '#FFF' : theme.colors.onSurfaceVariant,
                                            fontWeight: isActive ? '600' : '500',
                                            marginLeft: 8,
                                        }}
                                    >
                                        {service.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Content Area */}
                <View style={styles.contentArea}>
                    <ActiveComponent />
                </View>
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    brandHeader: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    logoPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    selectorContainer: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)', // Very subtle divider
    },
    selectorContent: {
        paddingHorizontal: 16,
        gap: 12,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20, // Full rounded pills
        borderWidth: 1,
        // Elevation for better touch target feel
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
        elevation: 1,
    },
    contentArea: {
        flex: 1,
    }
});

export default LogisticsScreen;

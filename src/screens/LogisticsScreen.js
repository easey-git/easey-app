import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Text, useTheme, Surface, Icon, IconButton } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { DelhiveryView } from '../components/logistics/DelhiveryView';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';
import { NDRView } from '../components/logistics/NDRView';
import { DelhiveryWalletView } from '../components/logistics/DelhiveryWalletView';
import { DelhiveryRemittanceView } from '../components/logistics/DelhiveryRemittanceView';

// 1. Logistics Provider Registry
// This is the single source of truth for all supported carriers.
// To add a new carrier (e.g., BlueDart, Shiprocket), simply add an entry here.
const PROVIDERS = [
    {
        id: 'delhivery',
        name: 'Delhivery',
        icon: 'truck-delivery',
        color: '#D32F2F', // Delhivery Red
        type: 'Integrated',
        status: 'Active',
        features: [
            {
                id: 'shipments',
                label: 'Shipments',
                component: DelhiveryView,
                icon: 'package-variant-closed',
                primaryColor: '#D32F2F',
            },
            {
                id: 'ndr',
                label: 'NDR',
                component: NDRView,
                icon: 'alert-circle-outline',
                primaryColor: '#F57C00', // Orange for Attention
            },
            {
                id: 'wallet',
                label: 'Wallet',
                component: DelhiveryWalletView,
                icon: 'wallet-outline',
                primaryColor: '#2E7D32', // Green for Finance
            },
            {
                id: 'remittances',
                label: 'Remittances',
                component: DelhiveryRemittanceView,
                icon: 'bank-transfer',
                primaryColor: '#7B1EA2', // Purple for Transfers
            },
        ]
    },
    {
        id: 'shiprocket',
        name: 'Shiprocket',
        icon: 'rocket-launch',
        color: '#7B1EA2',
        type: 'Aggregator',
        status: 'Coming Soon', // Disabled state
        features: []
    }
];

const LogisticsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission } = useAuth();

    // State for selected Provider and its active Feature
    const [activeProviderId, setActiveProviderId] = useState('delhivery');
    const [activeFeatureId, setActiveFeatureId] = useState('shipments');

    const activeProvider = PROVIDERS.find(p => p.id === activeProviderId) || PROVIDERS[0];

    // Resolve active feature or fallback to first available
    const activeFeature = activeProvider.features.find(f => f.id === activeFeatureId)
        || activeProvider.features[0];

    // Reset feature when provider changes
    useEffect(() => {
        if (activeProvider && activeProvider.features.length > 0) {
            setActiveFeatureId(activeProvider.features[0].id);
        }
    }, [activeProviderId]);

    if (!hasPermission('access_logistics')) {
        return <AccessDenied title="Logistics Restricted" message="You need permission to access logistics operations." />;
    }

    const ActiveComponent = activeFeature ? activeFeature.component : null;

    return (
        <CRMLayout title="Logistics Hub" navigation={navigation}>
            <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

                {/* 2. Provider Selector (Top Bar) */}
                {/* Allows switching between different carriers/accounts */}
                <View style={[styles.providerBar, { borderBottomColor: theme.colors.outlineVariant }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerScroll}>
                        {PROVIDERS.map((provider) => {
                            const isActive = activeProviderId === provider.id;
                            const isDisabled = provider.status === 'Coming Soon';

                            return (
                                <TouchableOpacity
                                    key={provider.id}
                                    onPress={() => !isDisabled && setActiveProviderId(provider.id)}
                                    style={[
                                        styles.providerTab,
                                        isActive && { backgroundColor: theme.colors.secondaryContainer },
                                        isDisabled && { opacity: 0.6 }
                                    ]}
                                    disabled={isDisabled}
                                >
                                    <View style={[styles.logoSmall, { backgroundColor: provider.color }]}>
                                        <Icon source={provider.icon} color="#FFF" size={16} />
                                    </View>
                                    <Text
                                        variant="labelMedium"
                                        style={{
                                            fontWeight: isActive ? '700' : '500',
                                            color: isActive ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant
                                        }}
                                    >
                                        {provider.name}
                                    </Text>
                                    {isDisabled && (
                                        <View style={[styles.badge, { backgroundColor: theme.colors.surfaceVariant }]}>
                                            <Text style={{ fontSize: 8, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>SOON</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* 3. Dynamic Band Header */}
                {/* Changes appearance based on the selected provider */}
                <View style={styles.brandHeader}>
                    <View style={styles.brandRow}>
                        <View style={[styles.logoLarge, { backgroundColor: activeProvider.color }]}>
                            <Icon source={activeProvider.icon} color="#FFF" size={32} />
                        </View>
                        <View>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>{activeProvider.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
                                <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                                    {activeProvider.type} • {activeProvider.status}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* 4. Feature Pills Selector */}
                {/* Dynamically renders features available for the active provider */}
                {activeProvider.features.length > 0 ? (
                    <>
                        <View style={styles.selectorContainer}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.selectorContent}
                            >
                                {activeProvider.features.map((feature) => {
                                    const isActive = activeFeatureId === feature.id;
                                    const activeColor = feature.primaryColor || theme.colors.primary;

                                    return (
                                        <TouchableOpacity
                                            key={feature.id}
                                            onPress={() => setActiveFeatureId(feature.id)}
                                            activeOpacity={0.7}
                                            style={[
                                                styles.pill,
                                                isActive
                                                    ? { backgroundColor: activeColor, borderColor: activeColor }
                                                    : { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }
                                            ]}
                                        >
                                            <Icon
                                                source={feature.icon}
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
                                                {feature.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>

                        {/* 5. Active Content View */}
                        <View style={styles.contentArea}>
                            {ActiveComponent && <ActiveComponent />}
                        </View>
                    </>
                ) : (
                    // Empty State for providers with no features yet
                    <View style={styles.emptyState}>
                        <Icon source="hammer-wrench" size={48} color={theme.colors.outline} />
                        <Text variant="titleMedium" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>
                            Integration in progress
                        </Text>
                        <Text variant="bodyMedium" style={{ color: theme.colors.outline, textAlign: 'center', marginTop: 4 }}>
                            We are currently working on the {activeProvider.name} integration.
                        </Text>
                    </View>
                )}
            </View>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    providerBar: {
        borderBottomWidth: 1,
        paddingVertical: 8,
    },
    providerScroll: {
        paddingHorizontal: 16,
        gap: 12,
    },
    providerTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        gap: 8,
    },
    logoSmall: {
        width: 24,
        height: 24,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 4,
    },
    brandHeader: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 12,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    logoLarge: {
        width: 56,
        height: 56,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 3,
        ...Platform.select({
            web: { boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)' },
            default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }
        }),
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    selectorContainer: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
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
        borderRadius: 20,
        borderWidth: 1,
        ...Platform.select({
            web: { boxShadow: '0px 1px 1px rgba(0, 0, 0, 0.05)' },
            default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1 }
        }),
        elevation: 1,
    },
    contentArea: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        opacity: 0.7,
    }
});

export default LogisticsScreen;

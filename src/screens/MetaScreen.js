import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, useTheme, Surface, Appbar, Icon, ActivityIndicator, Chip, Button, SegmentedButtons, DataTable, FAB, Menu, IconButton, Portal, Dialog, TextInput, Switch } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

/**
 * MetaScreen - Comprehensive Meta (Facebook/Instagram) Advertising Hub
 * 
 * Fully wired with all backend APIs
 */

import { ActivityLogService } from '../services/activityLogService';

const BASE_URL = 'https://easey-app.vercel.app/api';

const MetaScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission, user } = useAuth();
    const { width } = useWindowDimensions();
    const isDesktop = width >= 768;

    if (!hasPermission('access_campaigns')) {
        return <AccessDenied title="Meta Restricted" message="You need permission to view Meta advertising information." />;
    }

    const [activeTab, setActiveTab] = useState('overview');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Data states
    const [accountData, setAccountData] = useState(null);
    const [campaignsData, setCampaignsData] = useState(null);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [datePreset, setDatePreset] = useState('today');

    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const timestamp = Date.now();

            // Fetch based on active tab
            switch (activeTab) {
                case 'overview':
                    // Pass local 'today' to ensure Overview matches local time
                    const offset = new Date().getTimezoneOffset() * 60000;
                    const localToday = new Date(Date.now() - offset).toISOString().split('T')[0];

                    const accountRes = await fetch(`${BASE_URL}/meta-account?today=${localToday}&_=${timestamp}`);
                    if (accountRes.ok) setAccountData(await accountRes.json());
                    break;

                case 'campaigns':
                    const campaignsRes = await fetch(`${BASE_URL}/campaign-management?_=${timestamp}`);
                    if (campaignsRes.ok) setCampaignsData(await campaignsRes.json());
                    break;

                case 'analytics':
                    // Industry Standard: Use Meta's native date_preset
                    // This delegates Timezone calculation entirely to Meta servers
                    const analyticsRes = await fetch(`${BASE_URL}/analytics?level=campaign&date_preset=${datePreset}&_=${timestamp}`);
                    if (analyticsRes.ok) setAnalyticsData(await analyticsRes.json());
                    break;


            }
        } catch (error) {
            console.error('[MetaScreen] Error:', error.message);
            setError(error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab, accountData, datePreset]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [activeTab, datePreset]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const getAlertColor = (level) => {
        switch (level) {
            case 'critical': return theme.colors.error;
            case 'warning': return '#fbbf24';
            default: return theme.colors.primary;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return '#4ade80';
            case 'DISABLED': return theme.colors.error;
            case 'PENDING_RISK_REVIEW': return '#fbbf24';
            default: return theme.colors.outline;
        }
    };

    const getCampaignStatusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return '#4ade80';
            case 'PAUSED': return theme.colors.outline;
            case 'LEARNING': return '#fbbf24';
            case 'REJECTED': return theme.colors.error;
            default: return theme.colors.outline;
        }
    };

    if (loading && !refreshing) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    const StatusBadge = ({ status, color }) => (
        <View style={[styles.badge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
            <Text style={[styles.badgeText, { color: color }]}>
                {status}
            </Text>
        </View>
    );

    return (
        <CRMLayout
            title="Meta"
            navigation={navigation}
            scrollable={false}
            actions={<Appbar.Action icon="refresh" onPress={onRefresh} />}
        >
            <View style={styles.container}>
                {/* Tab Navigation */}
                <View style={[styles.tabBar, { backgroundColor: 'transparent' }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
                        <SegmentedButtons
                            value={activeTab}
                            onValueChange={setActiveTab}
                            buttons={[
                                {
                                    value: 'overview',
                                    label: 'Overview',
                                    icon: width < 380 ? undefined : 'view-dashboard',
                                    labelStyle: { fontSize: width < 380 ? 10 : 12, marginHorizontal: 0 }
                                },
                                {
                                    value: 'campaigns',
                                    label: 'Campaigns',
                                    icon: width < 380 ? undefined : 'bullhorn',
                                    labelStyle: { fontSize: width < 380 ? 10 : 12, marginHorizontal: 0 }
                                },
                                {
                                    value: 'analytics',
                                    label: 'Analytics',
                                    icon: width < 380 ? undefined : 'chart-line',
                                    labelStyle: { fontSize: width < 380 ? 10 : 12, marginHorizontal: 0 }
                                },

                            ]}
                            style={styles.segmentedButtons}
                        />
                    </ScrollView>
                </View>

                {/* Tab Content */}
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
                >
                    {activeTab === 'overview' && (
                        <OverviewTab
                            accountData={accountData}
                            error={error}
                            theme={theme}
                            getAlertColor={getAlertColor}
                            getStatusColor={getStatusColor}
                            fetchData={fetchData}
                        />
                    )}

                    {activeTab === 'campaigns' && (
                        <CampaignsTab
                            campaignsData={campaignsData}
                            error={error}
                            theme={theme}
                            getCampaignStatusColor={getCampaignStatusColor}
                            fetchData={fetchData}
                        />
                    )}

                    {activeTab === 'analytics' && (
                        <AnalyticsTab
                            analyticsData={analyticsData}
                            error={error}
                            theme={theme}
                            fetchData={fetchData}
                            datePreset={datePreset}
                            setDatePreset={setDatePreset}
                        />
                    )}


                </ScrollView>
            </View>
        </CRMLayout>
    );
};

// ============================================================================
// Overview Tab
// ============================================================================
const OverviewTab = ({ accountData, error, theme, getAlertColor, getStatusColor, fetchData }) => {
    if (error) {
        return (
            <Surface style={[styles.errorCard, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Icon source="alert-circle" size={20} color={theme.colors.error} />
                    <Text variant="labelLarge" style={{ marginLeft: 8, color: theme.colors.error, fontWeight: 'bold' }}>Error</Text>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginBottom: 12 }}>{error}</Text>
                <Button mode="contained" onPress={fetchData} compact>Retry</Button>
            </Surface>
        );
    }

    if (!accountData) return null;

    return (
        <>
            {/* Account Status */}
            <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Account</Text>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{accountData.account?.name || 'Meta Ad Account'}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>ID: {accountData.account?.id}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getStatusColor(accountData.account?.status), marginRight: 6 }} />
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{accountData.account?.status}</Text>
                        </View>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{accountData.account?.timezone}</Text>
                    </View>
                </View>
            </Surface>

            {/* Alerts */}
            {accountData.alerts && accountData.alerts.length > 0 && (
                <View style={{ gap: 16, marginBottom: 24 }}>
                    {accountData.alerts.map((alert, index) => (
                        <Surface key={index} style={[styles.alertCard, { borderLeftColor: getAlertColor(alert.level), backgroundColor: theme.colors.elevation.level1 }]} elevation={2}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <Icon
                                    source={alert.level === 'critical' ? 'alert-circle' : 'alert'}
                                    size={24}
                                    color={getAlertColor(alert.level)}
                                />
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text variant="titleSmall" style={{ color: getAlertColor(alert.level), fontWeight: 'bold', marginBottom: 4 }}>
                                        {alert.type.replace(/_/g, ' ')}
                                    </Text>
                                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                                        {alert.message}
                                    </Text>
                                </View>
                            </View>
                        </Surface>
                    ))}
                </View>
            )}

            {/* Account Limits */}
            {accountData.limits?.spendCap && (
                <>
                    <View style={{ marginBottom: 16 }}>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 12 }}>
                            Account Limits
                        </Text>

                        <Surface style={[styles.limitCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Account Spend Limit</Text>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                    ₹{accountData.limits.spendCap.toLocaleString('en-IN')}
                                </Text>
                            </View>
                            {accountData.limits.remainingSpendCap !== null && (
                                <>
                                    <View style={styles.progressBar}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                {
                                                    width: `${Math.max(0, Math.min(100, ((accountData.limits.spendCap - accountData.limits.remainingSpendCap) / accountData.limits.spendCap) * 100))}%`,
                                                    backgroundColor: accountData.limits.remainingSpendCap < accountData.limits.spendCap * 0.1 ? theme.colors.error : theme.colors.primary
                                                }
                                            ]}
                                        />
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                            Used: {((accountData.limits.spendCap - accountData.limits.remainingSpendCap) / accountData.limits.spendCap * 100).toFixed(0)}%
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold', flex: 1, textAlign: 'right' }} numberOfLines={1} adjustsFontSizeToFit>
                                            ₹{accountData.limits.remainingSpendCap.toLocaleString('en-IN')} remaining
                                        </Text>
                                    </View>
                                </>
                            )}
                        </Surface>
                    </View >
                </>
            )}
            {/* Spending Overview */}
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 12 }}>
                Spending Overview
            </Text>

            <View style={styles.statsGrid}>
                <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Icon source="calendar-today" size={20} color={theme.colors.primary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>Today</Text>
                    </View>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                        ₹{accountData.spending?.today?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                </Surface>

                <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Icon source="calendar-month" size={20} color={theme.colors.secondary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>This Month</Text>
                    </View>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                        ₹{accountData.spending?.thisMonth?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                </Surface>
            </View>

            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Icon source="chart-timeline-variant" size={24} color={theme.colors.tertiary} />
                    <Text variant="titleMedium" style={{ marginLeft: 12, color: theme.colors.onSurface }}>Lifetime Spend</Text>
                </View>
                <Text variant="displaySmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                    ₹{accountData.spending?.lifetime?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
            </Surface>
        </>
    );
};

// ============================================================================
// Campaigns Tab (WITH MANAGEMENT)
// ============================================================================
const CampaignsTab = ({ campaignsData, error, theme, getCampaignStatusColor, fetchData }) => {
    const [menuVisible, setMenuVisible] = useState({});

    const toggleCampaignStatus = async (campaignId, currentStatus) => {
        try {
            const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

            const response = await fetch(`${BASE_URL}/campaign-management`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignId,
                    status: newStatus
                })
            });

            if (response.ok) {
                // Log Activity
                if (user) {
                    ActivityLogService.log(
                        user.uid,
                        user.email,
                        'TOGGLE_CAMPAIGN_STATUS',
                        `Toggled campaign ${campaignId} status to ${newStatus}`,
                        { campaignId, newStatus }
                    );
                }
                fetchData(); // Refresh data
            } else {
                const errorData = await response.json();
                Alert.alert('Error', 'Failed to update campaign: ' + (errorData.error || 'Unknown error'));
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const [editBudgetVisible, setEditBudgetVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null); // Campaign or Ad Set
    const [isEditingAdSet, setIsEditingAdSet] = useState(false);
    const [budgetInput, setBudgetInput] = useState('');
    const [updatingBudget, setUpdatingBudget] = useState(false);

    // Ad Sets State
    const [adSetsVisible, setAdSetsVisible] = useState(false);
    const [currentAdSets, setCurrentAdSets] = useState([]);
    const [loadingAdSets, setLoadingAdSets] = useState(false);
    const [selectedCampaignName, setSelectedCampaignName] = useState('');

    const fetchAdSets = async (campaignId, campaignName) => {
        setLoadingAdSets(true);
        setSelectedCampaignName(campaignName);
        setAdSetsVisible(true);
        try {
            const response = await fetch(`${BASE_URL}/campaign-management?scope=adsets&campaignId=${campaignId}`);
            const data = await response.json();
            if (response.ok) {
                setCurrentAdSets(data.adSets || []);
            } else {
                Alert.alert('Error', 'Failed to fetch Ad Sets');
            }
        } catch (error) {
            Alert.alert('Error', 'Error fetching Ad Sets: ' + error.message);
        } finally {
            setLoadingAdSets(false);
        }
    };

    const openEditBudget = (item, isAdSet = false) => {
        setEditingItem(item);
        setIsEditingAdSet(isAdSet);
        const currentBudget = item.budget?.daily || item.budget?.lifetime || 0;
        setBudgetInput(String(currentBudget));
        setEditBudgetVisible(true);
    };

    const handleUpdateBudget = async () => {
        if (!editingItem || !budgetInput) return;

        const amount = parseFloat(budgetInput);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Validation Error', 'Please enter a valid budget amount');
            return;
        }

        setUpdatingBudget(true);
        try {
            const isLifetime = !!editingItem.budget?.lifetime;
            const payload = {
                [isEditingAdSet ? 'adSetId' : 'campaignId']: editingItem.id,
                [isLifetime ? 'lifetimeBudget' : 'dailyBudget']: amount
            };

            const response = await fetch(`${BASE_URL}/campaign-management`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setEditBudgetVisible(false);

                if (isEditingAdSet) {
                    // Update the specific ad set in the local list to reflect change immediately
                    setCurrentAdSets(prev => prev.map(adSet =>
                        adSet.id === editingItem.id
                            ? { ...adSet, budget: { ...adSet.budget, [isLifetime ? 'lifetime' : 'daily']: amount } }
                            : adSet
                    ));
                    Alert.alert('Success', 'Ad Set budget updated');
                } else {
                    fetchData(); // Refresh campaign list
                }

                // Log Activity
                if (user) {
                    ActivityLogService.log(
                        user.uid,
                        user.email,
                        'UPDATE_BUDGET',
                        `Updated budget for ${isEditingAdSet ? 'AdSet' : 'Campaign'} ${editingItem.id}`,
                        {
                            itemId: editingItem.id,
                            type: isEditingAdSet ? 'AdSet' : 'Campaign',
                            amount: amount,
                            budgetType: isLifetime ? 'lifetime' : 'daily'
                        }
                    );
                }
            } else {
                const errorData = await response.json();
                Alert.alert('Error', 'Failed to update budget: ' + (errorData.error || 'Unknown error'));
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setUpdatingBudget(false);
        }
    };

    if (error) {
        return (
            <Surface style={[styles.errorCard, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Icon source="alert-circle" size={20} color={theme.colors.error} />
                    <Text variant="labelLarge" style={{ marginLeft: 8, color: theme.colors.error, fontWeight: 'bold' }}>Error</Text>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginBottom: 12 }}>{error}</Text>
                <Button mode="contained" onPress={fetchData} compact>Retry</Button>
            </Surface>
        );
    }

    if (!campaignsData) {
        return (
            <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 16 }}>
                Campaigns
            </Text>

            {/* Summary */}
            {campaignsData.summary && (
                <Surface style={[styles.summaryCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={1}>
                    <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer, marginBottom: 16, opacity: 0.9 }}>Today's Performance</Text>
                    <View style={styles.metricsRow}>
                        <View style={styles.metricItem}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>Spend</Text>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }} numberOfLines={1} adjustsFontSizeToFit>
                                ₹{campaignsData.summary.spend?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                        <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                        <View style={styles.metricItem}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>ROAS</Text>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }} numberOfLines={1} adjustsFontSizeToFit>
                                {campaignsData.summary.roas?.toFixed(2)}x
                            </Text>
                        </View>
                        <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                        <View style={styles.metricItem}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>Purchases</Text>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }} numberOfLines={1} adjustsFontSizeToFit>
                                {campaignsData.summary.purchases}
                            </Text>
                        </View>
                    </View>
                </Surface>
            )}

            {/* Campaigns List */}
            {/* Campaigns List */}
            <View style={{ marginTop: 16, marginBottom: 12 }}>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground }}>
                    Campaigns ({campaignsData.campaigns?.length || 0})
                </Text>
            </View>

            {campaignsData.campaigns && campaignsData.campaigns.map((campaign, index) => (
                <Surface key={index} style={[styles.campaignCard, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.outlineVariant }]} elevation={1}>
                    <View style={styles.campaignHeader}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                <View style={[styles.badge, { backgroundColor: getCampaignStatusColor(campaign.status) + '15', borderColor: getCampaignStatusColor(campaign.status) + '30' }]}>
                                    <Text style={[styles.badgeText, { color: getCampaignStatusColor(campaign.status) }]}>
                                        {campaign.status}
                                    </Text>
                                </View>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                                    {campaign.objective}
                                </Text>
                            </View>
                            <Text variant="titleMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }} numberOfLines={2}>
                                {campaign.name}
                            </Text>

                            {/* Smart Budget Chip - Standardized Entry Point */}
                            <TouchableOpacity
                                onPress={() => {
                                    if (campaign.budget?.daily || campaign.budget?.lifetime) {
                                        // CBO: Edit Campaign Budget directly
                                        openEditBudget(campaign, false);
                                    } else {
                                        // ABO: Open Ad Sets List
                                        fetchAdSets(campaign.id, campaign.name);
                                    }
                                }}
                                style={{
                                    marginTop: 8,
                                    alignSelf: 'flex-start',
                                    borderRadius: 8,
                                    backgroundColor: (campaign.budget?.daily || campaign.budget?.lifetime)
                                        ? theme.colors.secondaryContainer
                                        : theme.colors.surfaceVariant,
                                    paddingVertical: 6,
                                    paddingHorizontal: 12,
                                    flexDirection: 'row',
                                    alignItems: 'center'
                                }}
                            >
                                <Icon
                                    source={campaign.budget?.daily || campaign.budget?.lifetime ? "wallet" : "layers-outline"}
                                    size={16}
                                    color={theme.colors.onSecondaryContainer}
                                />
                                <Text
                                    variant="labelMedium"
                                    style={{
                                        marginLeft: 6,
                                        color: theme.colors.onSecondaryContainer,
                                        fontWeight: '600'
                                    }}
                                >
                                    {campaign.budget?.daily
                                        ? `Daily: ₹${campaign.budget.daily.toLocaleString('en-IN')}`
                                        : campaign.budget?.lifetime
                                            ? `Lifetime: ₹${campaign.budget.lifetime.toLocaleString('en-IN')}`
                                            : 'Ad Set Budgets (ABO)'}
                                </Text>
                                <Icon source="pencil-outline" size={14} color={theme.colors.onSecondaryContainer} style={{ marginLeft: 8, opacity: 0.6 }} />
                            </TouchableOpacity>
                        </View>

                        {/* Direct Toggle Switch */}
                        <Switch
                            value={campaign.status === 'ACTIVE'}
                            onValueChange={() => toggleCampaignStatus(campaign.id, campaign.status)}
                            color={theme.colors.primary}
                            style={{ alignSelf: 'center' }}
                        />
                    </View>

                    {campaign.performance && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Spend</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                    ₹{campaign.performance.spend?.toLocaleString('en-IN')}
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>ROAS</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }} numberOfLines={1} adjustsFontSizeToFit>
                                    {campaign.performance.roas?.toFixed(2)}x
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Purchases</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                    {campaign.performance.purchases}
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>CPM</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                    ₹{campaign.performance.cpm}
                                </Text>
                            </View>
                        </View>
                    )}
                </Surface>
            ))}

            {/* Ad Sets List Dialog */}
            <Portal>
                <Dialog visible={adSetsVisible} onDismiss={() => setAdSetsVisible(false)} style={{ backgroundColor: theme.colors.surface, maxHeight: '80%' }}>
                    <Dialog.Title style={{ color: theme.colors.onSurface }}>
                        Ad Sets: {selectedCampaignName}
                    </Dialog.Title>
                    <Dialog.ScrollArea>
                        <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
                            {loadingAdSets ? (
                                <ActivityIndicator style={{ padding: 20 }} color={theme.colors.primary} />
                            ) : currentAdSets.length === 0 ? (
                                <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', padding: 20 }}>No active Ad Sets found</Text>
                            ) : (
                                currentAdSets.map((adSet, i) => (
                                    <View key={i} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                            <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>{adSet.name}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: adSet.status === 'ACTIVE' ? '#4ade80' : theme.colors.outline }} />
                                                <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.secondary }}>
                                                    {adSet.budget?.daily
                                                        ? `Daily: ₹${adSet.budget.daily.toLocaleString('en-IN')}`
                                                        : `Lifetime: ₹${adSet.budget.lifetime?.toLocaleString('en-IN') || 0}`}
                                                </Text>
                                            </View>
                                        </View>
                                        <Button
                                            mode="outlined"
                                            compact
                                            onPress={() => openEditBudget(adSet, true)}
                                            style={{ borderColor: theme.colors.outline }}
                                        >
                                            Edit
                                        </Button>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </Dialog.ScrollArea>
                    <Dialog.Actions>
                        <Button onPress={() => setAdSetsVisible(false)}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            {/* Edit Budget Dialog */}
            <Portal>
                <Dialog visible={editBudgetVisible} onDismiss={() => setEditBudgetVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                    <Dialog.Title style={{ color: theme.colors.onSurface }}>Edit Budget</Dialog.Title>
                    <Dialog.Content>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                            Update budget for "{editingItem?.name}".
                            {editingItem?.budget?.lifetime ? ' (Lifetime)' : ' (Daily)'}
                        </Text>
                        <TextInput
                            label="Budget Amount (₹)"
                            value={budgetInput}
                            onChangeText={setBudgetInput}
                            keyboardType="numeric"
                            mode="outlined"
                            left={<TextInput.Affix text="₹" />}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setEditBudgetVisible(false)} textColor={theme.colors.onSurfaceVariant}>Cancel</Button>
                        <Button onPress={handleUpdateBudget} loading={updatingBudget} disabled={updatingBudget}>Update</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </>
    );
};

// ============================================================================
// Analytics Tab
// ============================================================================
const AnalyticsTab = ({ analyticsData, error, theme, fetchData, datePreset, setDatePreset }) => {
    if (error) {
        return (
            <Surface style={[styles.errorCard, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Icon source="alert-circle" size={20} color={theme.colors.error} />
                    <Text variant="labelLarge" style={{ marginLeft: 8, color: theme.colors.error, fontWeight: 'bold' }}>Error</Text>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginBottom: 12 }}>{error}</Text>
                <Button mode="contained" onPress={fetchData} compact>Retry</Button>
            </Surface>
        );
    }

    if (!analyticsData) {
        return (
            <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 16 }}>
                Advanced Analytics
            </Text>

            {/* Period Selector */}
            <View style={{ marginBottom: 16 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <SegmentedButtons
                        value={datePreset}
                        onValueChange={setDatePreset}
                        density="small"
                        buttons={[
                            { value: 'today', label: 'Today' },
                            { value: 'yesterday', label: 'Yesterday' },
                            { value: 'last_7d', label: 'Last 7d' },
                            { value: 'this_month', label: 'Month' },
                        ]}
                        style={{ marginBottom: 8, minWidth: 380 }} // Ensure enough width for 'Yesterday'
                    />
                </ScrollView>
            </View>

            {/* Period Info */}
            {analyticsData.period && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Icon source="calendar-range" size={20} color={theme.colors.primary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant, flex: 1 }} numberOfLines={1} adjustsFontSizeToFit>
                            Period: {datePreset === 'today' ? 'Today' :
                                datePreset === 'yesterday' ? 'Yesterday' :
                                    datePreset === 'last_7d' ? 'Last 7 Days' : 'This Month'}
                        </Text>
                    </View>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                        {new Date(analyticsData.period.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - {new Date(analyticsData.period.until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        {analyticsData.period.days} day{analyticsData.period.days !== 1 ? 's' : ''} • {analyticsData.level} level
                    </Text>
                </Surface>
            )}

            {/* Summary Metrics */}
            {analyticsData.summary && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 16, marginBottom: 12 }}>
                        Performance Summary
                    </Text>

                    <Surface style={[styles.summaryCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={1}>
                        <View style={styles.metricsRow}>
                            <View style={styles.metricItem}>
                                <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>Spend</Text>
                                <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }} numberOfLines={1} adjustsFontSizeToFit>
                                    ₹{analyticsData.summary.spend?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                            <View style={styles.metricItem}>
                                <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>Revenue</Text>
                                <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }} numberOfLines={1} adjustsFontSizeToFit>
                                    ₹{analyticsData.summary.revenue?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                            <View style={styles.metricItem}>
                                <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>ROAS</Text>
                                <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }} numberOfLines={1} adjustsFontSizeToFit>
                                    {analyticsData.summary.roas?.toFixed(2)}x
                                </Text>
                            </View>
                        </View>
                    </Surface>

                    {/* Additional Metrics */}
                    <View style={styles.statsGrid}>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>Impressions</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                {analyticsData.summary.impressions?.toLocaleString('en-IN')}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>Clicks</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                {analyticsData.summary.clicks?.toLocaleString('en-IN')}
                            </Text>
                        </Surface>
                    </View>

                    <View style={styles.statsGrid}>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>CPM</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                ₹{analyticsData.summary.cpm?.toFixed(2)}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>CTR</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                {analyticsData.summary.ctr?.toFixed(2)}%
                            </Text>
                        </Surface>
                    </View>
                </>
            )}

            {/* Top Performers */}
            {analyticsData.topPerformers && analyticsData.topPerformers.length > 0 && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                        Top Performers (by ROAS)
                    </Text>
                    {analyticsData.topPerformers.map((item, index) => (
                        <Surface key={index} style={[styles.campaignCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <View style={{
                                            height: 20,
                                            paddingHorizontal: 6,
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            backgroundColor: theme.colors.primaryContainer,
                                            borderRadius: 4
                                        }}>
                                            <Text variant="labelSmall" style={{ fontSize: 10, color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}>
                                                #{index + 1}
                                            </Text>
                                        </View>
                                        <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flex: 1 }}>
                                            {item.name}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>ROAS</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }} numberOfLines={1} adjustsFontSizeToFit>
                                        {item.roas?.toFixed(2)}x
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Spend</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                        ₹{item.spend?.toLocaleString('en-IN')}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Revenue</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                        ₹{item.revenue?.toLocaleString('en-IN')}
                                    </Text>
                                </View>
                            </View>
                        </Surface>
                    ))}
                </>
            )}

            {/* Breakdown Data */}
            {analyticsData.breakdownData && Object.keys(analyticsData.breakdownData).length > 0 && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                        Breakdown by {analyticsData.breakdown}
                    </Text>
                    {Object.entries(analyticsData.breakdownData).map(([key, data], index) => (
                        <Surface key={index} style={[styles.campaignCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 8 }}>
                                {key}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Spend</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                        ₹{Math.round(data.spend)?.toLocaleString('en-IN')}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>ROAS</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }} numberOfLines={1} adjustsFontSizeToFit>
                                        {data.roas}x
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Purchases</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>
                                        {data.purchases}
                                    </Text>
                                </View>
                            </View>
                        </Surface>
                    ))}
                </>
            )}

            {/* Comparison */}
            {analyticsData.comparison && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                        Period Comparison
                    </Text>
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                            Comparison data available for previous period analysis.
                        </Text>
                    </Surface>
                </>
            )}
        </>
    );
};




const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    tabBar: {
        paddingVertical: 8,
        // paddingHorizontal: 0, // Removed padding to prevent text shrinking
    },
    tabScrollContent: {
        flexGrow: 1,
    },
    segmentedButtons: {
        minWidth: '100%',
    },
    content: {
        padding: 12, // Reduced from 16
        paddingBottom: 32,
    },
    card: {
        padding: 12, // Reduced from 16
        borderRadius: 16,
        marginBottom: 12, // Reduced margin
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 8, // Reduced gap from 12
        marginBottom: 12, // Reduced margin
    },
    statCard: {
        flex: 1,
        padding: 12, // Reduced from 16
        borderRadius: 16,
    },
    errorCard: {
        padding: 12, // Reduced from 16
        borderRadius: 12,
        marginBottom: 12,
    },
    alertCard: {
        padding: 12, // Reduced from 16
        borderRadius: 12,
        borderLeftWidth: 4,
    },
    limitCard: {
        padding: 12, // Reduced from 16
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    transactionCard: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    badge: {
        paddingHorizontal: 6, // Reduced from 8
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    badgeText: {
        fontSize: 10, // Reduced from 11
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    campaignHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12, // Reduced from 16
    },
    summaryCard: {
        padding: 16, // Reduced from 20
        borderRadius: 16,
        marginBottom: 16, // Reduced from 20
    },
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    metricItem: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 2, // Ensure no heavy internal padding
    },
    metricDivider: {
        width: 1,
        height: 32, // Reduced height
        marginHorizontal: 4, // Reduced margin
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    campaignCard: {
        padding: 12, // Reduced from 16
        borderRadius: 12,
        marginBottom: 12,
    },
});

export default MetaScreen;

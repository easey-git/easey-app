import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, FlatList } from 'react-native';
import { Text, useTheme, Surface, Appbar, Icon, ActivityIndicator, Chip, Button, SegmentedButtons, DataTable, FAB, Menu, IconButton } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

/**
 * MetaScreen - Comprehensive Meta (Facebook/Instagram) Advertising Hub
 * 
 * Fully wired with all backend APIs
 */

const BASE_URL = 'https://easey-app.vercel.app/api';

const MetaScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission } = useAuth();
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

    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const timestamp = Date.now();

            // Fetch based on active tab
            switch (activeTab) {
                case 'overview':
                    const accountRes = await fetch(`${BASE_URL}/meta-account?_=${timestamp}`);
                    if (accountRes.ok) setAccountData(await accountRes.json());
                    break;

                case 'campaigns':
                    const campaignsRes = await fetch(`${BASE_URL}/campaign-management?_=${timestamp}`);
                    if (campaignsRes.ok) setCampaignsData(await campaignsRes.json());
                    break;

                case 'analytics':
                    const today = new Date().toISOString().split('T')[0];
                    const analyticsRes = await fetch(`${BASE_URL}/analytics?level=campaign&since=${today}&until=${today}&_=${timestamp}`);
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
    }, [activeTab, accountData]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [activeTab]);

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

            {/* Remaining Account Balance (calculated from spend_cap - amount_spent) */}
            {accountData.limits?.remainingSpendCap !== null && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.secondaryContainer }]} elevation={0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Icon source="wallet" size={24} color={theme.colors.secondary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSecondaryContainer }}>Remaining Balance</Text>
                    </View>
                    <Text variant="displaySmall" style={{ fontWeight: 'bold', color: theme.colors.onSecondaryContainer }}>
                        ₹{accountData.limits.remainingSpendCap?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer, marginTop: 4 }}>
                        Available account funds (Spend Cap - Spent)
                    </Text>
                </Surface>
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
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                        ₹{accountData.spending?.today?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                </Surface>

                <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Icon source="calendar-month" size={20} color={theme.colors.secondary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>This Month</Text>
                    </View>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                        ₹{accountData.spending?.thisMonth?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                </Surface>
            </View>

            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Icon source="chart-timeline-variant" size={24} color={theme.colors.tertiary} />
                    <Text variant="titleMedium" style={{ marginLeft: 12, color: theme.colors.onSurface }}>Lifetime Spend</Text>
                </View>
                <Text variant="displaySmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginTop: 4 }}>
                    ₹{accountData.spending?.lifetime?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
            </Surface>

            {/* Spending Limits */}
            {accountData.limits?.spendCap && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                        Spending Limits
                    </Text>

                    <Surface style={[styles.limitCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Spend Cap</Text>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
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
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                    ₹{accountData.limits.remainingSpendCap.toLocaleString('en-IN')} remaining
                                </Text>
                            </>
                        )}
                    </Surface>
                </>
            )}
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
                fetchData(); // Refresh data
            } else {
                const errorData = await response.json();
                alert('Failed to update campaign: ' + (errorData.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const deleteCampaign = async (campaignId, campaignName) => {
        if (!confirm(`Delete campaign "${campaignName}"? This cannot be undone.`)) return;

        try {
            const response = await fetch(`${BASE_URL}/campaign-management?campaignId=${campaignId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert('Campaign deleted successfully');
                fetchData(); // Refresh data
            } else {
                const errorData = await response.json();
                alert('Failed to delete campaign: ' + (errorData.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Error: ' + error.message);
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
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                ₹{campaignsData.summary.spend?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                        <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                        <View style={styles.metricItem}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>ROAS</Text>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                {campaignsData.summary.roas?.toFixed(2)}x
                            </Text>
                        </View>
                        <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                        <View style={styles.metricItem}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>Purchases</Text>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
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
                        </View>

                        {/* Action Menu */}
                        <Menu
                            visible={menuVisible[campaign.id]}
                            onDismiss={() => setMenuVisible({ ...menuVisible, [campaign.id]: false })}
                            anchor={
                                <IconButton
                                    icon="dots-vertical"
                                    size={20}
                                    onPress={() => setMenuVisible({ ...menuVisible, [campaign.id]: true })}
                                />
                            }
                        >
                            <Menu.Item
                                onPress={() => {
                                    setMenuVisible({ ...menuVisible, [campaign.id]: false });
                                    toggleCampaignStatus(campaign.id, campaign.status);
                                }}
                                leadingIcon={campaign.status === 'ACTIVE' ? 'pause' : 'play'}
                                title={campaign.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                            />
                            <Menu.Item
                                onPress={() => {
                                    setMenuVisible({ ...menuVisible, [campaign.id]: false });
                                    alert('Edit Budget: Use Facebook Ads Manager for now');
                                }}
                                leadingIcon="currency-usd"
                                title="Edit Budget"
                            />
                            <Menu.Item
                                onPress={() => {
                                    setMenuVisible({ ...menuVisible, [campaign.id]: false });
                                    deleteCampaign(campaign.id, campaign.name);
                                }}
                                leadingIcon="delete"
                                title="Delete"
                                titleStyle={{ color: theme.colors.error }}
                            />
                        </Menu>
                    </View>

                    {campaign.performance && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Spend</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                    ₹{campaign.performance.spend?.toLocaleString('en-IN')}
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>ROAS</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                    {campaign.performance.roas?.toFixed(2)}x
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Purchases</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                    {campaign.performance.purchases}
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 80 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>CPM</Text>
                                <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                    ₹{campaign.performance.cpm}
                                </Text>
                            </View>
                        </View>
                    )}
                </Surface>
            ))}
        </>
    );
};

// ============================================================================
// Analytics Tab
// ============================================================================
const AnalyticsTab = ({ analyticsData, error, theme, fetchData }) => {
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

            {/* Period Info */}
            {analyticsData.period && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Icon source="calendar-range" size={20} color={theme.colors.primary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>Period</Text>
                    </View>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
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
                                <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                    ₹{analyticsData.summary.spend?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                            <View style={styles.metricItem}>
                                <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>Revenue</Text>
                                <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                    ₹{analyticsData.summary.revenue?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={[styles.metricDivider, { backgroundColor: theme.colors.onPrimaryContainer, opacity: 0.2 }]} />
                            <View style={styles.metricItem}>
                                <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>ROAS</Text>
                                <Text variant="headlineSmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                    {analyticsData.summary.roas?.toFixed(2)}x
                                </Text>
                            </View>
                        </View>
                    </Surface>

                    {/* Additional Metrics */}
                    <View style={styles.statsGrid}>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>Impressions</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                {analyticsData.summary.impressions?.toLocaleString('en-IN')}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>Clicks</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                {analyticsData.summary.clicks?.toLocaleString('en-IN')}
                            </Text>
                        </Surface>
                    </View>

                    <View style={styles.statsGrid}>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>CPM</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                ₹{analyticsData.summary.cpm?.toFixed(2)}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>CTR</Text>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
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
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                        {item.roas?.toFixed(2)}x
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Spend</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                        ₹{item.spend?.toLocaleString('en-IN')}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Revenue</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
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
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                        ₹{Math.round(data.spend)?.toLocaleString('en-IN')}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>ROAS</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                        {data.roas}x
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 80 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Purchases</Text>
                                    <Text variant="labelLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
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
        padding: 16,
        paddingBottom: 32,
    },
    card: {
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
    },
    errorCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    alertCard: {
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
    },
    limitCard: {
        padding: 16,
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
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    campaignHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    summaryCard: {
        padding: 20,
        borderRadius: 16,
        marginBottom: 20,
    },
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    metricItem: {
        flex: 1,
        alignItems: 'center',
    },
    metricDivider: {
        width: 1,
        height: 40,
        marginHorizontal: 8,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    campaignCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
});

export default MetaScreen;

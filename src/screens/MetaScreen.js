import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, FlatList } from 'react-native';
import { Text, useTheme, Surface, Appbar, Icon, ActivityIndicator, Chip, Button, SegmentedButtons, DataTable, FAB } from 'react-native-paper';
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
    const [pixelsData, setPixelsData] = useState(null);
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

                case 'pixels':
                    const pixelsRes = await fetch(`${BASE_URL}/pixel-tracking?_=${timestamp}`);
                    if (pixelsRes.ok) setPixelsData(await pixelsRes.json());
                    break;

                case 'billing':
                    if (!accountData) {
                        const billingRes = await fetch(`${BASE_URL}/meta-account?_=${timestamp}`);
                        if (billingRes.ok) setAccountData(await billingRes.json());
                    }
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
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <CRMLayout
            title="Meta"
            navigation={navigation}
            scrollable={false}
            actions={<Appbar.Action icon="refresh" onPress={onRefresh} />}
        >
            <View style={styles.container}>
                {/* Tab Navigation */}
                <Surface style={[styles.tabBar, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
                        <SegmentedButtons
                            value={activeTab}
                            onValueChange={setActiveTab}
                            buttons={[
                                { value: 'overview', label: 'Overview', icon: 'view-dashboard' },
                                { value: 'campaigns', label: 'Campaigns', icon: 'bullhorn' },
                                { value: 'analytics', label: 'Analytics', icon: 'chart-line' },
                                { value: 'pixels', label: 'Pixels', icon: 'target' },
                                { value: 'billing', label: 'Billing', icon: 'credit-card' },
                            ]}
                            style={styles.segmentedButtons}
                        />
                    </ScrollView>
                </Surface>

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

                    {activeTab === 'pixels' && (
                        <PixelsTab
                            pixelsData={pixelsData}
                            error={error}
                            theme={theme}
                            fetchData={fetchData}
                        />
                    )}

                    {activeTab === 'billing' && (
                        <BillingTab
                            accountData={accountData}
                            theme={theme}
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
                <View style={{ gap: 12, marginBottom: 16 }}>
                    {accountData.alerts.map((alert, index) => (
                        <Surface key={index} style={[styles.alertCard, { borderLeftColor: getAlertColor(alert.level), backgroundColor: theme.colors.surface }]} elevation={1}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <Icon
                                    source={alert.level === 'critical' ? 'alert-circle' : 'alert'}
                                    size={20}
                                    color={getAlertColor(alert.level)}
                                />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text variant="labelMedium" style={{ color: getAlertColor(alert.level), fontWeight: 'bold', marginBottom: 4 }}>
                                        {alert.type.replace(/_/g, ' ')}
                                    </Text>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
                                        {alert.message}
                                    </Text>
                                </View>
                            </View>
                        </Surface>
                    ))}
                </View>
            )}

            {/* Billing Alert */}
            {accountData.billing?.amountDue !== null && accountData.billing?.amountDue > 0 && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Icon source="alert-circle" size={24} color={theme.colors.error} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onErrorContainer }}>Amount Due</Text>
                    </View>
                    <Text variant="displaySmall" style={{ fontWeight: 'bold', color: theme.colors.onErrorContainer }}>
                        ₹{accountData.billing.amountDue?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginTop: 4 }}>
                        Outstanding bill amount
                    </Text>
                </Surface>
            )}

            {/* Spending Overview */}
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 12 }}>
                Spending Overview
            </Text>

            <View style={styles.statsGrid}>
                <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Icon source="calendar-today" size={20} color={theme.colors.secondary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>Today</Text>
                    </View>
                    <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                        ₹{accountData.spending?.today?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                </Surface>

                <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Icon source="calendar-month" size={20} color={theme.colors.tertiary} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>This Month</Text>
                    </View>
                    <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                        ₹{accountData.spending?.thisMonth?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                </Surface>
            </View>

            <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Icon source="chart-timeline-variant" size={20} color={theme.colors.primary} />
                    <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>Lifetime</Text>
                </View>
                <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
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
// Campaigns Tab
// ============================================================================
const CampaignsTab = ({ campaignsData, error, theme, getCampaignStatusColor, fetchData }) => {
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
                Campaign Performance
            </Text>

            {/* Summary */}
            {campaignsData.summary && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
                    <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer, marginBottom: 12 }}>Today's Summary</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                        <View style={{ flex: 1, minWidth: 100 }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>Spend</Text>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                ₹{campaignsData.summary.spend?.toLocaleString('en-IN')}
                            </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 100 }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>ROAS</Text>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                {campaignsData.summary.roas?.toFixed(2)}x
                            </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 100 }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>Purchases</Text>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                {campaignsData.summary.purchases}
                            </Text>
                        </View>
                    </View>
                </Surface>
            )}

            {/* Campaigns List */}
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 16, marginBottom: 12 }}>
                Active Campaigns ({campaignsData.campaigns?.length || 0})
            </Text>

            {campaignsData.campaigns && campaignsData.campaigns.map((campaign, index) => (
                <Surface key={index} style={[styles.campaignCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <View style={{ flex: 1 }}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 4 }}>
                                {campaign.name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Chip mode="flat" compact style={{ height: 20 }}>
                                    <Text variant="labelSmall" style={{ fontSize: 10, color: getCampaignStatusColor(campaign.status) }}>
                                        {campaign.status}
                                    </Text>
                                </Chip>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    {campaign.objective}
                                </Text>
                            </View>
                        </View>
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

                    <Surface style={[styles.card, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                            <View style={{ flex: 1, minWidth: 100 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>Spend</Text>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                    ₹{analyticsData.summary.spend?.toLocaleString('en-IN')}
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 100 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>Revenue</Text>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                    ₹{analyticsData.summary.revenue?.toLocaleString('en-IN')}
                                </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 100 }}>
                                <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>ROAS</Text>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer }}>
                                    {analyticsData.summary.roas?.toFixed(2)}x
                                </Text>
                            </View>
                        </View>
                    </Surface>

                    {/* Additional Metrics */}
                    <View style={styles.statsGrid}>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Impressions</Text>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                {analyticsData.summary.impressions?.toLocaleString('en-IN')}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Clicks</Text>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                {analyticsData.summary.clicks?.toLocaleString('en-IN')}
                            </Text>
                        </Surface>
                    </View>

                    <View style={styles.statsGrid}>
                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>CPM</Text>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                ₹{analyticsData.summary.cpm?.toFixed(2)}
                            </Text>
                        </Surface>

                        <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>CTR</Text>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
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
                                        <Chip mode="flat" compact style={{ height: 20, backgroundColor: theme.colors.primaryContainer }}>
                                            <Text variant="labelSmall" style={{ fontSize: 10, color: theme.colors.onPrimaryContainer }}>
                                                #{index + 1}
                                            </Text>
                                        </Chip>
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

// ============================================================================
// Pixels Tab
// ============================================================================
const PixelsTab = ({ pixelsData, error, theme, fetchData }) => {
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

    if (!pixelsData) {
        return (
            <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    // Check permission status
    const hasAccess = pixelsData.permissionStatus?.hasFullAccess;

    return (
        <>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 16 }}>
                Pixel & Conversion Tracking
            </Text>

            {/* Permission Status */}
            {!hasAccess && pixelsData.permissionStatus?.error && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Icon source="lock" size={24} color={theme.colors.error} />
                        <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onErrorContainer, fontWeight: 'bold' }}>
                            Access Restricted
                        </Text>
                    </View>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer, marginBottom: 12 }}>
                        {pixelsData.permissionStatus.error.message}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginBottom: 8, fontWeight: 'bold' }}>
                        Solution:
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
                        {pixelsData.permissionStatus.solution}
                    </Text>
                </Surface>
            )}

            {/* Summary */}
            {pixelsData.summary && (
                <Surface style={[styles.card, { backgroundColor: hasAccess ? theme.colors.primaryContainer : theme.colors.surfaceVariant }]} elevation={0}>
                    <Text variant="labelMedium" style={{ color: hasAccess ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                        Summary
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                        <View style={{ flex: 1, minWidth: 100 }}>
                            <Text variant="bodySmall" style={{ color: hasAccess ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}>
                                Pixels
                            </Text>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: hasAccess ? theme.colors.onPrimaryContainer : theme.colors.onSurface }}>
                                {pixelsData.summary.totalPixels}
                            </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 100 }}>
                            <Text variant="bodySmall" style={{ color: hasAccess ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}>
                                Active
                            </Text>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: hasAccess ? theme.colors.onPrimaryContainer : theme.colors.onSurface }}>
                                {pixelsData.summary.activePixels}
                            </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 100 }}>
                            <Text variant="bodySmall" style={{ color: hasAccess ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}>
                                Conversions
                            </Text>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: hasAccess ? theme.colors.onPrimaryContainer : theme.colors.onSurface }}>
                                {pixelsData.summary.totalConversions}
                            </Text>
                        </View>
                    </View>
                </Surface>
            )}

            {/* Pixels List */}
            {pixelsData.pixels && pixelsData.pixels.length > 0 && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 16, marginBottom: 12 }}>
                        Pixels ({pixelsData.pixels.length})
                    </Text>
                    {pixelsData.pixels.map((pixel, index) => (
                        <Surface key={index} style={[styles.campaignCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flex: 1 }}>
                                    <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 4 }}>
                                        {pixel.name}
                                    </Text>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                        ID: {pixel.id}
                                    </Text>
                                    {pixel.lastFiredTime && (
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                            Last fired: {new Date(pixel.lastFiredTime).toLocaleDateString('en-IN')}
                                        </Text>
                                    )}
                                </View>
                                <Chip mode="flat" compact style={{ height: 20 }}>
                                    <Text variant="labelSmall" style={{ fontSize: 10, color: pixel.isActive ? '#4ade80' : theme.colors.error }}>
                                        {pixel.isActive ? 'Active' : 'Inactive'}
                                    </Text>
                                </Chip>
                            </View>
                        </Surface>
                    ))}
                </>
            )}

            {/* Custom Conversions */}
            {pixelsData.customConversions && pixelsData.customConversions.length > 0 && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                        Custom Conversions ({pixelsData.customConversions.length})
                    </Text>
                    {pixelsData.customConversions.map((conv, index) => (
                        <Surface key={index} style={[styles.campaignCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flex: 1 }}>
                                    <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 4 }}>
                                        {conv.name}
                                    </Text>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                        {conv.eventType}
                                    </Text>
                                </View>
                                <Chip mode="flat" compact style={{ height: 20 }}>
                                    <Text variant="labelSmall" style={{ fontSize: 10 }}>
                                        {conv.isArchived ? 'Archived' : 'Active'}
                                    </Text>
                                </Chip>
                            </View>
                        </Surface>
                    ))}
                </>
            )}

            {/* No data message */}
            {hasAccess && pixelsData.pixels.length === 0 && pixelsData.customConversions.length === 0 && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, textAlign: 'center' }}>
                        No pixels or custom conversions found for this ad account.
                    </Text>
                </Surface>
            )}
        </>
    );
};

// ============================================================================
// Billing Tab
// ============================================================================
const BillingTab = ({ accountData, theme }) => {
    if (!accountData) return null;

    return (
        <>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 16 }}>
                Billing & Payments
            </Text>

            {/* Payment Method */}
            {accountData.fundingSource && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginBottom: 12 }}>
                        Payment Method
                    </Text>
                    <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Icon source="credit-card" size={24} color={theme.colors.primary} />
                            <View style={{ marginLeft: 12, flex: 1 }}>
                                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>
                                    {accountData.fundingSource.type}
                                </Text>
                                <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                    {accountData.fundingSource.displayString}
                                </Text>
                            </View>
                        </View>
                    </Surface>
                </>
            )}

            {/* Recent Transactions */}
            {accountData.transactions && accountData.transactions.length > 0 && (
                <>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                        Recent Transactions
                    </Text>
                    <View style={{ gap: 8 }}>
                        {accountData.transactions.slice(0, 10).map((txn, index) => (
                            <Surface key={index} style={[styles.transactionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text variant="labelMedium" style={{ color: theme.colors.onSurface, fontWeight: 'bold', marginBottom: 2 }}>
                                            {txn.type}
                                        </Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                            {new Date(txn.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text variant="titleSmall" style={{ fontWeight: 'bold', color: txn.amount < 0 ? theme.colors.error : theme.colors.primary }}>
                                            {txn.amount < 0 ? '-' : '+'}₹{Math.abs(txn.amount).toLocaleString('en-IN')}
                                        </Text>
                                        <Chip mode="flat" compact style={{ marginTop: 4, height: 20 }}>
                                            <Text variant="labelSmall" style={{ fontSize: 10 }}>{txn.status}</Text>
                                        </Chip>
                                    </View>
                                </View>
                            </Surface>
                        ))}
                    </View>
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
        paddingHorizontal: 16,
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
    campaignCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
});

export default MetaScreen;

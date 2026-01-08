import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, useTheme, Surface, Appbar, Icon, ActivityIndicator, Chip, Button } from 'react-native-paper';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

/**
 * MetaScreen - Comprehensive Meta (Facebook/Instagram) Account Overview
 * 
 * Features:
 * - Account balance and spending limits
 * - Today/Month/Lifetime spending breakdown
 * - Payment method information
 * - Transaction history
 * - Smart alerts (low balance, limits, account issues)
 * - Account health status
 * - Auto-refresh every 5 minutes
 */

const API_URL = 'https://easey-app.vercel.app/api/meta-account';

const MetaScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission } = useAuth();

    if (!hasPermission('access_campaigns')) {
        return <AccessDenied title="Meta Account Restricted" message="You need permission to view Meta account information." />;
    }

    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [accountData, setAccountData] = useState(null);
    const [error, setError] = useState(null);

    const fetchAccountData = useCallback(async () => {
        try {
            setError(null);

            const timestamp = Date.now();
            const response = await fetch(`${API_URL}?_=${timestamp}`, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            setAccountData(data);
        } catch (error) {
            console.error('[MetaScreen] Error:', error.message);
            setError(error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchAccountData();
    }, [fetchAccountData]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(fetchAccountData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchAccountData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchAccountData();
    }, [fetchAccountData]);

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

    if (loading && !refreshing) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <CRMLayout
            title="Meta Account"
            navigation={navigation}
            scrollable={false}
            actions={<Appbar.Action icon="refresh" onPress={onRefresh} />}
        >
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            >
                {/* Error Message */}
                {error && (
                    <Surface style={[styles.errorCard, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon source="alert-circle" size={20} color={theme.colors.error} />
                            <Text variant="labelLarge" style={{ marginLeft: 8, color: theme.colors.error, fontWeight: 'bold' }}>Error</Text>
                        </View>
                        <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginBottom: 12 }}>{error}</Text>
                        <Button mode="contained" onPress={fetchAccountData} compact>Retry</Button>
                    </Surface>
                )}

                {accountData && (
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

                        {/* Billing Card */}
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
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
                            Spending Limits
                        </Text>

                        <View style={{ gap: 12 }}>
                            {accountData.limits?.spendCap && (
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
                            )}
                        </View>

                        {/* Payment Method */}
                        {accountData.fundingSource && (
                            <>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground, marginTop: 24, marginBottom: 12 }}>
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
                                    {accountData.transactions.slice(0, 5).map((txn, index) => (
                                        <Surface key={index} style={[styles.transactionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]} elevation={0}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text variant="labelMedium" style={{ color: theme.colors.onSurface, fontWeight: 'bold', marginBottom: 2 }}>
                                                        {txn.type}
                                                    </Text>
                                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                                        {new Date(txn.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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

                        {/* Navigate to Campaign Management */}
                        <Button
                            mode="contained"
                            icon="bullhorn"
                            onPress={() => navigation.navigate('CampaignManagement')}
                            style={{ marginTop: 24 }}
                        >
                            Manage Campaigns
                        </Button>
                    </>
                )}
            </ScrollView>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
});

export default MetaScreen;

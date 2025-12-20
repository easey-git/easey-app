import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { Text, useTheme, Surface, Appbar, SegmentedButtons, Icon, ProgressBar, ActivityIndicator } from 'react-native-paper';

/**
 * CampaignsScreen
 * 
 * Displays active marketing campaigns from the Vercel API.
 * Shows summary metrics (Spend, ROAS, Purchases, CPM) and a detailed list of campaigns.
 */

// TODO: Replace with your actual Vercel deployment URL
const API_URL = 'https://easey-app.vercel.app/api/campaigns';

const CampaignsScreen = ({ navigation }) => {
    const theme = useTheme();
    const [refreshing, setRefreshing] = useState(false);
    const [timeRange, setTimeRange] = useState('today');
    const [loading, setLoading] = useState(true);
    const [campaigns, setCampaigns] = useState([]);
    const [summary, setSummary] = useState({
        spend: 0,
        roas: 0,
        purchases: 0,
        cpm: 0
    });

    const fetchCampaigns = useCallback(async () => {
        try {
            const response = await fetch(API_URL);

            // Check content type
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("API returned non-JSON response (likely 404 or 500 HTML page)");
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch campaigns');
            }

            setCampaigns(data.campaigns || []);
            setSummary(data.summary || { spend: 0, roas: 0, purchases: 0, cpm: 0 });
        } catch (error) {
            console.log('Fetch error:', error.message);
            // In production, we might want to show a retry button or error message
            // For now, we just stop loading
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchCampaigns();
    }, [fetchCampaigns]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return '#4ade80'; // Green
            case 'LEARNING': return '#fbbf24'; // Yellow
            case 'PAUSED': return theme.colors.outline; // Grey
            case 'REJECTED': return theme.colors.error; // Red
            default: return theme.colors.primary;
        }
    };

    const getPlatformIcon = (platform) => {
        switch (platform) {
            case 'facebook': return 'facebook';
            case 'instagram': return 'instagram';
            case 'google': return 'google';
            default: return 'bullhorn';
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
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="Marketing Campaigns" />
                <Appbar.Action icon="refresh" onPress={onRefresh} />
            </Appbar.Header>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            >
                {/* Date Filter */}
                <View style={{ marginBottom: 24 }}>
                    <SegmentedButtons
                        value={timeRange}
                        onValueChange={setTimeRange}
                        buttons={[
                            { value: 'today', label: 'Today' },
                            { value: 'yesterday', label: 'Yesterday' },
                            { value: 'week', label: '7 Days' },
                        ]}
                        style={{ backgroundColor: theme.colors.elevation.level1, borderRadius: 20 }}
                    />
                </View>

                {/* Summary Cards */}
                <View style={styles.statsGrid}>
                    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon source="cash" size={20} color={theme.colors.primary} />
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>Ad Spend</Text>
                        </View>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                            ₹{summary.spend.toLocaleString('en-IN')}
                        </Text>
                    </Surface>

                    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon source="chart-line" size={20} color="#4ade80" />
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>ROAS</Text>
                        </View>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                            {summary.roas}x
                        </Text>
                    </Surface>
                </View>

                <View style={styles.statsGrid}>
                    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon source="cart" size={20} color={theme.colors.secondary} />
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>Purchases</Text>
                        </View>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                            {summary.purchases}
                        </Text>
                    </Surface>

                    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon source="eye" size={20} color={theme.colors.tertiary} />
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>CPM</Text>
                        </View>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                            ₹{summary.cpm || 0}
                        </Text>
                    </Surface>
                </View>

                <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 16, marginTop: 8, color: theme.colors.onBackground }}>Active Campaigns</Text>

                {/* Campaign List */}
                <View style={{ gap: 16 }}>
                    {campaigns.length === 0 ? (
                        <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, marginTop: 20 }}>No active campaigns found.</Text>
                    ) : (
                        campaigns.map((campaign) => (
                            <Surface
                                key={campaign.id}
                                style={[styles.campaignCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, borderWidth: 1 }]}
                                elevation={0}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <View style={{ flex: 1, marginRight: 8 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                            <Icon source={getPlatformIcon(campaign.platform)} size={16} color={theme.colors.onSurface} />
                                            <Text
                                                variant="titleSmall"
                                                style={{ fontWeight: 'bold', marginLeft: 8, color: theme.colors.onSurface, flex: 1 }}
                                                numberOfLines={1}
                                                ellipsizeMode="tail"
                                            >
                                                {campaign.name}
                                            </Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getStatusColor(campaign.status), marginRight: 6 }} />
                                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{campaign.status}</Text>
                                        </View>
                                    </View>
                                    <Surface style={{ backgroundColor: theme.colors.secondaryContainer, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }} elevation={0}>
                                        <Text variant="labelMedium" style={{ fontWeight: 'bold', color: theme.colors.onSecondaryContainer }}>
                                            {campaign.roas}x
                                        </Text>
                                    </Surface>
                                </View>

                                <View style={styles.metricsRow}>
                                    <View>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Spend</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{campaign.spend}</Text>
                                    </View>
                                    <View>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CPC</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{campaign.cpc}</Text>
                                    </View>
                                    <View>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CTR</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{campaign.ctr}%</Text>
                                    </View>
                                    <View>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Sales</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{campaign.purchases}</Text>
                                    </View>
                                </View>
                            </Surface>
                        ))
                    )}
                </View>

            </ScrollView>
        </View>
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
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
    },
    campaignCard: {
        padding: 16,
        borderRadius: 16,
    },
    metricsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    }
});

export default CampaignsScreen;

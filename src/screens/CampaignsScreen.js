import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Modal, TouchableOpacity } from 'react-native';
import { Text, useTheme, Surface, Appbar, Icon, ActivityIndicator, Chip, Menu, Button, Divider, IconButton } from 'react-native-paper';

/**
 * CampaignsScreen - Real-time Today's Campaign Performance
 * 
 * Features:
 * - Real-time today's data
 * - Status filtering (All, Active, Paused, Learning)
 * - Sorting by ROAS, Spend, Purchases
 * - Detailed campaign view
 * - Auto-refresh every 5 minutes
 */

const API_URL = 'https://easey-app.vercel.app/api/campaigns';

const CampaignsScreen = ({ navigation }) => {
    const theme = useTheme();
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [campaigns, setCampaigns] = useState([]);
    const [filteredCampaigns, setFilteredCampaigns] = useState([]);
    const [summary, setSummary] = useState({
        spend: 0,
        roas: 0,
        purchases: 0,
        cpm: 0
    });
    const [error, setError] = useState(null);

    // Filtering and Sorting
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [sortBy, setSortBy] = useState('roas');
    const [sortMenuVisible, setSortMenuVisible] = useState(false);

    // Detail Modal
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);

    const fetchCampaigns = useCallback(async () => {
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

            setCampaigns(data.campaigns || []);
            setSummary(data.summary || { spend: 0, roas: 0, purchases: 0, cpm: 0 });
        } catch (error) {
            console.error('[CampaignsScreen] Error:', error.message);
            setError(error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        const interval = setInterval(fetchCampaigns, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchCampaigns]);

    // Apply filters and sorting
    useEffect(() => {
        let filtered = [...campaigns];

        // Filter by status
        if (statusFilter !== 'ALL') {
            filtered = filtered.filter(c => c.status === statusFilter);
        }

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'roas':
                    return parseFloat(b.roas) - parseFloat(a.roas);
                case 'spend':
                    return b.spend - a.spend;
                case 'purchases':
                    return b.purchases - a.purchases;
                default:
                    return 0;
            }
        });

        setFilteredCampaigns(filtered);
    }, [campaigns, statusFilter, sortBy]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchCampaigns();
    }, [fetchCampaigns]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return '#4ade80';
            case 'LEARNING': return '#fbbf24';
            case 'PAUSED': return theme.colors.outline;
            case 'REJECTED': return theme.colors.error;
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

    const getSortLabel = () => {
        switch (sortBy) {
            case 'roas': return 'ROAS';
            case 'spend': return 'Spend';
            case 'purchases': return 'Purchases';
            default: return 'Sort';
        }
    };

    const openCampaignDetails = (campaign) => {
        setSelectedCampaign(campaign);
        setDetailModalVisible(true);
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
                <Appbar.Content title="Campaigns - Today" />
                <Appbar.Action icon="refresh" onPress={onRefresh} />
            </Appbar.Header>

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
                        <Button mode="contained" onPress={fetchCampaigns} compact>Retry</Button>
                    </Surface>
                )}

                {/* Summary Cards */}
                <View style={styles.statsGrid}>
                    <Surface style={[styles.statCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Icon source="cash" size={20} color={theme.colors.primary} />
                            <Text variant="labelMedium" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>Ad Spend</Text>
                        </View>
                        <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                            ₹{summary.spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
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

                {/* Filter and Sort Controls */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 16 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground }}>
                        Campaigns ({filteredCampaigns.length})
                    </Text>
                    <Menu
                        visible={sortMenuVisible}
                        onDismiss={() => setSortMenuVisible(false)}
                        anchor={
                            <Button
                                mode="outlined"
                                icon="sort"
                                onPress={() => setSortMenuVisible(true)}
                                compact
                            >
                                {getSortLabel()}
                            </Button>
                        }
                    >
                        <Menu.Item onPress={() => { setSortBy('roas'); setSortMenuVisible(false); }} title="Sort by ROAS" leadingIcon="chart-line" />
                        <Menu.Item onPress={() => { setSortBy('spend'); setSortMenuVisible(false); }} title="Sort by Spend" leadingIcon="cash" />
                        <Menu.Item onPress={() => { setSortBy('purchases'); setSortMenuVisible(false); }} title="Sort by Purchases" leadingIcon="cart" />
                    </Menu>
                </View>

                {/* Status Filter Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Chip
                            selected={statusFilter === 'ALL'}
                            onPress={() => setStatusFilter('ALL')}
                            style={{ backgroundColor: statusFilter === 'ALL' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                        >
                            All
                        </Chip>
                        <Chip
                            selected={statusFilter === 'ACTIVE'}
                            onPress={() => setStatusFilter('ACTIVE')}
                            style={{ backgroundColor: statusFilter === 'ACTIVE' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                        >
                            Active
                        </Chip>
                        <Chip
                            selected={statusFilter === 'LEARNING'}
                            onPress={() => setStatusFilter('LEARNING')}
                            style={{ backgroundColor: statusFilter === 'LEARNING' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                        >
                            Learning
                        </Chip>
                        <Chip
                            selected={statusFilter === 'PAUSED'}
                            onPress={() => setStatusFilter('PAUSED')}
                            style={{ backgroundColor: statusFilter === 'PAUSED' ? theme.colors.primaryContainer : theme.colors.surfaceVariant }}
                        >
                            Paused
                        </Chip>
                    </View>
                </ScrollView>

                {/* Campaign List */}
                <View style={{ gap: 16 }}>
                    {filteredCampaigns.length === 0 ? (
                        <Surface style={[styles.emptyState, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                            <Icon source="information-outline" size={48} color={theme.colors.onSurfaceVariant} />
                            <Text variant="titleMedium" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}>
                                No campaigns found
                            </Text>
                            <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                                {statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} campaigns today` : 'No campaigns running today'}
                            </Text>
                        </Surface>
                    ) : (
                        filteredCampaigns.map((campaign) => (
                            <TouchableOpacity key={campaign.id} onPress={() => openCampaignDetails(campaign)} activeOpacity={0.7}>
                                <Surface
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
                            </TouchableOpacity>
                        ))
                    )}
                </View>

            </ScrollView>

            {/* Campaign Detail Modal */}
            <Modal
                visible={detailModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setDetailModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Surface style={[styles.modalContent, { backgroundColor: theme.colors.surface }]} elevation={5}>
                        <View style={styles.modalHeader}>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flex: 1 }}>
                                Campaign Details
                            </Text>
                            <IconButton icon="close" onPress={() => setDetailModalVisible(false)} />
                        </View>

                        {selectedCampaign && (
                            <ScrollView style={{ flex: 1 }}>
                                {/* Campaign Name */}
                                <View style={{ marginBottom: 16 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                        <Icon source={getPlatformIcon(selectedCampaign.platform)} size={24} color={theme.colors.primary} />
                                        <Text variant="titleMedium" style={{ marginLeft: 8, fontWeight: 'bold', color: theme.colors.onSurface, flex: 1 }}>
                                            {selectedCampaign.name}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: getStatusColor(selectedCampaign.status), marginRight: 8 }} />
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{selectedCampaign.status}</Text>
                                    </View>
                                </View>

                                <Divider style={{ marginBottom: 16 }} />

                                {/* Key Metrics */}
                                <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 12, color: theme.colors.onSurface }}>Key Metrics</Text>
                                <View style={styles.detailGrid}>
                                    <Surface style={[styles.detailCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                                        <Icon source="cash" size={24} color={theme.colors.primary} />
                                        <Text variant="labelSmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>Total Spend</Text>
                                        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{selectedCampaign.spend}</Text>
                                    </Surface>
                                    <Surface style={[styles.detailCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                                        <Icon source="chart-line" size={24} color="#4ade80" />
                                        <Text variant="labelSmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>ROAS</Text>
                                        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{selectedCampaign.roas}x</Text>
                                    </Surface>
                                </View>

                                <View style={styles.detailGrid}>
                                    <Surface style={[styles.detailCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                                        <Icon source="cart" size={24} color={theme.colors.secondary} />
                                        <Text variant="labelSmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>Purchases</Text>
                                        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{selectedCampaign.purchases}</Text>
                                    </Surface>
                                    <Surface style={[styles.detailCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                                        <Icon source="currency-inr" size={24} color={theme.colors.tertiary} />
                                        <Text variant="labelSmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>Revenue</Text>
                                        <Text variant="titleLarge" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{Math.round(selectedCampaign.revenue)}</Text>
                                    </Surface>
                                </View>

                                <Divider style={{ marginVertical: 16 }} />

                                {/* Performance Metrics */}
                                <Text variant="titleSmall" style={{ fontWeight: 'bold', marginBottom: 12, color: theme.colors.onSurface }}>Performance Metrics</Text>
                                <View style={styles.metricsList}>
                                    <View style={styles.metricRow}>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Cost Per Click (CPC)</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{selectedCampaign.cpc}</Text>
                                    </View>
                                    <View style={styles.metricRow}>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Click-Through Rate (CTR)</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{selectedCampaign.ctr}%</Text>
                                    </View>
                                    <View style={styles.metricRow}>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Cost Per Mille (CPM)</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{selectedCampaign.cpm}</Text>
                                    </View>
                                    <View style={styles.metricRow}>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Impressions</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{selectedCampaign.impressions.toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.metricRow}>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Reach</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{selectedCampaign.reach.toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.metricRow}>
                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Clicks</Text>
                                        <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>{selectedCampaign.clicks.toLocaleString()}</Text>
                                    </View>
                                </View>
                            </ScrollView>
                        )}

                        <Button mode="contained" onPress={() => setDetailModalVisible(false)} style={{ marginTop: 16 }}>
                            Close
                        </Button>
                    </Surface>
                </View>
            </Modal>
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
    },
    errorCard: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    emptyState: {
        padding: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    detailGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    detailCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    metricsList: {
        gap: 12,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
});

export default CampaignsScreen;

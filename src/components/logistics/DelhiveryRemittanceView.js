import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, FlatList } from 'react-native';
import { Text, useTheme, ActivityIndicator, Card } from 'react-native-paper';
import { fetchDelhiveryRemittances } from '../../services/delhiveryService';

export const DelhiveryRemittanceView = () => {
    const theme = useTheme();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [remittances, setRemittances] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const loadData = async (pageNum = 1, isRefresh = false) => {
        if (loading) return;
        setLoading(true);
        try {
            const data = await fetchDelhiveryRemittances(pageNum);
            // Updated mapping based on actual API response
            const list = data?.remittance_list || data?.remittance_list_dict || data?.data || [];

            if (isRefresh) {
                setRemittances(list);
            } else {
                setRemittances(prev => [...prev, ...list]);
            }
            // Simple pagination check
            if (list.length < 10) setHasMore(false);

            // Debug logs
            if (__DEV__) console.log("Remittances Response:", JSON.stringify(data, null, 2));

        } catch (err) {
            console.error("Remittance Load Error", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData(1, true);
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        setPage(1);
        setHasMore(true);
        loadData(1, true);
    };

    const loadMore = () => {
        if (!loading && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            loadData(nextPage);
        }
    };

    const renderItem = ({ item }) => {
        // Mapping typical fields, adjust based on actual API
        const amount = item.total_amount || item.remitted_amount || item.amount || 0;
        const date = item.date || item.remittance_date || item.created_at;
        const ref = item.remittance_number || item.transaction_id || item.bank_ref_number || 'N/A';
        const status = item.remittance_status || item.status || 'Processed';

        return (
            <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="contained">
                <Card.Content>
                    <View style={styles.row}>
                        <View>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>₹{amount.toLocaleString('en-IN')}</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{date ? new Date(date).toDateString() : 'Date N/A'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text variant="labelMedium" style={{
                                color: status.toLowerCase().includes('fail') ? theme.colors.error : theme.colors.primary,
                                fontWeight: '600'
                            }}>{status}</Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.outline }}>{ref}</Text>
                        </View>
                    </View>
                </Card.Content>
            </Card>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <FlatList
                contentContainerStyle={styles.listContent}
                data={remittances}
                renderItem={renderItem}
                keyExtractor={(item, index) => item.cn_note_id || index.toString()}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ margin: 20 }} /> : null}
                ListEmptyComponent={!loading && (
                    <View style={styles.emptyState}>
                        <Text style={{ color: theme.colors.outline }}>No remittances found.</Text>
                    </View>
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        padding: 16,
        gap: 12,
    },
    card: {
        marginBottom: 4,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 50,
    }
});

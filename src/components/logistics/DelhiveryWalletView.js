import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, FlatList, RefreshControl } from 'react-native';
import { Text, useTheme, Card, ActivityIndicator, SegmentedButtons, DataTable, Icon } from 'react-native-paper';
import { fetchDelhiveryWalletDetails, fetchDelhiveryTransactions } from '../../services/delhiveryService';

// Time Range Helper
const getDateRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
};

export const DelhiveryWalletView = () => {
    const theme = useTheme();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Wallet Data
    const [walletDetails, setWalletDetails] = useState(null);
    const [transactions, setTransactions] = useState([]);

    // Filters
    const [range, setRange] = useState('7'); // 7 days default

    useEffect(() => {
        loadData();
    }, [range]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Wallet Metadata
            const details = await fetchDelhiveryWalletDetails();
            if (details) {
                setWalletDetails(details);

                // 2. Fetch Transactions using the wallet ID from details
                // Assuming details structure: { data: [{ wallet_id: '...' }] } or similar
                // We'll inspect standard structure. Usually details.data[0].uid is wallet_id 
                // IF API returns array. If object, details.data.uid.

                // Based on common patterns, let's look for an ID.
                // If we can't find it, we can't fetch transactions.

                // For safety, let's try to find an 'id' or 'uid' or 'wallet_id' in the response.
                // The logs showed: wallet_id=6524ec7a-ca98-11f0-98d2-a21bc3947b6d

                // Let's assume the first wallet in the list is the one we want if it returns a list.
                const walletId = details.data?.[0]?.uid || details.data?.uid;

                if (walletId) {
                    const dates = getDateRange(parseInt(range));
                    const transData = await fetchDelhiveryTransactions(walletId, dates.start, dates.end);
                    setTransactions(transData.results || transData.data || []);
                }
            }
        } catch (err) {
            console.error("Wallet Load Error", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const renderTransactionObj = ({ item }) => {
        const isCredit = item.type === 'CREDIT' || item.amount > 0;
        // Adjust logic based on real API response. Usually "type": "DEBIT" or "CREDIT"

        return (
            <View style={[styles.txnRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                <View style={styles.txnLeft}>
                    <View style={[styles.txnIcon, { backgroundColor: isCredit ? '#E8F5E9' : '#FFEBEE' }]}>
                        <Icon
                            source={isCredit ? 'arrow-bottom-left' : 'arrow-top-right'}
                            color={isCredit ? '#2E7D32' : '#C62828'}
                            size={20}
                        />
                    </View>
                    <View>
                        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{item.category || 'Transaction'}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>{item.description || item.remarks || item.reference_id}</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.outline }}>{new Date(item.created_at || item.date).toLocaleString()}</Text>
                    </View>
                </View>
                <Text
                    variant="titleMedium"
                    style={{
                        color: isCredit ? '#2E7D32' : '#C62828',
                        fontWeight: '700'
                    }}
                >
                    {isCredit ? '+' : '-'} ₹{Math.abs(item.amount)}
                </Text>
            </View>
        );
    };

    // Safely extract balance
    // The structure might be details.data[0].balance
    const balance = walletDetails?.data?.[0]?.balance || walletDetails?.data?.balance || 0;
    const holdAmount = walletDetails?.data?.[0]?.hold_amount || 0;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Balance Card */}
                <View style={[styles.balanceCard, { backgroundColor: theme.colors.primaryContainer }]}>
                    <View>
                        <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>Available Balance</Text>
                        <Text variant="displaySmall" style={{ fontWeight: 'bold', color: theme.colors.onPrimaryContainer, marginTop: 4 }}>
                            {walletDetails ? `₹${balance.toLocaleString('en-IN')}` : '---'}
                        </Text>
                    </View>
                    {holdAmount > 0 && (
                        <View style={[styles.holdPill, { backgroundColor: theme.colors.surface }]}>
                            <Icon source="lock" size={14} color={theme.colors.onSurfaceVariant} />
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Hold: ₹{holdAmount}</Text>
                        </View>
                    )}
                </View>

                {/* Date Controls */}
                <View style={styles.controls}>
                    <SegmentedButtons
                        value={range}
                        onValueChange={setRange}
                        buttons={[
                            { value: '0', label: 'Today' },
                            { value: '7', label: '7 Days' },
                            { value: '30', label: '30 Days' },
                        ]}
                        density="small"
                        style={{ flex: 1 }}
                    />
                </View>

                {/* Transactions List */}
                <Text variant="titleMedium" style={{ marginHorizontal: 16, marginBottom: 12, fontWeight: '600' }}>Recent Transactions</Text>

                {loading && !refreshing ? (
                    <ActivityIndicator style={{ marginTop: 20 }} />
                ) : (
                    <View style={[styles.listContainer, { backgroundColor: theme.colors.surface }]}>
                        {transactions.length > 0 ? (
                            transactions.map((item, index) => (
                                <View key={item.id || index}>
                                    {renderTransactionObj({ item })}
                                </View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Text style={{ color: theme.colors.outline }}>
                                    {walletDetails === null ? "Could not load wallet data." : "No transactions found for this period"}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 24,
    },
    balanceCard: {
        margin: 16,
        padding: 24,
        borderRadius: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    holdPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 6,
    },
    controls: {
        paddingHorizontal: 16,
        marginBottom: 20,
        flexDirection: 'row',
    },
    listContainer: {
        marginHorizontal: 16,
        borderRadius: 16,
        overflow: 'hidden',
    },
    txnRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    txnLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    txnIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        padding: 24,
        alignItems: 'center',
    }
});

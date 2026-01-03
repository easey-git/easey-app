import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity } from 'react-native';
import { Surface, Text, useTheme, Button, IconButton, Modal, Portal, TextInput, SegmentedButtons, Divider, Icon } from 'react-native-paper';
import { collection, query, orderBy, limit, addDoc, onSnapshot, serverTimestamp, deleteDoc, doc, getAggregateFromServer, sum, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { WalletService } from '../services/walletService';

export const WalletCard = () => {
    const theme = useTheme();
    const [transactions, setTransactions] = useState([]);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [initLoading, setInitLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);

    // Form State
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('expense'); // 'income' | 'expense'

    // Stats
    const [stats, setStats] = useState({
        balance: 0,
        income: 0,
        expense: 0
    });

    useEffect(() => {
        let unsubscribe;

        const fetchData = async () => {
            // 1. Live listener for Recent Transactions (List)
            const q = query(
                collection(db, "wallet_transactions"),
                orderBy("date", "desc"),
                limit(5)
            );

            unsubscribe = onSnapshot(q, (snapshot) => {
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setTransactions(list);
                setInitLoading(false);
            });

            // 2. Listen to Global Stats Doc (Server Side Counters)
            // This replaces the expensive aggregation query
            const statsUnsubscribe = onSnapshot(doc(db, "wallet_stats", "global"), (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    setStats({
                        income: data.income || 0,
                        expense: data.expense || 0,
                        balance: data.balance || 0
                    });
                } else {
                    setStats({ balance: 0, income: 0, expense: 0 });
                }
                setStatsLoading(false);
            });

            return () => {
                statsUnsubscribe();
            };
        };

        const cleanup = fetchData();

        return () => {
            if (unsubscribe) unsubscribe();
            if (cleanup) cleanup();
        };
    }, []);
    // Actually, to update totals after ADDING a transaction, we should trigger re-fetch.
    // Let's depend on 'visible' closing (simplest proxy for 'transaction added').


    const handleSave = async () => {
        if (!amount || !description) return;
        setLoading(true);

        try {
            await WalletService.addTransaction({
                amount: parseFloat(amount),
                description,
                type,
            });
            setVisible(false);
            setAmount('');
            setDescription('');
            setType('expense');
        } catch (error) {
            console.error("Error adding transaction: ", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, "wallet_transactions", id));
        } catch (error) {
            console.error("Error deleting transaction: ", error);
        }
    };

    const renderTransaction = ({ item }) => (
        <View style={styles.transactionRow}>
            <View style={styles.iconContainer}>
                <Surface style={[styles.iconSurface, { backgroundColor: item.type === 'income' ? theme.colors.primaryContainer : theme.colors.errorContainer }]} elevation={0}>
                    <Icon
                        source={item.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}
                        color={item.type === 'income' ? theme.colors.primary : theme.colors.error}
                        size={20}
                    />
                </Surface>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>{item.description}</Text>
                <Text variant="caption" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.date?.toDate ? item.date.toDate().toLocaleDateString() : 'Just now'}
                </Text>
            </View>
            <Text
                variant="bodyLarge"
                style={{
                    fontWeight: 'bold',
                    color: item.type === 'income' ? theme.colors.primary : theme.colors.error
                }}
            >
                {item.type === 'income' ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN')}
            </Text>
        </View>
    );

    return (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={2}>
            {/* Header Section */}
            <View style={styles.cardHeader}>
                <View>
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}>Wallet</Text>
                    {statsLoading ? (
                        <View style={{ height: 40, justifyContent: 'center', alignItems: 'flex-start' }}>
                            <ActivityIndicator size="small" />
                        </View>
                    ) : (
                        <Text
                            variant="displaySmall"
                            style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginTop: 4 }}
                            adjustsFontSizeToFit
                            numberOfLines={1}
                            minimumFontScale={0.5}
                        >
                            ₹{stats.balance.toLocaleString('en-IN')}
                        </Text>
                    )}
                </View>
                <IconButton
                    icon="plus"
                    mode="contained"
                    containerColor={theme.colors.primary}
                    iconColor={theme.colors.onPrimary}
                    onPress={() => setVisible(true)}
                    size={24}
                />
            </View>

            {/* Stats Check */}
            <View style={styles.statsRow}>
                <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Icon source="arrow-down-left" color={theme.colors.primary} size={20} />
                    <View style={{ marginLeft: 8 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Income</Text>
                        {statsLoading ? (
                            <ActivityIndicator size="small" style={{ alignSelf: 'flex-start' }} />
                        ) : (
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
                                ₹{stats.income.toLocaleString('en-IN')}
                            </Text>
                        )}
                    </View>
                </View>
                <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Icon source="arrow-up-right" color={theme.colors.error} size={20} />
                    <View style={{ marginLeft: 8 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Expense</Text>
                        {statsLoading ? (
                            <ActivityIndicator size="small" style={{ alignSelf: 'flex-start' }} />
                        ) : (
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.error }}>
                                ₹{stats.expense.toLocaleString('en-IN')}
                            </Text>
                        )}
                    </View>
                </View>
            </View>

            <Divider style={{ marginVertical: 16 }} />

            {/* Recent Transactions List */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>Recent Activity</Text>
                {/* <Button mode="text" compact>View All</Button> */}
            </View>

            {transactions.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 20 }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.outline }}>No transactions yet</Text>
                </View>
            ) : (
                transactions.slice(0, 3).map((item) => (
                    <View key={item.id} >
                        {renderTransaction({ item })}
                        <Divider style={{ marginVertical: 8, backgroundColor: 'transparent' }} />
                    </View>
                ))
            )}

            {/* Add Transaction Modal */}
            <Portal>
                <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.elevation.level3 }]}>
                    <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 16, textAlign: 'center', color: theme.colors.onSurface }}>
                        Add Transaction
                    </Text>

                    <SegmentedButtons
                        value={type}
                        onValueChange={setType}
                        buttons={[
                            { value: 'expense', label: 'Expense', icon: 'arrow-up-right', checkedColor: theme.colors.error, style: { borderColor: theme.colors.outline } },
                            { value: 'income', label: 'Income', icon: 'arrow-down-left', checkedColor: theme.colors.primary, style: { borderColor: theme.colors.outline } },
                        ]}
                        style={{ marginBottom: 24 }}
                    />

                    <TextInput
                        label="Amount"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                        mode="outlined"
                        style={{ marginBottom: 16, backgroundColor: 'transparent' }}
                        left={<TextInput.Affix text="₹" />}
                    />

                    <TextInput
                        label="Description"
                        value={description}
                        onChangeText={setDescription}
                        mode="outlined"
                        style={{ marginBottom: 24, backgroundColor: 'transparent' }}
                        placeholder="e.g. Office Supplies"
                    />

                    <Button mode="contained" onPress={handleSave} loading={loading} style={{ marginBottom: 8 }}>
                        Save Transaction
                    </Button>
                    <Button mode="text" onPress={() => setVisible(false)}>
                        Cancel
                    </Button>
                </Modal>
            </Portal>
        </Surface>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 24,
        padding: 24,
        marginBottom: 24,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    statItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
    },
    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    iconContainer: {
        marginRight: 0,
    },
    iconSurface: {
        padding: 8,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalContent: {
        margin: 20,
        padding: 24,
        borderRadius: 24,
    }
});

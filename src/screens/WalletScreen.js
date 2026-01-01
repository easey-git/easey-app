import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Surface, Text, useTheme, Button, Modal, Portal, TextInput, SegmentedButtons, Divider, Icon, Appbar, ActivityIndicator } from 'react-native-paper';
import { collection, query, orderBy, limit, addDoc, onSnapshot, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ResponsiveContainer } from '../components/ResponsiveContainer';

const WalletScreen = ({ navigation }) => {
    const theme = useTheme();
    const [transactions, setTransactions] = useState([]);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);

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
        setDataLoading(true);
        const q = query(
            collection(db, "wallet_transactions"),
            orderBy("date", "desc"),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = [];
            let income = 0;
            let expense = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                const item = { id: doc.id, ...data };
                list.push(item);

                // Simple client-side aggregation
                if (data.type === 'income') {
                    income += parseFloat(data.amount);
                } else {
                    expense += parseFloat(data.amount);
                }
            });

            setTransactions(list);
            setStats({
                balance: income - expense,
                income,
                expense
            });
            setDataLoading(false);
        }, (error) => {
            console.error("Error fetching transactions: ", error);
            setDataLoading(false);
            Alert.alert("Error", "Failed to load transactions. Please check your internet connection.");
        });

        return () => unsubscribe();
    }, []);

    const handleSave = async () => {
        if (!amount || !description) {
            Alert.alert("Missing Fields", "Please enter both an amount and a description.");
            return;
        };

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid positive number.");
            return;
        }

        setLoading(true);

        try {
            await addDoc(collection(db, "wallet_transactions"), {
                amount: numericAmount,
                description: description.trim(),
                type,
                date: serverTimestamp(),
            });
            setVisible(false);
            setAmount('');
            setDescription('');
            setType('expense');
        } catch (error) {
            console.error("Error adding transaction: ", error);
            Alert.alert("Error", "Could not save transaction. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = (id) => {
        Alert.alert(
            "Delete Transaction",
            "Are you sure you want to delete this transaction?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => handleDelete(id)
                }
            ]
        );
    };

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, "wallet_transactions", id));
        } catch (error) {
            console.error("Error deleting transaction: ", error);
            Alert.alert("Error", "Failed to delete transaction.");
        }
    };

    const renderTransaction = ({ item }) => (
        <TouchableOpacity onLongPress={() => confirmDelete(item.id)} delayLongPress={500}>
            <View style={styles.transactionRow}>
                <View style={styles.iconContainer}>
                    <Surface style={[styles.iconSurface, { backgroundColor: item.type === 'income' ? theme.colors.primaryContainer : theme.colors.errorContainer }]} elevation={0}>
                        <Icon
                            source={item.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'}
                            color={item.type === 'income' ? theme.colors.primary : theme.colors.error}
                            size={24}
                        />
                    </Surface>
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text variant="bodyLarge" style={{ fontWeight: '600', color: theme.colors.onSurface }}>{item.description}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {item.date?.toDate ? item.date.toDate().toLocaleDateString() + ' • ' + item.date.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </Text>
                </View>
                <Text
                    variant="titleMedium"
                    style={{
                        fontWeight: 'bold',
                        color: item.type === 'income' ? theme.colors.primary : theme.colors.error
                    }}
                >
                    {item.type === 'income' ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN')}
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <Appbar.Header style={{ backgroundColor: theme.colors.background, elevation: 0 }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="Wallet" titleStyle={{ fontWeight: 'bold' }} />
                <Appbar.Action icon="plus" onPress={() => setVisible(true)} />
            </Appbar.Header>

            {dataLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" />
                </View>
            ) : (
                <ResponsiveContainer>
                    <ScrollView contentContainerStyle={styles.content}>
                        {/* Header Card */}
                        <Surface style={[styles.balanceCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
                            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.8 }}>Total Balance</Text>
                            <Text variant="displayMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginTop: 8, marginBottom: 24 }}>
                                ₹{stats.balance.toLocaleString('en-IN')}
                            </Text>

                            <View style={styles.statsRow}>
                                <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                                    <View style={[styles.statIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                                        <Icon source="arrow-down-left" color={theme.colors.primary} size={20} />
                                    </View>
                                    <View>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Income</Text>
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                            ₹{stats.income.toLocaleString('en-IN')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                                    <View style={[styles.statIcon, { backgroundColor: theme.colors.errorContainer }]}>
                                        <Icon source="arrow-up-right" color={theme.colors.error} size={20} />
                                    </View>
                                    <View>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Expense</Text>
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                            ₹{stats.expense.toLocaleString('en-IN')}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </Surface>

                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginVertical: 16, marginLeft: 4, color: theme.colors.onBackground }}>Recent Activity</Text>

                        {transactions.length === 0 ? (
                            <View style={{ alignItems: 'center', padding: 40, opacity: 0.5 }}>
                                <Icon source="wallet-outline" size={64} color={theme.colors.onSurfaceVariant} />
                                <Text variant="bodyLarge" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>No transactions yet</Text>
                            </View>
                        ) : (
                            <Surface style={[styles.listCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                                {transactions.map((item, index) => (
                                    <View key={item.id}>
                                        {renderTransaction({ item })}
                                        {index < transactions.length - 1 && <Divider style={{ marginLeft: 64 }} />}
                                    </View>
                                ))}
                            </Surface>
                        )}
                    </ScrollView>
                </ResponsiveContainer>
            )}

            {/* Add Transaction Modal */}
            <Portal>
                <Modal
                    visible={visible}
                    onDismiss={() => setVisible(false)}
                    contentContainerStyle={[styles.modalContent, { backgroundColor: theme.colors.elevation.level3 }]}
                >
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                        <Text variant="headlineSmall" style={{ fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: theme.colors.onSurface }}>
                            New Transaction
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
                            keyboardType="decimal-pad"
                            mode="outlined"
                            style={{ marginBottom: 16, backgroundColor: 'transparent' }}
                            left={<TextInput.Affix text="₹" />}
                            autoFocus
                        />

                        <TextInput
                            label="Description"
                            value={description}
                            onChangeText={setDescription}
                            mode="outlined"
                            style={{ marginBottom: 32, backgroundColor: 'transparent' }}
                            placeholder="e.g. Server Costs"
                        />

                        <Button mode="contained" onPress={handleSave} loading={loading} contentStyle={{ height: 48 }}>
                            Save Transaction
                        </Button>
                    </KeyboardAvoidingView>
                </Modal>
            </Portal>
        </View>
    );
};

const styles = StyleSheet.create({
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    balanceCard: {
        borderRadius: 24,
        padding: 24,
        marginBottom: 8,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    statItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        gap: 12
    },
    statIcon: {
        padding: 8,
        borderRadius: 12,
    },
    listCard: {
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
    },
    iconSurface: {
        padding: 10,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalContent: {
        margin: 20,
        padding: 24,
        borderRadius: 28,
    }
});

export default WalletScreen;

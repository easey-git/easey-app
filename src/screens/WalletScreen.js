import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { Surface, Text, useTheme, Button, Modal, Portal, TextInput, SegmentedButtons, Divider, Icon, Appbar, ActivityIndicator, Chip, Snackbar, Searchbar } from 'react-native-paper';
import { collection, query, orderBy, limit, addDoc, onSnapshot, serverTimestamp, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { PieChart } from 'react-native-chart-kit';

const EXPENSE_CATEGORIES = ['Business', 'Share', 'Split', 'Misc'];
const INCOME_CATEGORIES = ['Remittance', 'Fund', 'Share', 'Investment', 'Misc'];

const CATEGORY_COLORS = {
    'Business': '#F44336', // Red
    'Share': '#2196F3', // Blue
    'Split': '#FF9800', // Orange
    'Misc': '#9E9E9E', // Grey
    'Remittance': '#4CAF50', // Green
    'Fund': '#9C27B0', // Purple
    'Investment': '#FFD700', // Gold
};

const CHART_CONFIG = {
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
};

const StatChart = ({ title, data, theme }) => {
    const chartSize = Platform.OS === 'web' ? 220 : 150;

    return (
        <Surface style={[styles.chartCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginBottom: 16 }}>{title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: Platform.OS === 'web' ? 64 : 24 }}>
                <View style={{ width: chartSize, alignItems: 'center' }}>
                    <PieChart
                        data={data}
                        width={chartSize}
                        height={chartSize}
                        chartConfig={CHART_CONFIG}
                        accessor={"amount"}
                        backgroundColor={"transparent"}
                        paddingLeft={"0"}
                        center={[chartSize / 4, 0]}
                        absolute
                        hasLegend={false}
                    />
                </View>
                <View style={{ minWidth: 120 }}>
                    {data.map((item, index) => (
                        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.color, marginRight: 12 }} />
                            <View>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} adjustsFontSizeToFit numberOfLines={1}>
                                    ₹{Math.abs(item.amount).toLocaleString('en-IN')}
                                </Text>
                                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                                    {item.name}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
        </Surface>
    );
};

const WalletScreen = ({ navigation }) => {
    const theme = useTheme();

    const [transactions, setTransactions] = useState([]);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);

    // Filters
    const [timeRange, setTimeRange] = useState('month'); // 'week' | 'month' | 'all'
    const [filterType, setFilterType] = useState('all'); // 'all' | 'income' | 'expense'
    const [searchQuery, setSearchQuery] = useState('');

    // Form State
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('expense'); // 'income' | 'expense'
    const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarColor, setSnackbarColor] = useState('#333');

    const showSnackbar = useCallback((message, isError = false) => {
        setSnackbarMessage(message);
        setSnackbarColor(isError ? theme.colors.error : theme.colors.inverseSurface);
        setSnackbarVisible(true);
    }, [theme]);

    // Derived Stats
    const stats = useMemo(() => {
        let income = 0;
        let expense = 0;
        const expenseTotals = {};
        const incomeTotals = {};

        transactions.forEach(t => {
            const amt = parseFloat(t.amount);
            const cat = t.category || 'Misc'; // Fallback for old data

            if (t.type === 'income') {
                income += amt;
                incomeTotals[cat] = (incomeTotals[cat] || 0) + amt;
            } else {
                expense += amt;
                expenseTotals[cat] = (expenseTotals[cat] || 0) + amt;
            }
        });

        // Helper to format chart data
        const formatChartData = (totals) => Object.keys(totals).map(cat => ({
            name: cat,
            amount: totals[cat],
            color: CATEGORY_COLORS[cat] || '#808080',
            legendFontColor: theme.colors.onSurfaceVariant,
            legendFontSize: 12
        })).sort((a, b) => b.amount - a.amount);

        return {
            balance: income - expense,
            income,
            expense,
            expenseChart: formatChartData(expenseTotals),
            incomeChart: formatChartData(incomeTotals),
            cashFlowChart: [
                {
                    name: 'Income',
                    amount: income,
                    color: theme.colors.primary, // Using theme primary (Blue-ish)
                    legendFontColor: theme.colors.onSurfaceVariant,
                    legendFontSize: 12
                },
                {
                    name: 'Expense',
                    amount: expense,
                    color: theme.colors.error, // Using theme error (Red-ish)
                    legendFontColor: theme.colors.onSurfaceVariant,
                    legendFontSize: 12
                }
            ].sort((a, b) => b.amount - a.amount)
        };
    }, [transactions, theme]);


    useEffect(() => {
        setDataLoading(true);

        // Calculate start date based on filter
        let startDate = new Date();
        if (timeRange === 'week') {
            startDate.setDate(startDate.getDate() - 7);
        } else if (timeRange === 'month') {
            startDate.setMonth(startDate.getMonth() - 1);
        } else {
            startDate = new Date(0); // All time
        }

        let q;
        if (timeRange === 'all') {
            q = query(
                collection(db, "wallet_transactions"),
                orderBy("date", "desc"),
                limit(100)
            );
        } else {
            q = query(
                collection(db, "wallet_transactions"),
                where("date", ">=", startDate),
                orderBy("date", "desc"),
                limit(100)
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Client-side type filtering if needed, but we do it in render usually or separate query
                // For agility, let's filter in memory
                list.push({ id: doc.id, ...data });
            });
            setTransactions(list);
            setDataLoading(false);
        }, (error) => {
            console.error("Error fetching transactions: ", error);
            setDataLoading(false);
            showSnackbar("Failed to load transactions", true);
        });

        return () => unsubscribe();
    }, [timeRange, showSnackbar]);

    // Update default category when type changes
    useEffect(() => {
        if (type === 'income') {
            setCategory(INCOME_CATEGORIES[0]);
        } else {
            setCategory(EXPENSE_CATEGORIES[0]);
        }
    }, [type]);

    const handleSave = useCallback(async () => {
        if (!amount || !description) {
            showSnackbar("Please enter both amount and description", true);
            return;
        };

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            showSnackbar("Please enter a valid positive amount", true);
            return;
        }

        setLoading(true);

        try {
            await addDoc(collection(db, "wallet_transactions"), {
                amount: numericAmount,
                description: description.trim(),
                category,
                type,
                date: serverTimestamp(),
            });
            setVisible(false);
            setAmount('');
            setDescription('');
            // Reset to defaults
            const defaultType = 'expense';
            setType(defaultType);
            setCategory(EXPENSE_CATEGORIES[0]);

            showSnackbar("Transaction saved successfully");
        } catch (error) {
            console.error("Error adding transaction: ", error);
            showSnackbar("Could not save. Check your connection.", true);
        } finally {
            setLoading(false);
        }
    }, [amount, description, category, type, showSnackbar]);

    const handleDelete = useCallback(async (id) => {
        try {
            await deleteDoc(doc(db, "wallet_transactions", id));
            showSnackbar("Transaction deleted");
        } catch (error) {
            console.error("Error deleting transaction: ", error);
            showSnackbar("Failed to delete transaction", true);
        }
    }, [showSnackbar]);

    const confirmDelete = useCallback((id) => {
        if (Platform.OS === 'web') {
            if (window.confirm("Are you sure you want to delete this transaction?")) {
                handleDelete(id);
            }
        } else {
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
        }
    }, [handleDelete]);
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const matchesType = filterType === 'all' || t.type === filterType;
            const query = searchQuery.toLowerCase();

            // Format date for search matching (e.g. "1/1/2026", "Jan 1, 2026")
            const dateObj = t.date?.toDate ? t.date.toDate() : new Date();
            const dateString = dateObj.toLocaleDateString().toLowerCase();
            const dateStringFull = dateObj.toLocaleDateString(undefined, { dateStyle: 'long' }).toLowerCase();

            // Intelligence: Relative Dates (Today, Yesterday)
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const isToday = dateObj.toDateString() === today.toDateString();
            const isYesterday = dateObj.toDateString() === yesterday.toDateString();

            const matchesSearch = !query ||
                (t.description && t.description.toLowerCase().includes(query)) ||
                (t.category && t.category.toLowerCase().includes(query)) ||
                (t.amount && t.amount.toString().includes(query)) ||
                (t.type && t.type.toLowerCase().includes(query)) || // Match "Income"/"Expense"
                (dateString.includes(query)) ||
                (dateStringFull.includes(query)) ||
                (dateObj.toDateString().toLowerCase().includes(query)) || // Robust Match (e.g. "Thu", "Jan", "2026")
                (query === 'today' && isToday) ||
                (query === 'yesterday' && isYesterday);

            return matchesType && matchesSearch;
        });
    }, [transactions, filterType, searchQuery]);

    const renderTransaction = ({ item }) => (
        <TouchableOpacity onLongPress={() => confirmDelete(item.id)} delayLongPress={500}>
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
                <View style={{ flex: 1, marginLeft: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Text variant="bodyLarge" style={{ fontWeight: '600', color: theme.colors.onSurface, marginRight: 8 }}>{item.category}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.outline }}>•  {item.description}</Text>
                    </View>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {item.date?.toDate ? item.date.toDate().toLocaleDateString() + ' • ' + item.date.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </Text>
                </View>
                <Text
                    variant="titleMedium"
                    style={{
                        fontWeight: 'bold',
                        color: item.type === 'income' ? theme.colors.primary : theme.colors.error,
                        flex: 0.4,
                        textAlign: 'right'
                    }}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                >
                    {item.type === 'income' ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN')}
                </Text>
            </View>
        </TouchableOpacity>
    );

    const renderModalContent = () => (
        <>
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

            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, marginLeft: 4 }}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
                    {(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                        <Chip
                            key={cat}
                            selected={category === cat}
                            onPress={() => setCategory(cat)}
                            showSelectedOverlay
                            style={{ backgroundColor: category === cat ? (type === 'income' ? theme.colors.primaryContainer : theme.colors.errorContainer) : theme.colors.surfaceVariant }}
                            textStyle={{ color: theme.colors.onSurface }}
                        >
                            {cat}
                        </Chip>
                    ))}
                </View>
            </ScrollView>

            <TextInput
                label="Amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                mode="outlined"
                style={{ marginBottom: 16, backgroundColor: 'transparent' }}
                left={<TextInput.Affix text="₹" />}
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
        </>
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
                        {/* Time Filter */}
                        <View style={{ marginBottom: 16 }}>
                            <SegmentedButtons
                                value={timeRange}
                                onValueChange={setTimeRange}
                                buttons={[
                                    { value: 'week', label: '7 Days' },
                                    { value: 'month', label: '30 Days' },
                                    { value: 'all', label: 'All Time' },
                                ]}
                                style={{ marginBottom: 0 }}
                            />
                        </View>

                        {/* Balance Overview */}
                        <Surface style={[styles.balanceCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
                            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 }}>Balance</Text>
                            <Text variant="displayMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginTop: 4, marginBottom: 24 }} adjustsFontSizeToFit numberOfLines={1}>
                                ₹{stats.balance.toLocaleString('en-IN')}
                            </Text>

                            <View style={styles.statsRow}>
                                <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                                    <View style={[styles.statIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                                        <Icon source="arrow-down-left" color={theme.colors.primary} size={20} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Income</Text>
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} adjustsFontSizeToFit numberOfLines={1}>
                                            ₹{stats.income.toLocaleString('en-IN')}
                                        </Text>
                                    </View>
                                </View>
                                <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                                    <View style={[styles.statIcon, { backgroundColor: theme.colors.errorContainer }]}>
                                        <Icon source="arrow-up-right" color={theme.colors.error} size={20} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Expense</Text>
                                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} adjustsFontSizeToFit numberOfLines={1}>
                                            ₹{stats.expense.toLocaleString('en-IN')}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </Surface>

                        {/* Visual Analytics - Pie Chart (Switches based on filter) */}
                        {((filterType === 'all') && (stats.income > 0 || stats.expense > 0)) && (
                            <StatChart title="Cash Flow" data={stats.cashFlowChart} theme={theme} />
                        )}

                        {((filterType === 'expense') && stats.expenseChart.length > 0) && (
                            <StatChart title="Expense Breakdown" data={stats.expenseChart} theme={theme} />
                        )}

                        {((filterType === 'income') && stats.incomeChart.length > 0) && (
                            <StatChart title="Income Breakdown" data={stats.incomeChart} theme={theme} />
                        )}

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 }}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onBackground }}>Transactions</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Chip selected={filterType === 'all'} onPress={() => setFilterType('all')} showSelectedOverlay compact>All</Chip>
                                <Chip selected={filterType === 'expense'} onPress={() => setFilterType('expense')} showSelectedOverlay compact>Exp</Chip>
                                <Chip selected={filterType === 'income'} onPress={() => setFilterType('income')} showSelectedOverlay compact>Inc</Chip>
                            </View>
                        </View>

                        <Searchbar
                            placeholder="Search transactions"
                            onChangeText={setSearchQuery}
                            value={searchQuery}
                            style={{ marginBottom: 16, backgroundColor: theme.colors.surface, borderRadius: 16, height: 46 }}
                            inputStyle={{ minHeight: 0, alignSelf: 'center' }}
                            iconColor={theme.colors.onSurfaceVariant}
                            placeholderTextColor={theme.colors.onSurfaceVariant}
                            elevation={0}
                        />

                        {filteredTransactions.length === 0 ? (
                            <View style={{ alignItems: 'center', padding: 40, opacity: 0.5 }}>
                                <Icon source="wallet-outline" size={64} color={theme.colors.onSurfaceVariant} />
                                <Text variant="bodyLarge" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>No transactions found</Text>
                            </View>
                        ) : (
                            <Surface style={[styles.listCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                                {filteredTransactions.map((item, index) => (
                                    <View key={item.id}>
                                        {renderTransaction({ item })}
                                        {index < filteredTransactions.length - 1 && <Divider style={{ marginLeft: 64 }} />}
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
                    <View>
                        {Platform.OS !== 'web' ? (
                            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                                {renderModalContent()}
                            </KeyboardAvoidingView>
                        ) : (
                            renderModalContent()
                        )}
                    </View>
                </Modal>
            </Portal>

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={3000}
                style={{ backgroundColor: snackbarColor }}
            >
                <Text style={{ color: theme.colors.inverseOnSurface }}>{snackbarMessage}</Text>
            </Snackbar>
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
        marginBottom: 16,
    },
    chartCard: {
        borderRadius: 24,
        padding: 20,
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

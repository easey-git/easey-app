import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, SectionList, ScrollView } from 'react-native';
import { Surface, Text, useTheme, Button, Modal, Portal, TextInput, SegmentedButtons, Divider, Icon, Appbar, ActivityIndicator, Chip, Snackbar, Searchbar } from 'react-native-paper';
import { collection, query, orderBy, limit, onSnapshot, doc, where, getAggregateFromServer, sum, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { WalletService } from '../services/walletService';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { PieChart } from 'react-native-chart-kit';
import * as Haptics from 'expo-haptics';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

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

const ITEM_COLORS = [
    '#EF5350', '#EC407A', '#AB47BC', '#7E57C2', '#5C6BC0',
    '#42A5F5', '#29B6F6', '#26C6DA', '#26A69A', '#66BB6A',
    '#9CCC65', '#D4E157', '#FFEE58', '#FFCA28', '#FFA726',
    '#FF7043', '#8D6E63', '#BDBDBD', '#78909C'
];

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
    const { hasPermission } = useAuth();

    if (!hasPermission('access_wallet')) {
        return <AccessDenied title="Wallet Restricted" message="You need permission to access financial records." />;
    }

    const [transactions, setTransactions] = useState([]);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);
    const [displayLimit, setDisplayLimit] = useState(50); // Pagination Limit

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

    // Separate Data Stream for Charts (High Volume, Client-Side Aggregation)
    const [chartTransactions, setChartTransactions] = useState([]);

    // 4. "All Time" Stats Listener (Stats Doc) - Future Proof
    const [allTimeStats, setAllTimeStats] = useState(null);
    useEffect(() => {
        if (timeRange !== 'all') return;

        const unsubscribe = onSnapshot(doc(db, 'wallet_stats', 'global'), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setAllTimeStats(data);
            } else {
                setAllTimeStats({ balance: 0, income: 0, expense: 0, categoryBreakdown: { income: {}, expense: {} } });
            }
        });
        return () => unsubscribe();
    }, [timeRange]);

    // 5. Auto-Migration Logic
    useEffect(() => {
        if (timeRange === 'all' && allTimeStats) {
            if (allTimeStats.categoryBreakdown && !allTimeStats.descriptionBreakdown) {
                WalletService.recalculateAllStats();
            }
        }
    }, [timeRange, allTimeStats]);

    const itemStats = useMemo(() => {
        const expenseItemTotals = {};
        const incomeItemTotals = {};

        // CASE 1: All Time (Server Stats Doc)
        if (timeRange === 'all') {
            if (allTimeStats && allTimeStats.descriptionBreakdown) {
                const descs = allTimeStats.descriptionBreakdown;
                if (descs.income) Object.keys(descs.income).forEach(key => incomeItemTotals[key] = descs.income[key]);
                if (descs.expense) Object.keys(descs.expense).forEach(key => expenseItemTotals[key] = descs.expense[key]);
            }
            // Fallback to Category
            else if (allTimeStats && allTimeStats.categoryBreakdown) {
                const cats = allTimeStats.categoryBreakdown;
                if (cats.income) Object.keys(cats.income).forEach(key => incomeItemTotals[key] = cats.income[key]);
                if (cats.expense) Object.keys(cats.expense).forEach(key => expenseItemTotals[key] = cats.expense[key]);
            }
        }
        // CASE 2: Week/Month (Client Aggregation of downloaded docs)
        else {
            chartTransactions.forEach(t => {
                const amt = parseFloat(t.amount);
                const key = t.description || 'Unknown';
                if (t.type === 'income') {
                    incomeItemTotals[key] = (incomeItemTotals[key] || 0) + amt;
                } else {
                    expenseItemTotals[key] = (expenseItemTotals[key] || 0) + amt;
                }
            });
        }

        const formatItemData = (totals) => {
            const sorted = Object.keys(totals).map(key => ({ name: key, amount: totals[key] })).sort((a, b) => b.amount - a.amount);
            let final = sorted;
            if (sorted.length > 5) {
                const top5 = sorted.slice(0, 5);
                const others = sorted.slice(5).reduce((acc, curr) => acc + curr.amount, 0);
                if (others > 0) final = [...top5, { name: 'Others', amount: others }];
            }
            return final.map((item, index) => ({
                name: item.name,
                amount: item.amount,
                color: item.name === 'Others' ? '#9E9E9E' : (CATEGORY_COLORS[item.name] || ITEM_COLORS[index % ITEM_COLORS.length]),
                legendFontColor: theme.colors.onSurfaceVariant,
                legendFontSize: 12
            }));
        };

        return {
            expenseItemsChart: formatItemData(expenseItemTotals),
            incomeItemsChart: formatItemData(incomeItemTotals),
        };
    }, [chartTransactions, allTimeStats, timeRange, theme]);

    // Real Global Stats (Server-Side Aggregation)
    const [globalStats, setGlobalStats] = useState({ balance: 0, income: 0, expense: 0 });
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        let isActive = true;

        const fetchGlobalStats = async () => {
            setStatsLoading(true);

            try {
                if (timeRange === 'all') {
                    if (allTimeStats) {
                        if (isActive) {
                            setGlobalStats({
                                income: allTimeStats.income || 0,
                                expense: allTimeStats.expense || 0,
                                balance: allTimeStats.balance || 0
                            });
                            setStatsLoading(false);
                        }
                    }
                    return;
                }

                let startDate = new Date();
                let hasDateFilter = false;

                if (timeRange === 'week') {
                    startDate.setDate(startDate.getDate() - 7);
                    hasDateFilter = true;
                } else if (timeRange === 'month') {
                    startDate.setMonth(startDate.getMonth() - 1);
                    hasDateFilter = true;
                }

                const coll = collection(db, "wallet_transactions");
                const incomeConstraints = [where("type", "==", "income")];
                const expenseConstraints = [where("type", "==", "expense")];

                if (hasDateFilter) {
                    incomeConstraints.push(where("date", ">=", startDate));
                    expenseConstraints.push(where("date", ">=", startDate));
                }

                const incomeQuery = query(coll, ...incomeConstraints);
                const expenseQuery = query(coll, ...expenseConstraints);

                const [incomeSnap, expenseSnap] = await Promise.all([
                    getAggregateFromServer(incomeQuery, { total: sum('amount') }),
                    getAggregateFromServer(expenseQuery, { total: sum('amount') })
                ]);

                if (isActive) {
                    const totalIncome = incomeSnap.data().total || 0;
                    const totalExpense = expenseSnap.data().total || 0;

                    setGlobalStats({
                        income: totalIncome,
                        expense: totalExpense,
                        balance: totalIncome - totalExpense
                    });

                    setStatsLoading(false);
                }

            } catch (error) {
                console.error("Stats Aggregation Failed:", error);
                if (isActive) setStatsLoading(false);
            }
        };

        fetchGlobalStats();

        return () => {
            isActive = false;
        };
    }, [timeRange, allTimeStats]);


    // 5. Chart Data Fetcher
    useEffect(() => {
        if (timeRange === 'all') {
            setChartTransactions([]);
            return;
        }

        const fetchChartData = () => {
            try {
                let startDate = new Date();
                let queryConstraints = [orderBy("date", "desc")];

                if (timeRange === 'week') {
                    startDate.setDate(startDate.getDate() - 7);
                    queryConstraints.push(where("date", ">=", startDate));
                } else if (timeRange === 'month') {
                    startDate.setMonth(startDate.getMonth() - 1);
                    queryConstraints.push(where("date", ">=", startDate));
                }

                const q = query(collection(db, "wallet_transactions"), ...queryConstraints);

                const unsubscribe = onSnapshot(q, (snapshot) => {
                    const list = [];
                    snapshot.forEach((doc) => list.push({ ...doc.data(), id: doc.id }));
                    setChartTransactions(list);
                });
                return () => unsubscribe();
            } catch (error) {
                console.error("Error fetching chart data:", error);
            }
        };
        const cleanup = fetchChartData();
        return cleanup;
    }, [timeRange]);


    useEffect(() => {
        setDataLoading(true);

        let startDate = new Date();
        let queryConstraints = [orderBy("date", "desc")];

        if (timeRange === 'week') {
            startDate.setDate(startDate.getDate() - 7);
            queryConstraints.push(where("date", ">=", startDate));
        } else if (timeRange === 'month') {
            startDate.setMonth(startDate.getMonth() - 1);
            queryConstraints.push(where("date", ">=", startDate));
        }

        const listQuery = query(collection(db, "wallet_transactions"), ...queryConstraints, limit(displayLimit));

        const unsubscribe = onSnapshot(listQuery, (snapshot) => {
            const list = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() });
            });
            setTransactions(list);
            setDataLoading(false);
        }, (error) => {
            console.error("Error fetching transactions: ", error);
            setDataLoading(false);
            showSnackbar("Failed to load transactions", true);
        });

        return () => unsubscribe();
    }, [timeRange, showSnackbar, displayLimit]);

    useEffect(() => {
        if (type === 'income') {
            setCategory(INCOME_CATEGORIES[0]);
        } else {
            setCategory(EXPENSE_CATEGORIES[0]);
        }
    }, [type]);

    const handleSave = useCallback(async () => {
        if (!hasPermission('manage_wallet')) {
            showSnackbar("Permission denied: Cannot manage wallet", true);
            return;
        }

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
            await WalletService.addTransaction({
                amount: numericAmount,
                description: description.trim(),
                category,
                type,
            });
            setVisible(false);
            setAmount('');
            setDescription('');
            const defaultType = 'expense';
            setType(defaultType);
            setCategory(EXPENSE_CATEGORIES[0]);

            if (Platform.OS !== 'web') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            showSnackbar("Transaction saved successfully");
        } catch (error) {
            console.error("Error adding transaction: ", error);
            showSnackbar("Could not save. Check your connection.", true);
        } finally {
            setLoading(false);
        }
    }, [amount, description, category, type, showSnackbar, hasPermission]);

    const handleDelete = useCallback(async (id) => {
        if (!hasPermission('manage_wallet')) {
            showSnackbar("Permission denied: Cannot delete transactions", true);
            return;
        }

        try {
            const docRef = doc(db, "wallet_transactions", id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                await WalletService.deleteTransaction(id, docSnap.data());
            }

            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            showSnackbar("Transaction deleted");
        } catch (error) {
            console.error("Error deleting transaction: ", error);
            showSnackbar("Failed to delete transaction", true);
        }
    }, [showSnackbar, hasPermission]);

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

            const dateObj = t.date?.toDate ? t.date.toDate() : new Date();
            const dateString = dateObj.toLocaleDateString().toLowerCase();
            const dateStringFull = dateObj.toLocaleDateString(undefined, { dateStyle: 'long' }).toLowerCase();

            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const isToday = dateObj.toDateString() === today.toDateString();
            const isYesterday = dateObj.toDateString() === yesterday.toDateString();

            const matchesSearch = !query ||
                (t.description && t.description.toLowerCase().includes(query)) ||
                (t.category && t.category.toLowerCase().includes(query)) ||
                (t.amount && t.amount.toString().includes(query)) ||
                (t.type && t.type.toLowerCase().includes(query)) ||
                (dateString.includes(query)) ||
                (dateStringFull.includes(query)) ||
                (dateObj.toDateString().toLowerCase().includes(query)) ||
                (query === 'today' && isToday) ||
                (query === 'yesterday' && isYesterday);

            return matchesType && matchesSearch;
        });
    }, [transactions, filterType, searchQuery]);

    const sections = useMemo(() => {
        const groups = filteredTransactions.reduce((acc, t) => {
            const dateObj = t.date?.toDate ? t.date.toDate() : new Date();
            const dateKey = dateObj.toDateString();

            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            let title = dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
            if (dateKey === today.toDateString()) title = "Today";
            else if (dateKey === yesterday.toDateString()) title = "Yesterday";

            if (!acc[dateKey]) {
                acc[dateKey] = { title, data: [] };
            }
            acc[dateKey].data.push(t);
            return acc;
        }, {});

        return Object.values(groups);
    }, [filteredTransactions]);

    const renderTransactionItem = useCallback(({ item }) => (
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
                <View style={{ flex: 1, marginLeft: 16, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Text variant="bodyLarge" style={{ fontWeight: '600', color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
                            {item.description}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text variant="bodySmall" style={{ color: theme.colors.outline, marginRight: 6 }}>{item.category}</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            • {item.date?.toDate ? item.date.toDate().toLocaleDateString() + ' • ' + item.date.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </Text>
                    </View>
                </View>
                <Text
                    variant="titleMedium"
                    style={{
                        fontWeight: 'bold',
                        color: item.type === 'income' ? theme.colors.primary : theme.colors.error,
                        textAlign: 'right',
                        minWidth: 80
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                >
                    {item.type === 'income' ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN')}
                </Text>
            </View>
        </TouchableOpacity>
    ), [theme, confirmDelete]);

    const ListHeader = useMemo(() => (
        <View style={{ paddingBottom: 16 }}>
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

            <Surface style={[styles.balanceCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 }}>NET WORTH</Text>
                {statsLoading ? (
                    <View style={{ height: 50, justifyContent: 'center', alignItems: 'flex-start' }}>
                        <ActivityIndicator size="small" />
                    </View>
                ) : (
                    <Text
                        variant="displayMedium"
                        style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginTop: 4, marginBottom: 24 }}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                        minimumFontScale={0.5}
                    >
                        ₹{globalStats.balance.toLocaleString('en-IN')}
                    </Text>
                )}

                <View style={styles.statsRow}>
                    <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <View style={[styles.statIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                            <Icon source="arrow-down-left" color={theme.colors.primary} size={20} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Income</Text>
                            {statsLoading ? (
                                <ActivityIndicator size="small" style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
                            ) : (
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} adjustsFontSizeToFit numberOfLines={1}>
                                    ₹{globalStats.income.toLocaleString('en-IN')}
                                </Text>
                            )}
                        </View>
                    </View>
                    <View style={[styles.statItem, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <View style={[styles.statIcon, { backgroundColor: theme.colors.errorContainer }]}>
                            <Icon source="arrow-up-right" color={theme.colors.error} size={20} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Expense</Text>
                            {statsLoading ? (
                                <ActivityIndicator size="small" style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
                            ) : (
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} adjustsFontSizeToFit numberOfLines={1}>
                                    ₹{globalStats.expense.toLocaleString('en-IN')}
                                </Text>
                            )}
                        </View>
                    </View>
                </View>
            </Surface>

            {
                ((filterType === 'all') && ((globalStats?.income || 0) > 0 || (globalStats?.expense || 0) > 0)) && (
                    <StatChart title="Cash Flow (All Time Accurate)" data={[
                        {
                            name: 'Income',
                            amount: globalStats.income || 0,
                            color: theme.colors.primary,
                            legendFontColor: theme.colors.onSurfaceVariant,
                            legendFontSize: 12
                        },
                        {
                            name: 'Expense',
                            amount: globalStats.expense || 0,
                            color: theme.colors.error,
                            legendFontColor: theme.colors.onSurfaceVariant,
                            legendFontSize: 12
                        }
                    ].sort((a, b) => b.amount - a.amount)} theme={theme} />
                )
            }

            {
                (filterType === 'expense' && itemStats.expenseItemsChart.length > 0) && (
                    <StatChart title={timeRange === 'all' ? "All Time Expenses" : "Top Recent Expenses"} data={itemStats.expenseItemsChart} theme={theme} />
                )
            }

            {
                (filterType === 'income' && itemStats.incomeItemsChart.length > 0) && (
                    <StatChart title={timeRange === 'all' ? "All Time Income" : "Top Recent Income"} data={itemStats.incomeItemsChart} theme={theme} />
                )
            }

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

            {
                filteredTransactions.length === 0 && (
                    <View style={{ alignItems: 'center', padding: 40, opacity: 0.5 }}>
                        <Icon source="wallet-outline" size={64} color={theme.colors.onSurfaceVariant} />
                        <Text variant="bodyLarge" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>No transactions found</Text>
                    </View>
                )
            }
        </View >
    ), [timeRange, globalStats, itemStats, theme, filterType, searchQuery, filteredTransactions.length, statsLoading]);

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
        <CRMLayout
            title="Wallet"
            navigation={navigation}
            scrollable={false}
            actions={<Appbar.Action icon="plus" onPress={() => setVisible(true)} />}
        >
            {dataLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" />
                </View>
            ) : (
                <ResponsiveContainer>
                    <SectionList
                        sections={sections}
                        renderItem={renderTransactionItem}
                        renderSectionHeader={({ section: { title } }) => (
                            <View style={{ paddingVertical: 8, paddingHorizontal: 4, marginTop: 8, backgroundColor: theme.colors.background }}>
                                <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: 'bold', textTransform: 'uppercase' }}>{title}</Text>
                            </View>
                        )}
                        ListFooterComponent={
                            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                <Button
                                    mode="text"
                                    onPress={() => setDisplayLimit(prev => prev + 20)}
                                    loading={dataLoading}
                                    textColor={theme.colors.secondary}
                                >
                                    Load More
                                </Button>
                            </View>
                        }
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.content}
                        ListHeaderComponent={ListHeader}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={20}
                        maxToRenderPerBatch={20}
                        windowSize={10}
                        removeClippedSubviews={Platform.OS === 'android'}
                        stickySectionHeadersEnabled={false}
                    />
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
        </CRMLayout>
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

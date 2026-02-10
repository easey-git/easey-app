import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { Text, useTheme, Surface, Appbar, Icon, Button, DataTable, TextInput, Snackbar, Modal, Portal, Divider, Chip, Avatar } from 'react-native-paper';
import { DatePickerInput, DatePickerModal } from 'react-native-paper-dates';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';
import { generatePaymentLink, verifyPayment, refundTransaction, getSettlementDetails, checkBinDetails, getPaymentHash, getTransactionDetails } from '../services/payuService';

const TABS = [
    { id: 'overview', label: 'Overview', icon: 'view-dashboard' },
    { id: 'transactions', label: 'Transactions', icon: 'format-list-bulleted' },
    { id: 'collect', label: 'Collect', icon: 'credit-card-plus' },
    { id: 'settlements', label: 'Settlements', icon: 'bank' },
    { id: 'utilities', label: 'Utilities', icon: 'tools' },
];

const PayUScreen = ({ navigation }) => {
    const theme = useTheme();
    const { hasPermission } = useAuth();
    const { width } = useWindowDimensions();
    const [activeTab, setActiveTab] = useState('overview');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    // --- CHART DATA STATE ---
    const [chartData, setChartData] = useState([{ value: 0, label: 'Mon' }, { value: 0, label: 'Tue' }, { value: 0, label: 'Wed' }, { value: 0, label: 'Thu' }, { value: 0, label: 'Fri' }, { value: 0, label: 'Sat' }, { value: 0, label: 'Sun' }]);
    const [totalVolume, setTotalVolume] = useState('0');
    const [successCount, setSuccessCount] = useState(0);
    const [recentTransactions, setRecentTransactions] = useState([]);

    // Transactions Tab State
    const [transactionsList, setTransactionsList] = useState([]);
    const [selectedStatus, setSelectedStatus] = useState(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 7)),
        endDate: new Date()
    });
    const [openDateRangePicker, setOpenDateRangePicker] = useState(false);

    // Collect State
    const [amount, setAmount] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [prodInfo, setProdInfo] = useState('');

    // Utilities State
    const [txnId, setTxnId] = useState('');
    const [bin, setBin] = useState('');
    const [binResult, setBinResult] = useState(null);
    const [verifyResult, setVerifyResult] = useState(null);

    // Settlements State
    const [settlementDate, setSettlementDate] = useState(new Date());
    const [settlementData, setSettlementData] = useState(null);

    // Refund State
    const [refundId, setRefundId] = useState('');
    const [refundAmt, setRefundAmt] = useState('');

    useEffect(() => {
        if (activeTab === 'overview') {
            fetchStats();
        } else if (activeTab === 'transactions') {
            handleFetchTransactions();
        }
    }, [activeTab]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // Enterprise: Fetch last 7 days volume
            const today = new Date();
            const lastWeek = new Date(today);
            lastWeek.setDate(today.getDate() - 7);

            const toStr = today.toISOString().split('T')[0];
            const fromStr = lastWeek.toISOString().split('T')[0];

            console.log(`Fetching PayU stats from ${fromStr} to ${toStr}`);
            const result = await getTransactionDetails(fromStr, toStr);
            console.log('Stats Result:', result);

            let transactions = [];
            // Parse different PayU response structures
            if (result.status === 1 || result.status === 'success') {
                const details = result.Transaction_Details || result.Transaction_details; // Handle case sensitivity

                if (Array.isArray(details)) {
                    transactions = details;
                } else if (details && typeof details === 'object') {
                    // Sometimes it's a map: { txnId1: {...}, txnId2: {...} }
                    transactions = Object.values(details);
                } else if (Array.isArray(result.data)) {
                    transactions = result.data; // Alternate format
                }
            }

            // Process Data for Chart
            const dailyMap = {};
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            let totalVol = 0;
            let successCnt = 0;

            // Initialize last 7 days map
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(new Date().getDate() - i);
                const dateKey = d.toISOString().split('T')[0];
                const dayLabel = days[d.getDay()];
                dailyMap[dateKey] = { label: dayLabel, value: 0, date: d, dataPointText: '' };
            }

            transactions.forEach(txn => {
                // Ensure successful transactions only
                if (txn.status === 'success' || txn.status === 'captured') {
                    const amt = parseFloat(txn.amt || txn.amount || 0);
                    // Date format from PayU is usually "YYYY-MM-DD HH:mm:ss"
                    const dateStr = txn.addedon || txn.date || txn.created_at;
                    if (dateStr) {
                        const datePart = dateStr.split(' ')[0]; // Extract YYYY-MM-DD
                        if (dailyMap[datePart]) {
                            dailyMap[datePart].value += amt;
                            successCnt++;
                            totalVol += amt;
                        }
                    }
                }
            });

            // Convert map to sorted array
            const chartDataArray = Object.values(dailyMap)
                .sort((a, b) => a.date - b.date)
                .map(item => ({
                    value: item.value,
                    label: item.label,
                    dataPointText: item.value > 0 ? (item.value / 1000).toFixed(1) + 'k' : ''
                }));

            setChartData(chartDataArray);
            setTotalVolume(totalVol.toLocaleString('en-IN'));
            setSuccessCount(successCnt);

            // Set Recent Transactions (Sort by date descending)
            const sortedTxns = transactions
                .filter(t => t.status === 'success' || t.status === 'captured')
                .sort((a, b) => new Date(b.addedon || b.date) - new Date(a.addedon || a.date))
                .slice(0, 5); // Take top 5

            setRecentTransactions(sortedTxns);

        } catch (e) {
            console.error('Fetch Stats Error:', e);
            showSnackbar('Failed to fetch real stats: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!hasPermission('access_wallet')) {
        return <AccessDenied title="Restricted" message="Enterprise Access Required." />;
    }

    const showSnackbar = (msg) => {
        setSnackbarMessage(msg);
        setSnackbarVisible(true);
    };

    // --- ACTIONS ---

    const handleGenerateLink = async () => {
        if (!amount || !phone) return showSnackbar('Amount and Phone are required');
        setLoading(true);
        try {
            const result = await generatePaymentLink({
                totalPrice: amount,
                customerName: customerName || 'Guest',
                email: email,
                phone: phone,
                orderNumber: prodInfo || `ADHOC_${Date.now()}`
            });
            if (result.status === 'success' || result.msg?.includes('success')) {
                showSnackbar(`Link Sent! Txn ID: ${result.txnid}`);
                setAmount(''); setPhone('');
            } else {
                showSnackbar(result.msg || 'Failed');
            }
        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGetHash = async () => {
        if (!amount || !phone) return showSnackbar('Amount and Phone required for Hash');
        setLoading(true);
        try {
            const result = await getPaymentHash({
                txnid: `txn_${Date.now()}`,
                amount: amount,
                productinfo: prodInfo || 'Enterprise Order',
                firstname: customerName || 'User',
                email: email || 'user@example.com',
                phone: phone
            });
            Alert.alert('Enterprise Hash Generated', `Hash: ${result.hash}\n\nUse this hash to POST to PayU from your custom checkout page.`);
        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!txnId) return;
        setLoading(true);
        try {
            const result = await verifyPayment(txnId);
            setVerifyResult(result.transaction_details?.[txnId]);
            showSnackbar('Verification Complete');
        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCheckBin = async () => {
        if (bin.length < 6) return showSnackbar('Enter first 6 digits');
        setLoading(true);
        try {
            const result = await checkBinDetails(bin);
            setBinResult(result);
        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSettlement = async () => {
        setLoading(true);
        try {
            const dateStr = settlementDate.toISOString().split('T')[0];
            const result = await getSettlementDetails(dateStr);
            setSettlementData(result);
            showSnackbar('Settlements Fetched');
        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefund = async () => {
        if (!refundId || !refundAmt) return;
        setLoading(true);
        try {
            const result = await refundTransaction(refundId, refundAmt);
            Alert.alert('Refund Status', JSON.stringify(result));
        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFetchTransactions = async () => {
        setLoading(true);
        setTransactionsList([]);
        try {
            const start = new Date(dateRange.startDate);
            const end = new Date(dateRange.endDate);
            const chunks = [];

            // PayU Limit is 7 days at a time. Stitch requests.
            let current = new Date(start);
            while (current <= end) {
                const chunkStart = new Date(current);
                const chunkEnd = new Date(current);
                chunkEnd.setDate(chunkEnd.getDate() + 6);

                if (chunkEnd > end) {
                    chunkEnd.setTime(end.getTime());
                }

                chunks.push({
                    from: chunkStart.toISOString().split('T')[0],
                    to: chunkEnd.toISOString().split('T')[0]
                });

                // Move to next chunk
                current.setDate(current.getDate() + 7);
            }

            console.log(`Fetching Transactions in ${chunks.length} chunks`, chunks);

            // Execute Requests in Parallel
            const promises = chunks.map(chunk => getTransactionDetails(chunk.from, chunk.to));
            const results = await Promise.all(promises);

            let combinedTxns = [];
            let errorMsg = '';

            results.forEach((result, index) => {
                // console.log(`Chunk ${index} Result:`, result);

                if (result.status === 1 || result.status === 'success') {
                    const details = result.Transaction_Details || result.Transaction_details;

                    if (Array.isArray(details)) {
                        combinedTxns = [...combinedTxns, ...details];
                    } else if (details && typeof details === 'object') {
                        combinedTxns = [...combinedTxns, ...Object.values(details)];
                    } else if (Array.isArray(result.data)) {
                        combinedTxns = [...combinedTxns, ...result.data];
                    }
                } else {
                    if (result.msg) errorMsg = result.msg;
                }
            });

            // Sort by Date Descending
            combinedTxns.sort((a, b) => new Date(b.addedon || b.date) - new Date(a.addedon || a.date));

            // Remove duplicates
            const uniqueTxns = Array.from(new Map(combinedTxns.map(item => [item.txnid, item])).values());

            setTransactionsList(uniqueTxns);

            if (uniqueTxns.length === 0) {
                showSnackbar(errorMsg || 'No transactions found for this range.');
            } else if (errorMsg && chunks.length > 1 && uniqueTxns.length > 0) {
                showSnackbar(`Loaded ${uniqueTxns.length} txns. Some ranges had no data.`);
            }

        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    // --- RENDERERS ---

    const renderOverview = () => (
        <View style={{ gap: 16 }}>
            {/* Stats Header */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
                <Surface style={[styles.statCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={2}>
                    <Icon source="chart-line" size={32} color={theme.colors.onPrimaryContainer} />
                    <Text variant="displaySmall" style={{ marginTop: 8, color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}>₹{totalVolume}</Text>
                    <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer }}>Last 7 Days Volume</Text>
                </Surface>
                <Surface style={[styles.statCard, { backgroundColor: theme.colors.secondaryContainer }]} elevation={2}>
                    <Icon source="check-circle" size={32} color={theme.colors.onSecondaryContainer} />
                    <Text variant="displaySmall" style={{ marginTop: 8, color: theme.colors.onSecondaryContainer, fontWeight: 'bold' }}>{successCount}</Text>
                    <Text variant="labelLarge" style={{ color: theme.colors.onSecondaryContainer }}>Transactions</Text>
                </Surface>
            </View>

            {/* Chart Section */}
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1, paddingBottom: 20 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                    <Icon source="poll" size={20} color={theme.colors.primary} />
                    <Text variant="titleMedium" style={{ marginLeft: 8, fontWeight: 'bold' }}>Revenue Trend</Text>
                </View>
                <View style={{ alignItems: 'center', overflow: 'hidden' }}>
                    <LineChart
                        data={chartData}
                        color={theme.colors.primary}
                        thickness={3}
                        dataPointsColor={theme.colors.primary}
                        textColor={theme.colors.onSurface}
                        yAxisTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        xAxisLabelTextStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                        hideRules
                        hideYAxisText
                        width={width - 80}
                        height={180}
                        initialSpacing={20}
                        endSpacing={20}
                        curved
                        isAnimated
                    />
                </View>
            </Surface>

            {/* Recent Transactions */}
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1, padding: 0, overflow: 'hidden' }]}>
                <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon source="history" size={20} color={theme.colors.primary} />
                        <Text variant="titleMedium" style={{ marginLeft: 8, fontWeight: 'bold' }}>Recent Transactions</Text>
                    </View>
                </View>

                {recentTransactions.length > 0 ? (
                    <DataTable>
                        <DataTable.Header>
                            <DataTable.Title style={{ flex: 2 }}>ID / Name</DataTable.Title>
                            <DataTable.Title numeric style={{ flex: 1 }}>Amount</DataTable.Title>
                            <DataTable.Title numeric style={{ flex: 1.5 }}>Date</DataTable.Title>
                        </DataTable.Header>

                        {recentTransactions.map((txn, index) => (
                            <DataTable.Row key={txn.txnid || index}>
                                <DataTable.Cell style={{ flex: 2 }}>
                                    <View>
                                        <Text variant="bodySmall" numberOfLines={1} style={{ fontWeight: 'bold' }}>{txn.firstname || 'Guest'}</Text>
                                        <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.outline }}>{txn.txnid}</Text>
                                    </View>
                                </DataTable.Cell>
                                <DataTable.Cell numeric style={{ flex: 1 }}>
                                    <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>₹{parseFloat(txn.amt || txn.amount).toFixed(0)}</Text>
                                </DataTable.Cell>
                                <DataTable.Cell numeric style={{ flex: 1.5 }}>
                                    <Text variant="bodySmall" numberOfLines={1}>{txn.addedon ? txn.addedon.split(' ')[0] : 'N/A'}</Text>
                                </DataTable.Cell>
                            </DataTable.Row>
                        ))}
                    </DataTable>
                ) : (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>No recent successful transactions found.</Text>
                    </View>
                )}
            </Surface>

            {/* Quick Actions */}
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <Icon source="lightning-bolt" size={20} color={theme.colors.tertiary} />
                    <Text variant="titleMedium" style={{ marginLeft: 8, fontWeight: 'bold' }}>Quick Actions</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Chip icon="link" onPress={() => setActiveTab('collect')} style={{ backgroundColor: theme.colors.secondaryContainer }}>Create Link</Chip>
                    <Chip icon="bank" onPress={() => setActiveTab('settlements')} style={{ backgroundColor: theme.colors.secondaryContainer }}>Check Settlement</Chip>
                    <Chip icon="refresh" onPress={() => setActiveTab('utilities')} style={{ backgroundColor: theme.colors.secondaryContainer }}>Refund</Chip>
                </View>
            </Surface>
        </View>
    );

    const renderTransactions = () => (
        <View style={{ gap: 16 }}>
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
                <Text variant="titleMedium" style={{ marginBottom: 16 }}>Transaction History</Text>

                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                        <Button
                            mode="outlined"
                            onPress={() => setOpenDateRangePicker(true)}
                            icon="calendar-range"
                            contentStyle={{ justifyContent: 'flex-start', paddingVertical: 6 }}
                            style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }}
                            labelStyle={{ color: theme.colors.onSurface }}
                        >
                            {dateRange.startDate ? `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}` : 'Select Date Range'}
                        </Button>
                    </View>

                    <View>
                        <Button mode="contained" onPress={handleFetchTransactions} loading={loading} icon="magnify">
                            Search
                        </Button>
                    </View>
                </View>

                <Portal>
                    <DatePickerModal
                        locale="en"
                        mode="range"
                        visible={openDateRangePicker}
                        onDismiss={onDismissRange}
                        startDate={dateRange.startDate}
                        endDate={dateRange.endDate}
                        onConfirm={onConfirmRange}
                        saveLabel="Apply"
                        label="Select Period"
                        animationType="slide"
                    />
                </Portal>
            </Surface>




            {
                transactionsList.length > 0 && (
                    <View>
                        {/* Status Filters */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                            <Chip
                                selected={selectedStatus === null}
                                onPress={() => setSelectedStatus(null)}
                                showSelectedOverlay
                                style={{ backgroundColor: selectedStatus === null ? theme.colors.primaryContainer : theme.colors.surface }}
                            >
                                All
                            </Chip>
                            {[...new Set(transactionsList.map(t => t.status))].filter(Boolean).map(status => (
                                <Chip
                                    key={status}
                                    selected={selectedStatus === status}
                                    onPress={() => setSelectedStatus(status)}
                                    showSelectedOverlay
                                    style={{ backgroundColor: selectedStatus === status ? theme.colors.primaryContainer : theme.colors.surface }}
                                >
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                </Chip>
                            ))}
                        </ScrollView>

                        <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1, padding: 0, overflow: 'hidden' }]}>
                            <DataTable>
                                <DataTable.Header>
                                    <DataTable.Title style={{ flex: 2.5 }}>ID</DataTable.Title>
                                    <DataTable.Title style={{ flex: 1.5 }}>Date</DataTable.Title>
                                    <DataTable.Title numeric style={{ flex: 1 }}>Amount</DataTable.Title>
                                    <DataTable.Title style={{ flex: 1.5, justifyContent: 'center' }}>Status</DataTable.Title>
                                    <DataTable.Title numeric style={{ flex: 1.5 }}>Customer</DataTable.Title>
                                </DataTable.Header>

                                {transactionsList
                                    .filter(txn => selectedStatus === null || txn.status === selectedStatus)
                                    .map((txn, index) => (
                                        <DataTable.Row key={txn.txnid || index}>
                                            <DataTable.Cell style={{ flex: 2.5 }}>
                                                <Text variant="labelSmall" selectable numberOfLines={1} ellipsizeMode="middle">{txn.txnid}</Text>
                                            </DataTable.Cell>
                                            <DataTable.Cell style={{ flex: 1.5 }}>
                                                <Text variant="bodySmall">{txn.addedon ? txn.addedon.split(' ')[0] : 'N/A'}</Text>
                                            </DataTable.Cell>
                                            <DataTable.Cell numeric style={{ flex: 1 }}>
                                                <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>₹{parseFloat(txn.amt || txn.amount).toFixed(0)}</Text>
                                            </DataTable.Cell>
                                            <DataTable.Cell style={{ flex: 1.5, justifyContent: 'center' }}>
                                                <Chip
                                                    mode="flat"
                                                    compact
                                                    textStyle={{ fontSize: 11, marginVertical: 0, marginHorizontal: 2, lineHeight: 14 }}
                                                    style={{
                                                        backgroundColor: (txn.status === 'success' || txn.status === 'captured') ? theme.colors.primaryContainer : theme.colors.errorContainer,
                                                        height: 24,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: 12
                                                    }}
                                                >
                                                    {(txn.status === 'success' || txn.status === 'captured') ? 'Success' : txn.status}
                                                </Chip>
                                            </DataTable.Cell>
                                            <DataTable.Cell numeric style={{ flex: 1.5 }}>
                                                <Text variant="bodySmall" numberOfLines={1}>{txn.firstname || 'Guest'}</Text>
                                            </DataTable.Cell>
                                        </DataTable.Row>
                                    ))}
                            </DataTable>
                        </Surface>
                    </View>
                )
            }
        </View >
    );

    const renderCollect = () => (
        <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
            <Text variant="titleLarge" style={{ marginBottom: 16, fontWeight: 'bold' }}>Collect Payment</Text>

            <TextInput label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="numeric" mode="outlined" style={[styles.input, { backgroundColor: theme.colors.surface }]} />
            <TextInput label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" mode="outlined" style={[styles.input, { backgroundColor: theme.colors.surface }]} />
            <TextInput label="Email (Optional)" value={email} onChangeText={setEmail} keyboardType="email-address" mode="outlined" style={[styles.input, { backgroundColor: theme.colors.surface }]} />
            <TextInput label="Customer Name" value={customerName} onChangeText={setCustomerName} mode="outlined" style={[styles.input, { backgroundColor: theme.colors.surface }]} />
            <TextInput label="Product Info / Order ID" value={prodInfo} onChangeText={setProdInfo} mode="outlined" style={[styles.input, { backgroundColor: theme.colors.surface }]} />

            <Divider style={{ marginVertical: 16 }} />

            <View style={{ gap: 12 }}>
                <Button mode="contained" onPress={handleGenerateLink} loading={loading} icon="email">
                    Send Payment Link (invoice)
                </Button>
                <Button mode="contained-tonal" onPress={handleGetHash} loading={loading} icon="code-braces">
                    Get Enterprise Hash (For App Checkout)
                </Button>
            </View>
        </Surface>
    );

    const renderSettlements = () => (
        <View style={{ gap: 16 }}>
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>Check Settlements</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <DatePickerInput
                        locale="en"
                        label="Date"
                        value={settlementDate}
                        onChange={(d) => setSettlementDate(d)}
                        inputMode="start"
                        style={{ flex: 1, backgroundColor: theme.colors.surface }}
                        mode="outlined"
                        withModal={false}
                    />
                    <Button mode="contained" onPress={handleSettlement} loading={loading} style={{ marginTop: 6 }}>
                        Fetch
                    </Button>
                </View>
            </Surface>

            {settlementData && (
                <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1, padding: 0, overflow: 'hidden' }]}>
                    {/* Handle "Txn_details" from API response */}
                    {(settlementData.Txn_details && settlementData.Txn_details.length > 0) ? (
                        <ScrollView horizontal>
                            <DataTable style={{ minWidth: 350 }}>
                                <DataTable.Header>
                                    <DataTable.Title>Txn ID</DataTable.Title>
                                    <DataTable.Title numeric>Amount</DataTable.Title>
                                    <DataTable.Title>Date</DataTable.Title>
                                </DataTable.Header>
                                {/* Limit to 10 for display if list is huge */}
                                {settlementData.Txn_details.slice(0, 20).map((txn, i) => (
                                    <DataTable.Row key={i}>
                                        <DataTable.Cell style={{ flex: 2 }}>{txn.txnid || txn.mer_txnid || 'N/A'}</DataTable.Cell>
                                        <DataTable.Cell numeric style={{ flex: 1 }}>₹{txn.amount || txn.mer_amount || 0}</DataTable.Cell>
                                        <DataTable.Cell style={{ flex: 1.5 }}>{txn.settlement_date || txn.date || 'N/A'}</DataTable.Cell>
                                    </DataTable.Row>
                                ))}
                            </DataTable>
                        </ScrollView>
                    ) : (
                        <View style={{ alignItems: 'center', padding: 32 }}>
                            <Icon source="bank-check" size={48} color={theme.colors.outline} />
                            <Text variant="titleMedium" style={{ marginTop: 16, color: theme.colors.onSurface }}>
                                {settlementData.msg || "No settlements found for this date."}
                            </Text>
                            <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant }}>
                                Status: {settlementData.status === "1" ? "Success" : "Pending/Failed"}
                            </Text>
                        </View>
                    )}
                </Surface>
            )}
        </View>
    );

    const renderUtilities = () => (
        <View style={{ gap: 16 }}>
            {/* Verify */}
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>Verify Transaction</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput label="Txn ID" value={txnId} onChangeText={setTxnId} mode="outlined" style={{ flex: 1, backgroundColor: theme.colors.surface }} density="compact" />
                    <Button mode="contained-tonal" onPress={handleVerify} loading={loading} style={{ justifyContent: 'center' }}>Check</Button>
                </View>
                {verifyResult && (
                    <View style={{ marginTop: 12, padding: 8, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                        <Text style={{ color: theme.colors.onSurfaceVariant }}>Status: <Text style={{ fontWeight: 'bold', color: verifyResult.status === 'success' ? 'green' : 'red' }}>{verifyResult.status}</Text></Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant }}>Amount: ₹{verifyResult.amt}</Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant }}>Msg: {verifyResult.error_Message}</Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant }}>Bank Ref: {verifyResult.bank_ref_num}</Text>
                    </View>
                )}
            </Surface>

            {/* Refund */}
            <Surface style={[styles.card, { borderColor: theme.colors.error, borderWidth: 1, backgroundColor: theme.colors.elevation.level1 }]}>
                <Text variant="titleMedium" style={{ marginBottom: 12, color: theme.colors.error }}>Process Refund</Text>
                <TextInput label="PayU ID (MIHpayid)" value={refundId} onChangeText={setRefundId} mode="outlined" style={[styles.input, { backgroundColor: theme.colors.surface }]} density="compact" />
                <TextInput label="Amount" value={refundAmt} onChangeText={setRefundAmt} keyboardType="numeric" mode="outlined" style={[styles.input, { backgroundColor: theme.colors.surface }]} density="compact" />
                <Button mode="contained" buttonColor={theme.colors.error} onPress={handleRefund} loading={loading}>
                    Initiate Refund
                </Button>
            </Surface>

            {/* BIN Check */}
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>BIN Checker</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput label="First 6 Digits" value={bin} onChangeText={setBin} keyboardType="numeric" maxLength={6} mode="outlined" style={{ flex: 1, backgroundColor: theme.colors.surface }} density="compact" />
                    <Button mode="contained-tonal" onPress={handleCheckBin} loading={loading} style={{ justifyContent: 'center' }}>Check</Button>
                </View>
                {binResult && (
                    <Text style={{ marginTop: 8, color: theme.colors.onSurface }}>{JSON.stringify(binResult)}</Text>
                )}
            </Surface>
        </View>
    );



    // --- HELPERS ---

    const onDismissRange = React.useCallback(() => {
        setOpenDateRangePicker(false);
    }, [setOpenDateRangePicker]);

    const onConfirmRange = React.useCallback(
        ({ startDate, endDate }) => {
            setOpenDateRangePicker(false);
            setDateRange({ startDate, endDate });
        },
        [setOpenDateRangePicker, setDateRange]
    );

    const formatDate = (date) => {
        if (!date) return '';
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // --- MAIN RENDER ---
    return (
        <CRMLayout
            title="PayU Enterprise"
            navigation={navigation}
            scrollable={false}
            fullWidth={true}
        >
            <View style={styles.container}>
                {/* Horizontal Tab Bar */}
                <View style={[styles.tabContainer, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
                        {TABS.map(tab => {
                            const isActive = activeTab === tab.id;
                            return (
                                <TouchableOpacity
                                    key={tab.id}
                                    onPress={() => setActiveTab(tab.id)}
                                    style={[styles.tabItem, isActive && { backgroundColor: theme.colors.primaryContainer }]}
                                >
                                    <Icon
                                        source={tab.icon}
                                        size={20}
                                        color={isActive ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant}
                                    />
                                    <Text style={{
                                        marginLeft: 8,
                                        color: isActive ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
                                        fontWeight: isActive ? 'bold' : 'normal'
                                    }}>
                                        {tab.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Content Area */}
                <ScrollView
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { fetchStats(); setTimeout(() => setRefreshing(false), 1000); }} />}
                >
                    {activeTab === 'overview' && renderOverview()}
                    {activeTab === 'transactions' && renderTransactions()}
                    {activeTab === 'collect' && renderCollect()}
                    {activeTab === 'settlements' && renderSettlements()}
                    {activeTab === 'utilities' && renderUtilities()}

                </ScrollView>
            </View>

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={3000}
                action={{ label: 'Close', onPress: () => setSnackbarVisible(false) }}
            >
                {snackbarMessage}
            </Snackbar>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    tabContainer: {
        borderBottomWidth: 1,
    },
    tabScroll: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    tabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 24,
        marginRight: 8,
    },
    content: {
        padding: 16,
        paddingBottom: 48
    },
    statCard: {
        flex: 1,
        padding: 20,
        borderRadius: 16,
        alignItems: 'flex-start',
    },
    card: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 4,
        elevation: 1
    },
    input: {
        marginBottom: 12,
    }
});

export const PayUScreenComponent = PayUScreen;
export { PayUScreen };

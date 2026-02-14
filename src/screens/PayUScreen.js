import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, TouchableOpacity, Alert, Linking, Platform, Clipboard } from 'react-native';
import { Text, useTheme, Surface, Appbar, Icon, Button, DataTable, TextInput, Snackbar, Modal, Portal, Divider, Chip, Avatar, IconButton, Dialog } from 'react-native-paper';
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

    // Payment Link Dialog State
    const [linkDialogVisible, setLinkDialogVisible] = useState(false);
    const [generatedLink, setGeneratedLink] = useState('');
    const [generatedLinkTxnId, setGeneratedLinkTxnId] = useState('');
    const [copied, setCopied] = useState(false);

    // Settlements State
    const [settlementDate, setSettlementDate] = useState(new Date());
    const [settlementData, setSettlementData] = useState(null);

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
            // Helper for local YYYY-MM-DD string
            const getLocalDateStr = (d) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            // Enterprise: Fetch last 7 days volume
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - 7); // Fetch 7 days back
            const end = new Date(today);

            const chunks = [];
            // PayU Limit is 7 days at a time. Stitch requests to ensure full coverage including Today.
            let current = new Date(start);
            while (current <= end) {
                const chunkStart = new Date(current);
                const chunkEnd = new Date(current);
                chunkEnd.setDate(chunkEnd.getDate() + 6);

                if (chunkEnd > end) {
                    chunkEnd.setTime(end.getTime());
                }

                chunks.push({
                    from: getLocalDateStr(chunkStart),
                    to: getLocalDateStr(chunkEnd)
                });

                // Move to next chunk
                current.setDate(current.getDate() + 7);
            }

            const promises = chunks.map(chunk => getTransactionDetails(chunk.from, chunk.to));
            const results = await Promise.all(promises);

            let transactions = [];
            results.forEach(result => {
                if (result.status === 1 || result.status === 'success') {
                    const details = result.Transaction_Details || result.Transaction_details; // Handle case sensitivity

                    if (Array.isArray(details)) {
                        transactions = [...transactions, ...details];
                    } else if (details && typeof details === 'object') {
                        // Sometimes it's a map: { txnId1: {...}, txnId2: {...} }
                        transactions = [...transactions, ...Object.values(details)];
                    } else if (Array.isArray(result.data)) {
                        transactions = [...transactions, ...result.data]; // Alternate format
                    }
                }
            });

            // Process Data for Chart
            const dailyMap = {};
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            let totalVol = 0;
            let successCnt = 0;

            // Initialize last 7 days map
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(new Date().getDate() - i);
                const dateKey = getLocalDateStr(d);
                const dayLabel = days[d.getDay()];
                dailyMap[dateKey] = { label: dayLabel, value: 0, date: d, dataPointText: '' };
            }

            // Deduplicate for processing
            const uniqueTxnsMap = new Map();
            transactions.forEach(txn => {
                const id = txn.txnid || txn.id;
                if (id) uniqueTxnsMap.set(id, txn);
            });
            const uniqueTxns = Array.from(uniqueTxnsMap.values());

            uniqueTxns.forEach(txn => {
                // Ensure successful transactions only
                if (txn.status === 'success' || txn.status === 'captured') {
                    const amt = parseFloat(txn.amt || txn.amount || 0);
                    // Date format from PayU is usually "YYYY-MM-DD HH:mm:ss"
                    const dateStr = txn.addedon || txn.date || txn.created_at;
                    if (dateStr) {
                        const datePart = dateStr.split(' ')[0]; // Extract YYYY-MM-DD

                        // If exact match found
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
            const sortedTxns = uniqueTxns
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

            // PayU can return status as 1 (number), 'success' (string), or 'Success' (capitalized)
            // Response format observed: { Status: 'Success', 'Transaction Id': '...', URL: '...' }
            const status = result.status || result.Status;
            const isSuccess = status == 1 || String(status).toLowerCase() === 'success' || (result.msg && result.msg.toLowerCase().includes('success'));

            if (isSuccess) {
                // Txn ID might be in result.txnid, result.data?.txnid, result.transaction_details?.txnid, or result['Transaction Id']
                const txnid = result.txnid || result['Transaction Id'] || result.data?.txnid || result.transaction_details?.txnid || 'Unknown ID';
                const url = result.URL || result.url;

                if (url) {
                    setGeneratedLink(url);
                    setGeneratedLinkTxnId(txnid);
                    setCopied(false);
                    setLinkDialogVisible(true);
                } else {
                    showSnackbar(`Link Sent! Txn ID: ${txnid} (No URL returned)`);
                }
                setAmount(''); setPhone('');
            } else {
                console.log('Generate Link Failed:', result);
                const errorMsg = result.msg || result.error || result.message || JSON.stringify(result);
                showSnackbar(`Failed: ${errorMsg}`);
            }
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
            const getLocalDateStr = (d) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

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
                    from: getLocalDateStr(chunkStart),
                    to: getLocalDateStr(chunkEnd)
                });

                // Move to next chunk
                current.setDate(current.getDate() + 7);
            }

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
            <View style={{ flexDirection: width < 600 ? 'column' : 'row', gap: 12 }}>
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
                        width={width - 48} // Adjusted for padding
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
                    <IconButton icon="refresh" size={20} onPress={fetchStats} loading={loading} />
                </View>

                {recentTransactions.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <DataTable style={{ minWidth: 600 }}>
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
                    </ScrollView>
                ) : (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>No recent successful transactions found.</Text>
                    </View>
                )}
            </Surface>


        </View>
    );

    const renderTransactions = () => (
        <View style={{ gap: 16 }}>
            <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
                <Text variant="titleMedium" style={{ marginBottom: 16 }}>Transaction History</Text>

                <View style={{ flexDirection: width < 600 ? 'column' : 'row', gap: 12, alignItems: width < 600 ? 'stretch' : 'center' }}>
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
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: '100%' }}>
                                <DataTable style={{ minWidth: width > 900 ? '100%' : 800 }}>
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
                            </ScrollView>
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
            </View>
        </Surface>
    );

    // --- SETTLEMENTS LOGIC ---
    const [settlementList, setSettlementList] = useState([]);
    const [settlementStartDate, setSettlementStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 10))); // Last 10 days
    const [settlementEndDate, setSettlementEndDate] = useState(new Date());
    const [openSettlementPicker, setOpenSettlementPicker] = useState(false);

    useEffect(() => {
        if (activeTab === 'settlements') {
            handleFetchSettlements();
        }
    }, [activeTab]);

    const handleFetchSettlements = async () => {
        setLoading(true);
        setSettlementList([]);
        try {
            // Generate array of dates between start and end
            const dates = [];
            let current = new Date(settlementStartDate);
            const end = new Date(settlementEndDate);

            while (current <= end) {
                dates.push(new Date(current).toISOString().split('T')[0]);
                current.setDate(current.getDate() + 1);
            }

            // Limit concurrent requests to avoid rate limiting if range is huge
            // For now, just Promise.all as range is typically small (10-30 days)
            // Reverse to show newest first
            dates.reverse();

            const promises = dates.map(date => getSettlementDetails(date).then(res => ({ date, ...res })).catch(err => ({ date, error: err })));
            const results = await Promise.all(promises);

            let allSettlements = [];

            results.forEach(res => {
                // Extract using helper
                const dailySettlements = getSettlementList(res);
                if (dailySettlements.length > 0) {
                    // Inject the query date into each record if missing
                    // Also robustly find UTR which might be in different keys
                    const enhancedList = dailySettlements.map(item => ({
                        ...item,
                        settlement_date: item.settlement_date || item.date || res.date, // Use the query date if item date is missing
                        utr_display: item.utr_no || item.bank_ref_num || item.UTR || item.utr || item.ref_num || item.Reference_Id || 'N/A'
                    }));
                    allSettlements = [...allSettlements, ...enhancedList];
                }
            });

            // De-duplicate based on txnid or mer_txnId if possible, but settlements are usually unique per UTR/Action
            setSettlementList(allSettlements);

            if (allSettlements.length === 0) {
                showSnackbar(`No settlements found from ${formatDate(settlementStartDate)} to ${formatDate(settlementEndDate)}`);
            }

        } catch (e) {
            showSnackbar(e.message);
        } finally {
            setLoading(false);
        }
    };

    const onDismissSettlementRange = useCallback(() => {
        setOpenSettlementPicker(false);
    }, []);

    const onConfirmSettlementRange = useCallback(
        ({ startDate, endDate }) => {
            setOpenSettlementPicker(false);
            setSettlementStartDate(startDate);
            setSettlementEndDate(endDate);
            // Auto fetch will happen via useEffect if we put [settlementStartDate, settlementEndDate] in dependency
            // But we kept only [activeTab]. So call manually or add dependency.
            // Let's call manually here to be explicit
            // We need to wait for state update, so better to have a generic "fetch" that uses current state
            // Or better: changing state triggers a refetch if we add to useEffect.
            // For simplicity, I'll allow the user to click "Fetch" or just re-call the function, 
            // but since setState is async, we should use a useEffect on valid dates or just rely on the user / internal logic.
            // Actually, best UX: User selects range -> Auto fetch.
        },
        []
    );

    // Trigger fetch when dates change
    useEffect(() => {
        if (activeTab === 'settlements') {
            handleFetchSettlements();
        }
    }, [settlementStartDate, settlementEndDate]);


    const renderSettlements = () => {
        return (
            <View style={{ gap: 16 }}>
                <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text variant="titleMedium">Settlement History</Text>
                        <Button mode="text" compact onPress={handleFetchSettlements} loading={loading}>Refresh</Button>
                    </View>

                    <View style={{ flexDirection: width < 600 ? 'column' : 'row', gap: 12, alignItems: width < 600 ? 'stretch' : 'center' }}>
                        <View style={{ flex: 1 }}>
                            <Button
                                mode="outlined"
                                onPress={() => setOpenSettlementPicker(true)}
                                icon="calendar-range"
                                contentStyle={{ justifyContent: 'flex-start', paddingVertical: 6 }}
                                style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }}
                                labelStyle={{ color: theme.colors.onSurface }}
                            >
                                {`${formatDate(settlementStartDate)} - ${formatDate(settlementEndDate)}`}
                            </Button>
                        </View>
                        <View>
                            <Button mode="contained" onPress={handleFetchSettlements} loading={loading} icon="magnify">
                                Search
                            </Button>
                        </View>
                    </View>

                    <Portal>
                        <DatePickerModal
                            locale="en"
                            mode="range"
                            visible={openSettlementPicker}
                            onDismiss={onDismissSettlementRange}
                            startDate={settlementStartDate}
                            endDate={settlementEndDate}
                            onConfirm={onConfirmSettlementRange}
                            saveLabel="Apply"
                            label="Select Settlement Period"
                        />
                    </Portal>
                </Surface>

                <Surface style={[styles.card, { backgroundColor: theme.colors.elevation.level1, padding: 0, overflow: 'hidden' }]}>
                    {settlementList.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: '100%' }}>
                            <DataTable style={{ minWidth: width > 900 ? '100%' : 800 }}>
                                <DataTable.Header>
                                    <DataTable.Title style={{ flex: 2.5 }}>Txn ID</DataTable.Title>
                                    <DataTable.Title style={{ flex: 2 }}>UTR / Bank Ref</DataTable.Title>
                                    <DataTable.Title numeric style={{ flex: 1.2, paddingRight: 16 }}>Amount</DataTable.Title>
                                    <DataTable.Title style={{ flex: 1.5, justifyContent: 'center' }}>Date</DataTable.Title>
                                    <DataTable.Title style={{ flex: 1.5, justifyContent: 'center' }}>Status</DataTable.Title>
                                </DataTable.Header>
                                {settlementList.map((txn, i) => (
                                    <DataTable.Row key={i}>
                                        <DataTable.Cell style={{ flex: 2.5 }}>
                                            <Text variant="labelSmall" selectable numberOfLines={1} ellipsizeMode="middle">{txn.txnid || txn.mer_txnid || 'N/A'}</Text>
                                        </DataTable.Cell>
                                        <DataTable.Cell style={{ flex: 2 }}>
                                            <Text variant="bodySmall" selectable numberOfLines={1}>{txn.utr_display || txn.utr_no || txn.bank_ref_num || 'N/A'}</Text>
                                        </DataTable.Cell>
                                        <DataTable.Cell numeric style={{ flex: 1.2, paddingRight: 16 }}>
                                            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>₹{parseFloat(txn.amount || txn.mer_amount || 0).toFixed(2)}</Text>
                                        </DataTable.Cell>
                                        <DataTable.Cell style={{ flex: 1.5, justifyContent: 'center' }}>
                                            <Text variant="bodySmall">{txn.settlement_date || txn.date || 'N/A'}</Text>
                                        </DataTable.Cell>
                                        <DataTable.Cell style={{ flex: 1.5, justifyContent: 'center' }}>
                                            <Chip
                                                compact
                                                mode="flat"
                                                style={{ backgroundColor: theme.colors.primaryContainer, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}
                                                textStyle={{ fontSize: 11, marginVertical: 0, marginHorizontal: 2, lineHeight: 14 }}
                                            >
                                                Settled
                                            </Chip>
                                        </DataTable.Cell>
                                    </DataTable.Row>
                                ))}
                            </DataTable>
                        </ScrollView>
                    ) : (
                        <View style={{ alignItems: 'center', padding: 32 }}>
                            <Icon source="bank-remove" size={48} color={theme.colors.outline} />
                            <Text variant="titleMedium" style={{ marginTop: 16, color: theme.colors.onSurface }}>
                                No settlements found
                            </Text>
                            <Text variant="bodySmall" style={{ marginTop: 4, color: theme.colors.onSurfaceVariant }}>
                                Try selecting a different date range.
                            </Text>
                        </View>
                    )}
                </Surface>
            </View>
        );
    };

    // Helper to extract settlement list from various possible keys
    const getSettlementList = (data) => {
        if (!data) return [];
        if (Array.isArray(data.Txn_details)) return data.Txn_details;
        if (Array.isArray(data.txn_details)) return data.txn_details;
        if (Array.isArray(data.Transaction_Details)) return data.Transaction_Details;
        if (Array.isArray(data.Data)) return data.Data;
        if (Array.isArray(data.data)) return data.data;
        return [];
    };





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
            title="PayU"
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

            <Portal>
                <Dialog visible={linkDialogVisible} onDismiss={() => setLinkDialogVisible(false)} style={{ backgroundColor: theme.colors.surface }}>
                    <Dialog.Title style={{ textAlign: 'center' }}>Payment Link Generated</Dialog.Title>
                    <Dialog.Content>
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <Icon source="check-circle" size={48} color={theme.colors.primary} />
                            <Text variant="titleMedium" style={{ marginTop: 12, fontWeight: 'bold' }}>Success!</Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline, textAlign: 'center' }}>Transaction ID: {generatedLinkTxnId}</Text>
                        </View>

                        <Surface style={{ padding: 12, borderRadius: 8, backgroundColor: theme.colors.elevation.level2, marginBottom: 16 }}>
                            <Text variant="bodyMedium" numberOfLines={3} style={{ color: theme.colors.primary, textAlign: 'center' }} selectable>{generatedLink}</Text>
                        </Surface>

                        <Button
                            mode="contained"
                            onPress={() => {
                                Clipboard.setString(generatedLink);
                                setCopied(true);
                            }}
                            icon={copied ? "check" : "content-copy"}
                            style={{ marginBottom: 12 }}
                            buttonColor={copied ? theme.colors.tertiary : theme.colors.primary}
                        >
                            {copied ? "Copied!" : "Copy Link"}
                        </Button>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Button mode="outlined" onPress={() => setLinkDialogVisible(false)} style={{ flex: 1, marginRight: 8 }}>Close</Button>
                            <Button mode="outlined" onPress={() => Linking.openURL(generatedLink)} style={{ flex: 1, marginLeft: 8 }} icon="open-in-new">Open</Button>
                        </View>
                    </Dialog.Content>
                </Dialog>
            </Portal>
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

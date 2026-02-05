import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, useTheme, Icon } from 'react-native-paper';
import { fetchDelhiveryWalletDetails } from '../../services/delhiveryService';

export const DelhiveryWalletView = () => {
    const theme = useTheme();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Wallet Data
    const [walletDetails, setWalletDetails] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Fetch Wallet Metadata
            const details = await fetchDelhiveryWalletDetails();
            if (details) {
                setWalletDetails(details);
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

    // Safely extract balance
    const balance = walletDetails?.current_balance ?? 0;
    const holdAmount = walletDetails?.minimum_threshold ?? 0; // Using min threshold as "hold" equivalent for now

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
});

import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Text, Surface, useTheme, Icon, Avatar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen({ navigation }) {
    const theme = useTheme();
    const screenWidth = Dimensions.get('window').width;

    const menuItems = [
        {
            id: 1,
            title: 'Live Dashboard',
            subtitle: 'Real-time analytics',
            icon: 'chart-timeline-variant',
            screen: 'Stats',
            color: theme.colors.primary,
        },
        {
            id: 2,
            title: 'Orders',
            subtitle: 'Manage & Track',
            icon: 'package-variant-closed',
            screen: 'DatabaseManager',
            color: theme.colors.secondary,
        },
        {
            id: 3,
            title: 'Customers',
            subtitle: 'CRM Database',
            icon: 'account-group',
            screen: 'Customers',
            color: theme.colors.tertiary,
        },
        {
            id: 4,
            title: 'Settings',
            subtitle: 'App Config',
            icon: 'cog',
            screen: 'Home', // Placeholder
            color: theme.colors.error,
        },
    ];

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Header Section */}
            <Surface style={[styles.header, { backgroundColor: theme.colors.surface }]} elevation={0}>
                <View style={styles.headerContent}>
                    <View>
                        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>Easey CRM</Text>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Welcome back, Mackruize</Text>
                    </View>
                    <Avatar.Text size={48} label="MK" style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.onPrimaryContainer} />
                </View>

                {/* Quick Stats Row inside Header */}
                <View style={[styles.statsRow, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <View style={styles.statItem}>
                        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>12</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>New Orders</Text>
                    </View>
                    <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
                    <View style={styles.statItem}>
                        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>₹45k</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Revenue</Text>
                    </View>
                    <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
                    <View style={styles.statItem}>
                        <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>5</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Pending</Text>
                    </View>
                </View>
            </Surface>

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>Quick Actions</Text>

                <View style={styles.grid}>
                    {menuItems.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            onPress={() => navigation.navigate(item.screen)}
                            activeOpacity={0.9}
                            style={{ width: '48%', marginBottom: 16 }}
                        >
                            <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={2}>
                                <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                                    <Icon source={item.icon} size={28} color={item.color} />
                                </View>
                                <Text variant="titleMedium" style={{ marginTop: 12, fontWeight: '600' }}>{item.title}</Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.subtitle}</Text>
                            </Surface>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Recent Activity Widget */}
                <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground, marginTop: 8 }]}>System Status</Text>
                <Surface style={[styles.statusCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <View style={styles.statusRow}>
                        <Icon source="check-circle" size={20} color={theme.colors.secondary} />
                        <Text variant="bodyMedium" style={{ marginLeft: 8, flex: 1 }}>Shopify Webhooks Active</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />
                    <View style={styles.statusRow}>
                        <Icon source="check-circle" size={20} color={theme.colors.secondary} />
                        <Text variant="bodyMedium" style={{ marginLeft: 8, flex: 1 }}>Shiprocket Sync Active</Text>
                    </View>
                    <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />
                    <View style={styles.statusRow}>
                        <Icon source="database" size={20} color={theme.colors.primary} />
                        <Text variant="bodyMedium" style={{ marginLeft: 8, flex: 1 }}>Firestore Connected</Text>
                    </View>
                </Surface>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingTop: 20, // Safe area padding
        paddingHorizontal: 20,
        paddingBottom: 30,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: 16,
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statDivider: {
        width: 1,
        height: 24,
        opacity: 0.3,
    },
    content: {
        flex: 1,
        padding: 20,
    },
    sectionTitle: {
        marginBottom: 16,
        fontWeight: 'bold',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    card: {
        padding: 16,
        borderRadius: 16,
        height: 140,
        justifyContent: 'center',
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    statusCard: {
        borderRadius: 16,
        padding: 16,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    divider: {
        height: 1,
        width: '100%',
    },
});

import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Title, Paragraph, FAB } from 'react-native-paper';

export default function HomeScreen({ navigation }) {
    const menuItems = [
        {
            id: 1,
            title: 'Customers',
            icon: 'account-group',
            screen: 'Customers',
            description: 'Manage your customers',
        },
        {
            id: 2,
            title: 'Orders',
            icon: 'package-variant',
            screen: 'Home',
            description: 'Track all orders',
        },
        {
            id: 3,
            title: 'Products',
            icon: 'shopping',
            screen: 'Home',
            description: 'Manage inventory',
        },
        {
            id: 4,
            title: 'Analytics',
            icon: 'chart-bar',
            screen: 'Home',
            description: 'View insights',
        },
    ];

    return (
        <View style={styles.container}>
            <ScrollView style={styles.content}>
                <Title style={styles.welcome}>Welcome to Easey CRM</Title>
                <Paragraph style={styles.subtitle}>
                    Manage your business efficiently
                </Paragraph>

                <View style={styles.grid}>
                    {menuItems.map((item) => (
                        <Card
                            key={item.id}
                            style={styles.card}
                            onPress={() => navigation.navigate(item.screen)}
                            mode="elevated"
                        >
                            <Card.Content>
                                <Title>{item.title}</Title>
                                <Paragraph>{item.description}</Paragraph>
                            </Card.Content>
                        </Card>
                    ))}
                </View>

                <Card style={styles.statsCard} mode="elevated">
                    <Card.Content>
                        <Title>Quick Stats</Title>
                        <View style={styles.statsRow}>
                            <View style={styles.stat}>
                                <Title>0</Title>
                                <Paragraph>Customers</Paragraph>
                            </View>
                            <View style={styles.stat}>
                                <Title>0</Title>
                                <Paragraph>Orders</Paragraph>
                            </View>
                        </View>
                    </Card.Content>
                </Card>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    welcome: {
        fontSize: 28,
        marginTop: 8,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
        marginBottom: 24,
        color: '#666',
    },
    grid: {
        gap: 12,
    },
    card: {
        marginBottom: 12,
    },
    statsCard: {
        marginTop: 8,
        marginBottom: 24,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 16,
    },
    stat: {
        alignItems: 'center',
    },
});

import React from 'react';
import { ScrollView, View, StyleSheet, Linking } from 'react-native';
import { Card, Title, Paragraph, Button, Avatar, Divider } from 'react-native-paper';

export default function CustomerDetailScreen({ route }) {
    const { customer } = route.params;

    const makeCall = () => Linking.openURL(`tel:${customer.phone}`);
    const sendEmail = () => customer.email && Linking.openURL(`mailto:${customer.email}`);
    const sendWhatsApp = () => {
        const phoneNumber = customer.phone.replace(/[^0-9]/g, '');
        Linking.openURL(`whatsapp://send?phone=${phoneNumber}`);
    };

    return (
        <ScrollView style={styles.container}>
            <Card style={styles.profileCard} mode="elevated">
                <Card.Content style={styles.profileContent}>
                    <Avatar.Text
                        size={80}
                        label={customer.name.charAt(0).toUpperCase()}
                    />
                    <Title style={styles.name}>{customer.name}</Title>
                    <Paragraph>
                        Customer since {new Date(customer.createdAt).toLocaleDateString()}
                    </Paragraph>
                </Card.Content>
            </Card>

            <Card style={styles.card} mode="elevated">
                <Card.Content>
                    <Title>Quick Actions</Title>
                    <View style={styles.actions}>
                        <Button
                            icon="phone"
                            mode="contained"
                            onPress={makeCall}
                            style={styles.actionButton}
                        >
                            Call
                        </Button>
                        <Button
                            icon="whatsapp"
                            mode="contained"
                            onPress={sendWhatsApp}
                            style={styles.actionButton}
                        >
                            WhatsApp
                        </Button>
                        {customer.email && (
                            <Button
                                icon="email"
                                mode="contained"
                                onPress={sendEmail}
                                style={styles.actionButton}
                            >
                                Email
                            </Button>
                        )}
                    </View>
                </Card.Content>
            </Card>

            <Card style={styles.card} mode="elevated">
                <Card.Content>
                    <Title>Contact Information</Title>
                    <Divider style={styles.divider} />

                    <Paragraph style={styles.label}>Phone</Paragraph>
                    <Paragraph style={styles.value}>{customer.phone}</Paragraph>

                    {customer.email && (
                        <>
                            <Paragraph style={styles.label}>Email</Paragraph>
                            <Paragraph style={styles.value}>{customer.email}</Paragraph>
                        </>
                    )}

                    {customer.address && (
                        <>
                            <Paragraph style={styles.label}>Address</Paragraph>
                            <Paragraph style={styles.value}>{customer.address}</Paragraph>
                        </>
                    )}

                    {customer.notes && (
                        <>
                            <Divider style={styles.divider} />
                            <Paragraph style={styles.label}>Notes</Paragraph>
                            <Paragraph style={styles.value}>{customer.notes}</Paragraph>
                        </>
                    )}
                </Card.Content>
            </Card>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    profileCard: {
        margin: 16,
    },
    profileContent: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    name: {
        marginTop: 16,
        marginBottom: 4,
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 16,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        flexWrap: 'wrap',
    },
    actionButton: {
        flex: 1,
        minWidth: 100,
    },
    divider: {
        marginVertical: 12,
    },
    label: {
        fontSize: 12,
        color: '#666',
        marginTop: 8,
        marginBottom: 4,
    },
    value: {
        fontSize: 16,
    },
});

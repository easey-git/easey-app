import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme, Appbar, List, Switch, Divider, Surface, Avatar } from 'react-native-paper';
import { usePreferences } from '../context/PreferencesContext';

const SettingsScreen = ({ navigation }) => {
    const theme = useTheme();
    const {
        isThemeDark,
        toggleTheme,
        notificationsEnabled,
        toggleNotifications,
        biometricsEnabled,
        toggleBiometrics
    } = usePreferences();

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
                <Appbar.Content title="Settings" titleStyle={{ fontWeight: 'bold' }} />
            </Appbar.Header>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Profile Section */}
                <Surface style={[styles.profileCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar.Text size={56} label="MK" style={{ backgroundColor: theme.colors.primaryContainer }} color={theme.colors.onPrimaryContainer} />
                        <View style={{ marginLeft: 16 }}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Mack Ruize</Text>
                            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Admin</Text>
                        </View>
                    </View>
                </Surface>

                <List.Section title="Appearance">
                    <List.Item
                        title="Dark Mode"
                        left={props => <List.Icon {...props} icon="theme-light-dark" />}
                        right={() => <Switch value={isThemeDark} onValueChange={toggleTheme} />}
                        style={styles.listItem}
                    />
                </List.Section>

                <Divider />

                <List.Section title="Notifications">
                    <List.Item
                        title="Push Notifications"
                        description="Receive alerts for new orders"
                        left={props => <List.Icon {...props} icon="bell-outline" />}
                        right={() => <Switch value={notificationsEnabled} onValueChange={toggleNotifications} />}
                        style={styles.listItem}
                    />
                    <List.Item
                        title="Email Alerts"
                        description="Daily summary reports"
                        left={props => <List.Icon {...props} icon="email-outline" />}
                        right={() => <List.Icon icon="chevron-right" />}
                        onPress={() => { }}
                        style={styles.listItem}
                    />
                </List.Section>

                <Divider />

                <List.Section title="Security">
                    <List.Item
                        title="Biometric Login"
                        left={props => <List.Icon {...props} icon="fingerprint" />}
                        right={() => <Switch value={biometricsEnabled} onValueChange={toggleBiometrics} />}
                        style={styles.listItem}
                    />
                    <List.Item
                        title="Change Password"
                        left={props => <List.Icon {...props} icon="lock-outline" />}
                        right={() => <List.Icon icon="chevron-right" />}
                        onPress={() => { }}
                        style={styles.listItem}
                    />
                </List.Section>

                <Divider />

                <List.Section title="About">
                    <List.Item
                        title="Version"
                        description="1.0.0 (Build 2025.12.17)"
                        left={props => <List.Icon {...props} icon="information-outline" />}
                        style={styles.listItem}
                    />
                    <List.Item
                        title="Help & Support"
                        left={props => <List.Icon {...props} icon="help-circle-outline" />}
                        right={() => <List.Icon icon="chevron-right" />}
                        onPress={() => { }}
                        style={styles.listItem}
                    />
                </List.Section>

            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 16,
    },
    profileCard: {
        padding: 20,
        borderRadius: 16,
        marginBottom: 24,
    },
    listItem: {
        paddingVertical: 8,
    }
});

export default SettingsScreen;

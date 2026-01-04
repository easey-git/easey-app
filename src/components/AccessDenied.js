import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, Button, Icon, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';

export const AccessDenied = ({ title = "Access Denied", message = "You don't have permission to view this content." }) => {
    const theme = useTheme();
    const navigation = useNavigation();

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={2}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.errorContainer }]}>
                    <Icon source="shield-lock" size={48} color={theme.colors.error} />
                </View>

                <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
                    {title}
                </Text>

                <Text variant="bodyLarge" style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>
                    {message}
                </Text>

                <Button
                    mode="contained"
                    onPress={() => navigation.navigate('Home')}
                    style={styles.button}
                >
                    Back to Dashboard
                </Button>
            </Surface>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        textAlign: 'center',
        marginBottom: 32,
        opacity: 0.8,
    },
    button: {
        width: '100%',
        borderRadius: 12,
    },
});

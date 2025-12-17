import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, useTheme, Surface, ActivityIndicator, Icon } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';

const LoginScreen = () => {
    const theme = useTheme();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        setLoading(true);
        setError('');

        const result = await login(email, password);

        if (!result.success) {
            setError(result.error || 'Login failed. Please check your credentials.');
        }

        setLoading(false);
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: theme.colors.background }]}
        >
            <View style={styles.content}>
                {/* Logo/Brand Section */}
                <View style={styles.header}>
                    <Surface style={[styles.logoContainer, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
                        <Icon source="shopping" size={48} color={theme.colors.onPrimaryContainer} />
                    </Surface>
                    <Text variant="headlineLarge" style={{ fontWeight: 'bold', marginTop: 24, color: theme.colors.onBackground }}>
                        Easey CRM
                    </Text>
                    <Text variant="bodyMedium" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                        Sign in to access your dashboard
                    </Text>
                </View>

                {/* Login Form */}
                <Surface style={[styles.formContainer, { backgroundColor: theme.colors.surface }]} elevation={1}>
                    <TextInput
                        label="Email"
                        value={email}
                        onChangeText={setEmail}
                        mode="outlined"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        left={<TextInput.Icon icon="email" />}
                        style={styles.input}
                        disabled={loading}
                    />

                    <TextInput
                        label="Password"
                        value={password}
                        onChangeText={setPassword}
                        mode="outlined"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoComplete="password"
                        left={<TextInput.Icon icon="lock" />}
                        right={<TextInput.Icon icon={showPassword ? "eye-off" : "eye"} onPress={() => setShowPassword(!showPassword)} />}
                        style={styles.input}
                        disabled={loading}
                        onSubmitEditing={handleLogin}
                    />

                    {error ? (
                        <Surface style={[styles.errorContainer, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                            <Icon source="alert-circle" size={20} color={theme.colors.onErrorContainer} />
                            <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.onErrorContainer, flex: 1 }}>
                                {error}
                            </Text>
                        </Surface>
                    ) : null}

                    <Button
                        mode="contained"
                        onPress={handleLogin}
                        loading={loading}
                        disabled={loading}
                        style={styles.button}
                        contentStyle={{ paddingVertical: 8 }}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </Button>
                </Surface>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                        Secure authentication powered by Firebase
                    </Text>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    formContainer: {
        padding: 24,
        borderRadius: 16,
        gap: 16,
    },
    input: {
        backgroundColor: 'transparent',
    },
    button: {
        marginTop: 8,
    },
    errorContainer: {
        padding: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },
    footer: {
        marginTop: 32,
        alignItems: 'center',
    },
});

export default LoginScreen;

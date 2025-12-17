import React, { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, Button, useTheme, Surface, ActivityIndicator, Icon } from 'react-native-paper';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';

const LoginScreen = () => {
    const theme = useTheme();
    const { login } = useAuth();
    const { biometricsEnabled } = usePreferences();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);

    useEffect(() => {
        (async () => {
            const compatible = await LocalAuthentication.hasHardwareAsync();
            setIsBiometricSupported(compatible);
        })();
    }, []);

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
        } else {
            // Save credentials if biometrics enabled
            if (biometricsEnabled) {
                try {
                    await SecureStore.setItemAsync('user_email', email);
                    await SecureStore.setItemAsync('user_password', password);
                } catch (e) {
                    console.error('Failed to save credentials for biometrics', e);
                }
            }
        }

        setLoading(false);
    };

    const handleBiometricLogin = async () => {
        try {
            const hasAuth = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Authenticate to login',
                fallbackLabel: 'Use Password',
            });

            if (hasAuth.success) {
                setLoading(true);
                const savedEmail = await SecureStore.getItemAsync('user_email');
                const savedPassword = await SecureStore.getItemAsync('user_password');

                if (savedEmail && savedPassword) {
                    const result = await login(savedEmail, savedPassword);
                    if (!result.success) {
                        setError(result.error || 'Fingerprint login failed. Please use password.');
                    }
                } else {
                    setError('No credentials saved. Please login with password first.');
                }
                setLoading(false);
            }
        } catch (e) {
            console.error('Biometric auth error', e);
            setError('Fingerprint authentication failed');
        }
    };

    // Auto-trigger fingerprint login if enabled
    useEffect(() => {
        if (biometricsEnabled && isBiometricSupported) {
            handleBiometricLogin();
        }
    }, [biometricsEnabled, isBiometricSupported]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={[styles.container, { backgroundColor: theme.colors.background }]}
            >
                <View style={styles.content}>
                    {/* Logo/Brand Section */}
                    <View style={styles.header}>
                        <Surface style={[styles.logoContainer, { backgroundColor: '#FF6B6B' }]} elevation={0}>
                            <Image
                                source={require('../../logo/easey-white.png')}
                                style={{ width: 80, height: 80, resizeMode: 'contain' }}
                            />
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

                        {biometricsEnabled && isBiometricSupported && (
                            <Button
                                mode="outlined"
                                onPress={handleBiometricLogin}
                                disabled={loading}
                                style={{ marginTop: 16 }}
                                icon="fingerprint"
                            >
                                Login with Fingerprint
                            </Button>
                        )}
                    </Surface>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                            support@easey.in
                        </Text>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
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

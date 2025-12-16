import { MD3LightTheme, configureFonts } from 'react-native-paper';

const fontConfig = {
    displayLarge: {
        fontFamily: 'System',
        fontWeight: '700',
        fontSize: 57,
        lineHeight: 64,
        letterSpacing: -0.25,
    },
    displayMedium: {
        fontFamily: 'System',
        fontWeight: '700',
        fontSize: 45,
        lineHeight: 52,
        letterSpacing: 0,
    },
    displaySmall: {
        fontFamily: 'System',
        fontWeight: '700',
        fontSize: 36,
        lineHeight: 44,
        letterSpacing: 0,
    },
    headlineLarge: {
        fontFamily: 'System',
        fontWeight: '700',
        fontSize: 32,
        lineHeight: 40,
        letterSpacing: 0,
    },
    headlineMedium: {
        fontFamily: 'System',
        fontWeight: '700',
        fontSize: 28,
        lineHeight: 36,
        letterSpacing: 0,
    },
    headlineSmall: {
        fontFamily: 'System',
        fontWeight: '600',
        fontSize: 24,
        lineHeight: 32,
        letterSpacing: 0,
    },
    titleLarge: {
        fontFamily: 'System',
        fontWeight: '600',
        fontSize: 22,
        lineHeight: 28,
        letterSpacing: 0,
    },
    titleMedium: {
        fontFamily: 'System',
        fontWeight: '600',
        fontSize: 16,
        lineHeight: 24,
        letterSpacing: 0.15,
    },
    titleSmall: {
        fontFamily: 'System',
        fontWeight: '600',
        fontSize: 14,
        lineHeight: 20,
        letterSpacing: 0.1,
    },
    bodyLarge: {
        fontFamily: 'System',
        fontWeight: '400',
        fontSize: 16,
        lineHeight: 24,
        letterSpacing: 0.15,
    },
    bodyMedium: {
        fontFamily: 'System',
        fontWeight: '400',
        fontSize: 14,
        lineHeight: 20,
        letterSpacing: 0.25,
    },
    bodySmall: {
        fontFamily: 'System',
        fontWeight: '400',
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0.4,
    },
    labelLarge: {
        fontFamily: 'System',
        fontWeight: '600',
        fontSize: 14,
        lineHeight: 20,
        letterSpacing: 0.1,
    },
};

export const theme = {
    ...MD3LightTheme,
    fonts: configureFonts({ config: fontConfig }),
    colors: {
        ...MD3LightTheme.colors,
        primary: '#4F46E5', // Indigo 600
        onPrimary: '#FFFFFF',
        primaryContainer: '#E0E7FF', // Indigo 100
        onPrimaryContainer: '#3730A3', // Indigo 800

        secondary: '#10B981', // Emerald 500
        onSecondary: '#FFFFFF',
        secondaryContainer: '#D1FAE5', // Emerald 100
        onSecondaryContainer: '#065F46', // Emerald 800

        tertiary: '#F59E0B', // Amber 500
        onTertiary: '#FFFFFF',
        tertiaryContainer: '#FEF3C7', // Amber 100
        onTertiaryContainer: '#92400E', // Amber 800

        error: '#EF4444', // Red 500
        onError: '#FFFFFF',
        errorContainer: '#FEE2E2', // Red 100
        onErrorContainer: '#B91C1C', // Red 800

        background: '#F9FAFB', // Gray 50
        onBackground: '#111827', // Gray 900
        surface: '#FFFFFF',
        onSurface: '#1F2937', // Gray 800
        surfaceVariant: '#F3F4F6', // Gray 100
        onSurfaceVariant: '#4B5563', // Gray 600
        outline: '#9CA3AF', // Gray 400

        elevation: {
            level0: 'transparent',
            level1: '#FFFFFF',
            level2: '#FFFFFF',
            level3: '#FFFFFF',
            level4: '#FFFFFF',
            level5: '#FFFFFF',
        },
    },
    roundness: 12,
};

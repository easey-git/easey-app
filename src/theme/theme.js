import { MD3DarkTheme, configureFonts } from 'react-native-paper';

const fontConfig = {
    displayLarge: { fontFamily: 'System', fontWeight: '400' },
    displayMedium: { fontFamily: 'System', fontWeight: '400' },
    displaySmall: { fontFamily: 'System', fontWeight: '400' },
    headlineLarge: { fontFamily: 'System', fontWeight: '400' },
    headlineMedium: { fontFamily: 'System', fontWeight: '400' },
    headlineSmall: { fontFamily: 'System', fontWeight: '400' },
    titleLarge: { fontFamily: 'System', fontWeight: '400' },
    titleMedium: { fontFamily: 'System', fontWeight: '500' },
    titleSmall: { fontFamily: 'System', fontWeight: '500' },
    bodyLarge: { fontFamily: 'System', fontWeight: '400' },
    bodyMedium: { fontFamily: 'System', fontWeight: '400' },
    bodySmall: { fontFamily: 'System', fontWeight: '400' },
    labelLarge: { fontFamily: 'System', fontWeight: '500' },
    labelMedium: { fontFamily: 'System', fontWeight: '500' },
    labelSmall: { fontFamily: 'System', fontWeight: '500' },
};

export const theme = {
    ...MD3DarkTheme,
    fonts: configureFonts({ config: fontConfig }),
    colors: {
        ...MD3DarkTheme.colors,
        // Google Material Dark Palette
        primary: '#8AB4F8', // Google Blue
        onPrimary: '#002D6C',
        primaryContainer: '#004298',
        onPrimaryContainer: '#D3E3FD',

        secondary: '#A8C7FA',
        onSecondary: '#0F305F',
        secondaryContainer: '#284777',
        onSecondaryContainer: '#D7E3F7',

        tertiary: '#E2B6FF', // Soft Purple accent
        onTertiary: '#461863',
        tertiaryContainer: '#5D2F7A',
        onTertiaryContainer: '#F6D9FF',

        background: '#121212', // Standard Dark Background
        surface: '#1E1E1E',    // Slightly lighter for cards
        surfaceVariant: '#2C2C2C',
        onSurface: '#E3E3E3',
        onSurfaceVariant: '#C4C7C5',

        error: '#F2B8B5',
        onError: '#601410',
        errorContainer: '#8C1D18',
        onErrorContainer: '#F9DEDC',

        outline: '#8E918F',
        outlineVariant: '#444746',

        elevation: {
            level0: 'transparent',
            level1: '#1E1E1E',
            level2: '#232323',
            level3: '#252525',
            level4: '#272727',
            level5: '#2C2C2C',
        },
    },
};

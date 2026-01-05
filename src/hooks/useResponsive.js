import { useWindowDimensions } from 'react-native';
import { LAYOUT } from '../theme/layout';

export const useResponsive = () => {
    const { width, height } = useWindowDimensions();

    const isMobile = width < LAYOUT.breakpoints.mobile;
    const isTablet = width >= LAYOUT.breakpoints.mobile && width < LAYOUT.breakpoints.tablet;
    const isDesktop = width >= LAYOUT.breakpoints.tablet;
    const isWide = width >= LAYOUT.breakpoints.desktop;

    // Calculate content width based on device
    let contentWidth = '100%';
    if (isTablet) contentWidth = LAYOUT.maxWidth.tablet;
    if (isDesktop) contentWidth = LAYOUT.maxWidth.desktop;
    if (isWide) contentWidth = LAYOUT.maxWidth.wide;

    return {
        // Device Flags
        isMobile,
        isTablet,
        isDesktop,
        isWide,

        // Dimensions
        width,
        height,

        // Calculated Layout Values
        contentWidth,
        containerStyle: {
            width: '100%',
            maxWidth: isMobile ? '100%' : contentWidth,
            alignSelf: 'center',
            paddingHorizontal: isMobile ? LAYOUT.spacing.m : LAYOUT.spacing.l,
        },

        // Values from Grid
        spacing: LAYOUT.spacing,
    };
};

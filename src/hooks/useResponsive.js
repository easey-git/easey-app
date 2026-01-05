import { useWindowDimensions } from 'react-native';
import { LAYOUT } from '../theme/layout';

export const useResponsive = () => {
    const { width, height } = useWindowDimensions();

    const isMobile = width < LAYOUT.breakpoints.mobile;
    const isTablet = width >= LAYOUT.breakpoints.mobile && width < LAYOUT.breakpoints.tablet;
    const isDesktop = width >= LAYOUT.breakpoints.tablet;
    const isWide = width >= LAYOUT.breakpoints.desktop;

    // Standardize horizontal padding (16px min on mobile, up to max width on desktop)
    const containerPadding = isMobile ? LAYOUT.spacing.m : LAYOUT.spacing.l;

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
        contentWidth: '100%',
        containerStyle: {
            width: '100%',
            paddingHorizontal: containerPadding,
            alignSelf: 'center',
            maxWidth: isWide ? LAYOUT.maxWidth.wide : (isDesktop ? LAYOUT.maxWidth.desktop : '100%'),
        },

        // Expose standard spacing for easy access
        spacing: LAYOUT.spacing,
    };
};

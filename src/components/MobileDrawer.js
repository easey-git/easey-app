import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Pressable, Animated, PanResponder, Easing, useWindowDimensions, Platform } from 'react-native';
import { useTheme, Portal } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDrawer } from '../context/DrawerContext';
import { Sidebar } from './Sidebar';
import { useResponsive } from '../hooks/useResponsive';

export const MobileDrawer = React.memo(() => {
    const theme = useTheme();
    const { height } = useWindowDimensions();
    const { isDrawerOpen, closeDrawer } = useDrawer();
    const { isDesktop } = useResponsive();

    // Width + Buffer for shadow/elevation artifacts
    const SIDEBAR_WIDTH = 280;
    const OFF_SCREEN = -SIDEBAR_WIDTH - 40;

    // Animation Values
    const slideAnim = useRef(new Animated.Value(OFF_SCREEN)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // Web does not support useNativeDriver for layout properties or at all in some versions
    const useNativeDriver = Platform.OS !== 'web';

    useEffect(() => {
        // Don't animate if on desktop
        if (isDesktop) return;

        if (isDrawerOpen) {
            // Animate In - Standard Material Deceleration
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver,
                    easing: Easing.out(Easing.poly(5)),
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver,
                })
            ]).start();
        } else {
            // Animate Out - Acceleration
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: OFF_SCREEN,
                    duration: 200,
                    useNativeDriver,
                    easing: Easing.in(Easing.poly(5)),
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver,
                })
            ]).start();
        }
    }, [isDrawerOpen, isDesktop, slideAnim, fadeAnim, useNativeDriver, OFF_SCREEN]);

    // Force hide on desktop - AFTER all hooks
    if (isDesktop) return null;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx < 0;
            },
            onPanResponderMove: (_, gestureState) => {
                const newX = Math.max(OFF_SCREEN, Math.min(0, gestureState.dx));
                slideAnim.setValue(newX);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dx < -50 || gestureState.vx < -0.5) {
                    closeDrawer();
                } else {
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        useNativeDriver,
                        bounciness: 4
                    }).start();
                }
            }
        })
    ).current;

    return (
        <Portal>
            <View
                style={[
                    styles.backdropContainer,
                    { pointerEvents: isDrawerOpen ? 'auto' : 'none' }
                ]}
            >
                {/* Backdrop with Fade */}
                <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
                </Animated.View>

                {/* Sidebar with Slide & Gestures */}
                <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                        styles.mobileSidebar,
                        {
                            backgroundColor: theme.colors.surface,
                            transform: [{ translateX: slideAnim }],
                            height: height,
                            // Only apply shadow when open to prevent "bleeding" artifacts on Android
                            elevation: isDrawerOpen ? 16 : 0,
                            shadowOpacity: isDrawerOpen ? 0.3 : 0,
                        }
                    ]}
                >
                    <SafeAreaView edges={['top', 'bottom', 'left']} style={{ flex: 1 }}>
                        <Sidebar onClose={closeDrawer} />
                    </SafeAreaView>
                </Animated.View>
            </View>
        </Portal>
    );
});

const styles = StyleSheet.create({
    backdropContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2000, // Very high z-index to be on top of everything
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    mobileSidebar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 280,
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 16,
    }
});

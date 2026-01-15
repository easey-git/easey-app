import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Surface, TouchableRipple, useTheme, Icon } from 'react-native-paper';

export const LogisticsServiceSelector = ({ selectedService, onSelectService }) => {
    const theme = useTheme();

    const services = [
        {
            id: 'delhivery',
            name: 'Delhivery',
            icon: 'truck-fast',
            brandColor: '#ED1C24', // Official Delhivery Red
            description: 'Domestic & Express'
        },
        {
            id: 'xpressbees',
            name: 'Xpressbees',
            icon: 'truck-delivery',
            brandColor: '#1c3f94', // Official Xpressbees Blue
            description: 'B2B & B2C Logistics'
        },
        // Easily add more services here
        // { id: 'shadowfax', name: 'Shadowfax', ... }
    ];

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.container}
        >
            {services.map((service) => {
                const isSelected = selectedService === service.id;
                const activeColor = isSelected ? service.brandColor : theme.colors.surfaceVariant;

                return (
                    <Surface
                        key={service.id}
                        style={[
                            styles.card,
                            {
                                backgroundColor: isSelected ? theme.colors.surface : theme.colors.surface,
                                borderColor: isSelected ? service.brandColor : 'transparent',
                                borderWidth: 2,
                                elevation: isSelected ? 4 : 1
                            }
                        ]}
                    >
                        <TouchableRipple
                            onPress={() => onSelectService(service.id)}
                            style={styles.touchable}
                            borderless
                        >
                            <View style={styles.content}>
                                <View style={[
                                    styles.iconContainer,
                                    { backgroundColor: isSelected ? service.brandColor + '20' : theme.colors.surfaceVariant + '20' }
                                ]}>
                                    <Icon
                                        source={service.icon}
                                        size={28}
                                        color={isSelected ? service.brandColor : theme.colors.onSurfaceVariant}
                                    />
                                </View>
                                <View style={styles.textContainer}>
                                    <Text
                                        variant="titleMedium"
                                        style={{
                                            fontWeight: 'bold',
                                            color: isSelected ? theme.colors.onSurface : theme.colors.onSurfaceVariant
                                        }}
                                    >
                                        {service.name}
                                    </Text>
                                    <Text
                                        variant="labelSmall"
                                        style={{ color: theme.colors.onSurfaceVariant, opacity: 0.8 }}
                                    >
                                        {service.description}
                                    </Text>
                                </View>
                                {isSelected && (
                                    <View style={[styles.badge, { backgroundColor: service.brandColor }]}>
                                        <Icon source="check" size={12} color="#fff" />
                                    </View>
                                )}
                            </View>
                        </TouchableRipple>
                    </Surface>
                );
            })}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flexGrow: 0,
        marginBottom: 16,
    },
    scrollContent: {
        paddingHorizontal: 0,
        gap: 12,
        paddingBottom: 8, // Space for shadow
        paddingTop: 4,    // Space for shadow
    },
    card: {
        borderRadius: 16,
        overflow: 'hidden',
        width: 180,
    },
    touchable: {
        padding: 16,
    },
    content: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: {
        gap: 4,
    },
    badge: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

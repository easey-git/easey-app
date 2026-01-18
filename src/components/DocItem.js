import React, { memo, useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Surface, Checkbox, Avatar, Text, IconButton, Chip, Icon, ActivityIndicator } from 'react-native-paper';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';

import { useResponsive } from '../hooks/useResponsive';

const CopyableText = ({ text, display, style, theme, numberOfLines = 1 }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await Clipboard.setStringAsync(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <TouchableOpacity onPress={handleCopy} style={[{ flexDirection: 'row', alignItems: 'flex-start' }, style]}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flexShrink: 1 }} numberOfLines={numberOfLines}>
                {display || text}
            </Text>
            <View style={{ marginLeft: 6, marginTop: 2 }}>
                <Icon
                    source={copied ? "check" : "content-copy"}
                    size={12}
                    color={copied ? theme.colors.primary : theme.colors.outline}
                />
            </View>
        </TouchableOpacity>
    );
};

const DocItem = memo(({ item, isSelected, selectedCollection, theme, onPress, onToggle, onCodToggle, isAdmin, onReset, onAttachVoice, onDeleteVoice, onShippedToggle }) => {
    const { isMobile } = useResponsive();
    const isCOD = (item.paymentMethod === 'COD' || item.gateway === 'COD' || item.status === 'COD');

    // Voice Note Logic
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoadingSound, setIsLoadingSound] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        return sound ? () => { sound.unloadAsync(); } : undefined;
    }, [sound]);

    const handlePlayPause = async () => {
        if (!item.voiceNoteUrl) return;
        try {
            if (sound) {
                const status = await sound.getStatusAsync();
                if (status.isLoaded) {
                    if (isPlaying) {
                        await sound.pauseAsync();
                        setIsPlaying(false);
                    } else {
                        await sound.playAsync();
                        setIsPlaying(true);
                    }
                } else {
                    // Sound unloaded unexpectedly, reload
                    setSound(null);
                    setIsPlaying(false);
                    handlePlayPause(); // Retry once
                }
            } else {
                setIsLoadingSound(true);
                const { sound: newSound, status } = await Audio.Sound.createAsync(
                    { uri: item.voiceNoteUrl },
                    { shouldPlay: true }
                );
                if (status.isLoaded) {
                    setSound(newSound);
                    setIsPlaying(true);
                    newSound.setOnPlaybackStatusUpdate(s => {
                        if (s.didJustFinish) {
                            setIsPlaying(false);
                            newSound.stopAsync(); // Use stopAsync to prevent auto-replay loop if logic expects it
                        }
                    });
                } else {
                    console.error("Sound failed to load");
                }
            }
        } catch (error) {
            console.error("Audio Error:", error);
        } finally {
            setIsLoadingSound(false);
        }
    };

    const handleUpload = async () => {
        if (!onAttachVoice) return;
        setIsUploading(true);
        await onAttachVoice(item);
        setIsUploading(false);
    };

    // Special rendering for Push Tokens
    if (selectedCollection === 'push_tokens') {
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={[styles.cardContent, isMobile && styles.cardContentMobile]}>
                        <Checkbox status={isSelected ? 'checked' : 'unchecked'} onPress={() => onToggle(item.id)} />
                        {/* Only show Avatar if not mobile to save space, OR keep it small */}
                        {!isMobile && (
                            <Avatar.Icon
                                size={40}
                                icon={item.platform === 'ios' ? 'apple' : 'android'}
                                style={{ backgroundColor: theme.colors.secondaryContainer, marginLeft: 4 }}
                                color={theme.colors.onSecondaryContainer}
                            />
                        )}
                        <View style={[styles.textContainer, isMobile && { marginLeft: 8 }]}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                {item.platform ? item.platform.toUpperCase() : 'UNKNOWN'}
                            </Text>
                            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, fontFamily: 'monospace' }}>
                                {item.token}
                            </Text>
                        </View>
                        <IconButton icon="chevron-right" size={20} />
                    </View>
                </TouchableOpacity>
            </Surface>
        );
    }

    // Special rendering for WhatsApp Messages
    if (selectedCollection === 'whatsapp_messages') {
        const isInbound = item.direction === 'inbound';
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={[styles.cardContent, isMobile && styles.cardContentMobile]}>
                        <Checkbox status={isSelected ? 'checked' : 'unchecked'} onPress={() => onToggle(item.id)} />
                        {!isMobile && (
                            <Avatar.Icon
                                size={40}
                                icon={isInbound ? "arrow-bottom-left" : "arrow-top-right"}
                                style={{ backgroundColor: isInbound ? theme.colors.secondaryContainer : theme.colors.tertiaryContainer, marginLeft: 4 }}
                                color={isInbound ? theme.colors.onSecondaryContainer : theme.colors.onTertiaryContainer}
                            />
                        )}
                        <View style={[styles.textContainer, isMobile && { marginLeft: 8 }]}>
                            <View style={styles.rowBetween}>
                                <Text variant={isMobile ? "labelLarge" : "titleMedium"} style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                    {isInbound ? 'Received' : 'Sent'}
                                </Text>
                                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                                    {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </Text>
                            </View>
                            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                                {item.body || item.templateName || 'No Content'}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.outline, fontFamily: 'monospace' }}>
                                {item.phoneNormalized || item.phone}
                            </Text>
                        </View>
                        <IconButton icon="chevron-right" size={20} />
                    </View>
                </TouchableOpacity>
            </Surface>
        );
    }

    // Special rendering for Wallet
    if (selectedCollection === 'wallet_transactions') {
        const isIncome = item.type === 'income';
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={[styles.cardContent, isMobile && styles.cardContentMobile]}>
                        <Checkbox status={isSelected ? 'checked' : 'unchecked'} onPress={() => onToggle(item.id)} />
                        {!isMobile && (
                            <Avatar.Icon
                                size={40}
                                icon={isIncome ? 'arrow-down-left' : 'arrow-up-right'}
                                style={{ backgroundColor: isIncome ? theme.colors.secondaryContainer : theme.colors.errorContainer, marginLeft: 4 }}
                                color={isIncome ? theme.colors.onSecondaryContainer : theme.colors.onErrorContainer}
                            />
                        )}
                        <View style={[styles.textContainer, isMobile && { marginLeft: 8 }]}>
                            <View style={styles.rowBetween}>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                    {isIncome ? 'Income' : 'Expense'}
                                </Text>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: isIncome ? theme.colors.primary : theme.colors.error }}>
                                    {isIncome ? '+' : '-'}₹{Math.abs(item.amount || 0).toLocaleString('en-IN')}
                                </Text>
                            </View>
                            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                                {item.description || 'No Description'}
                            </Text>
                        </View>
                        <IconButton icon="chevron-right" size={20} />
                    </View>
                </TouchableOpacity>
            </Surface>
        );
    }

    // Special rendering for Checkouts (Compact & Industry Standard)
    if (selectedCollection === 'checkouts') {
        const isAbandoned = item.latest_stage === 'CHECKOUT_ABANDONED' || item.eventType === 'ABANDONED';
        const isConverted = item.latest_stage === 'ORDER_PLACED';

        const statusBg = isAbandoned ? theme.colors.errorContainer :
            isConverted ? theme.colors.primaryContainer :
                theme.colors.secondaryContainer;

        const statusText = isAbandoned ? theme.colors.onErrorContainer :
            isConverted ? theme.colors.onPrimaryContainer :
                theme.colors.onSecondaryContainer;

        // Helper to extract product name safely
        const getProductName = () => {
            const products = item.items || item.line_items || item.cart?.items || [];
            if (products.length > 0) {
                const firstProduct = products[0];
                const productName = firstProduct.name || firstProduct.title || 'Unknown Product';
                const extraCount = products.length - 1;
                return `${productName}${extraCount > 0 ? ` +${extraCount} more` : ''}`;
            }
            return null;
        };

        const productName = getProductName();

        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={[styles.cardContent, isMobile && styles.cardContentMobile]}>
                        <Checkbox status={isSelected ? 'checked' : 'unchecked'} onPress={() => onToggle(item.id)} />

                        {!isMobile && (
                            <Avatar.Icon
                                size={40}
                                icon={isAbandoned ? "cart-remove" : isConverted ? "check-circle" : "cart-outline"}
                                style={{ backgroundColor: statusBg, marginLeft: 4 }}
                                color={statusText}
                            />
                        )}

                        <View style={[styles.textContainer, isMobile && { marginLeft: 8 }]}>
                            {/* Top Row: Name & Date */}
                            <View style={styles.rowBetween}>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flex: 1, marginRight: 8 }} numberOfLines={1}>
                                    {item.customerName || item.email || 'Guest Checkout'}
                                </Text>
                                <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                                    {item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                </Text>
                            </View>

                            {/* Middle Row: Product Name & Price */}
                            <View style={{ marginTop: 2 }}>
                                {productName && (
                                    <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.secondary }}>
                                        {productName}
                                    </Text>
                                )}
                                {(item.totalPrice > 0 || item.total_price > 0) && (
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold' }}>
                                        ₹{item.totalPrice || item.total_price}
                                    </Text>
                                )}
                            </View>

                            {/* Contact Row: Phone with Copy Button */}
                            {(item.phone || item.phone_number || item.phoneNormalized) && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <Icon source="phone" size={12} color={theme.colors.onSurfaceVariant} />
                                    <CopyableText
                                        text={item.phone || item.phone_number || item.phoneNormalized}
                                        style={{ marginLeft: 4 }}
                                        theme={theme}
                                        numberOfLines={1}
                                    />
                                </View>
                            )}

                            {/* Bottom Row: Status Chip */}
                            <View style={{ marginTop: 6, alignItems: 'flex-start' }}>
                                <Chip
                                    mode="flat"
                                    compact
                                    style={[styles.chip, { backgroundColor: statusBg, height: 20 }]}
                                    textStyle={{ fontSize: 9, lineHeight: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold', color: statusText }}
                                >
                                    {item.stage || item.latest_stage || 'ACTIVE'}
                                </Chip>
                            </View>
                        </View>
                        <IconButton icon="chevron-right" size={20} />
                    </View>
                </TouchableOpacity>
            </Surface>
        );
    }

    // Default rendering (Orders, etc.) - CARD STYLE (Industry Standard)
    return (
        <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
            <TouchableOpacity
                onPress={() => onPress(item)}
                onLongPress={() => onToggle(item.id)}
                delayLongPress={200}
            >
                <View style={[styles.cardContent, isMobile && styles.cardContentMobile]}>
                    <Checkbox
                        status={isSelected ? 'checked' : 'unchecked'}
                        onPress={() => onToggle(item.id)}
                    />

                    {!isMobile && (
                        <Avatar.Icon
                            size={40}
                            icon="package-variant-closed"
                            style={{ backgroundColor: theme.colors.secondaryContainer, marginLeft: 8 }}
                            color={theme.colors.onSecondaryContainer}
                        />
                    )}

                    <View style={[styles.textContainer, { marginLeft: isMobile ? 4 : 16 }]}>
                        {/* Top Row: Name & Price (Swapped) */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                    {item.customerName || 'No Name'}
                                </Text>
                                {/* Price moved to Left (under Name) - applied Order # style (Small/Subtle) */}
                                {/* Product Name Display */}
                                {(() => {
                                    const products = item.items || item.line_items || item.cart?.items || [];
                                    if (products.length > 0) {
                                        const firstProduct = products[0];
                                        const productName = firstProduct.name || firstProduct.title || 'Unknown Product';
                                        const extraCount = products.length - 1;
                                        return (
                                            <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.secondary, marginTop: 2 }}>
                                                {productName}{extraCount > 0 ? ` +${extraCount} more` : ''}
                                            </Text>
                                        );
                                    }
                                    return null;
                                })()}

                                {item.totalPrice && (
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, fontWeight: 'bold' }}>
                                        ₹{item.totalPrice}
                                    </Text>
                                )}
                            </View>

                            {/* Order # & Date (Right aligned) */}
                            <View style={{ alignItems: 'flex-end' }}>
                                {/* Order # moved to Right - applied Price style (Big/Primary) */}
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary, fontFamily: 'monospace' }}>
                                    #{item.orderNumber || item.id}
                                </Text>
                                <Text variant="labelSmall" style={{ color: theme.colors.outline, marginTop: 2 }}>
                                    {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                                </Text>
                            </View>
                        </View>

                        {/* Middle Row: Address & Contact */}
                        <View style={{ marginTop: 6 }}>
                            {item.phone && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Icon source="phone" size={12} color={theme.colors.onSurfaceVariant} />
                                    <CopyableText
                                        text={item.phone}
                                        style={{ marginLeft: 4 }}
                                        theme={theme}
                                        numberOfLines={1}
                                    />
                                </View>
                            )}
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
                                <Icon source="map-marker" size={12} color={theme.colors.onSurfaceVariant} style={{ marginTop: 2 }} />
                                {/* Address: Copyable and full width */}
                                <CopyableText
                                    text={[item.address1, item.city, item.province, item.zip].filter(Boolean).join(', ') || 'No Address'}
                                    display={[item.address1, item.city, item.province, item.zip].filter(Boolean).join(', ') || 'No Address'}
                                    style={{ marginLeft: 4, flex: 1 }}
                                    theme={theme}
                                    numberOfLines={null}
                                />
                            </View>
                        </View>

                        {/* Voice Note Section */}
                        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                            {item.voiceNoteUrl ? (
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: theme.colors.elevation.level2,
                                    borderRadius: 24,
                                    padding: 4,
                                    height: 48
                                }}>
                                    <IconButton
                                        icon={isPlaying ? "pause" : "play"}
                                        mode="contained"
                                        containerColor={theme.colors.primary}
                                        iconColor={theme.colors.onPrimary}
                                        size={24}
                                        onPress={handlePlayPause}
                                        loading={isLoadingSound}
                                        disabled={isLoadingSound}
                                    />
                                    <IconButton
                                        icon="delete"
                                        size={20}
                                        iconColor={theme.colors.error}
                                        onPress={() => onDeleteVoice && onDeleteVoice(item)}
                                    />
                                </View>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    {isUploading ? (
                                        <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                                    ) : (
                                        <Chip
                                            icon="microphone"
                                            mode="outlined"
                                            onPress={handleUpload}
                                            style={{ borderRadius: 20, borderColor: theme.colors.outlineVariant }}
                                            textStyle={{ fontSize: 12, fontWeight: 'bold' }}
                                        >
                                            Add Note
                                        </Chip>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Bottom Row: Tags (Status chips flow naturally here) */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
                            {/* Payment Status Tag */}
                            {selectedCollection === 'checkouts' ? (
                                <Chip
                                    mode="flat"
                                    compact
                                    style={[styles.chip, {
                                        backgroundColor: (item.latest_stage === 'ORDER_PLACED' || item.latest_stage === 'PAYMENT_INITIATED') ? theme.colors.primaryContainer :
                                            (item.latest_stage === 'CHECKOUT_ABANDONED' || item.eventType === 'ABANDONED') ? theme.colors.errorContainer :
                                                theme.colors.secondaryContainer,
                                    }]}
                                    textStyle={{ fontSize: 10, lineHeight: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold' }}
                                >
                                    {item.stage || item.latest_stage || 'ACTIVE'}
                                </Chip>
                            ) : (
                                <Chip
                                    mode="flat"
                                    compact
                                    style={[styles.chip, {
                                        backgroundColor: isCOD ? theme.colors.errorContainer : theme.colors.primaryContainer,
                                    }]}
                                    textStyle={{
                                        fontSize: 10, lineHeight: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold',
                                        color: isCOD ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer
                                    }}
                                >
                                    {isCOD ? 'COD' : 'PAID'}
                                </Chip>
                            )}

                            {/* COD Confirmation Status (Active if COD and NOT Shipped) */}
                            {(isCOD && selectedCollection !== 'checkouts' && item.cod_status !== 'shipped') && (
                                <Chip
                                    mode="flat"
                                    compact
                                    onPress={() => onCodToggle && onCodToggle(item)}
                                    style={[styles.chip, {
                                        backgroundColor: item.cod_status === 'confirmed' ? '#e6fffa' : '#fff7ed',
                                        borderColor: item.cod_status === 'confirmed' ? '#4ade80' : '#fdba74',
                                        borderWidth: 1
                                    }]}
                                    textStyle={{
                                        fontSize: 10, lineHeight: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold',
                                        color: item.cod_status === 'confirmed' ? '#166534' : '#9a3412'
                                    }}
                                >
                                    {item.cod_status === 'confirmed' ? 'CONFIRMED' : 'PENDING'}
                                </Chip>
                            )}

                            {/* Shipped Status (Visible if Shipped OR Admin and Confirmed) */}
                            {selectedCollection !== 'checkouts' && (item.cod_status === 'shipped' || (isAdmin && item.cod_status === 'confirmed')) && (
                                <Chip
                                    mode="flat"
                                    compact
                                    onPress={() => isAdmin && onShippedToggle && onShippedToggle(item)}
                                    showSelectedOverlay={true}
                                    style={[styles.chip, {
                                        backgroundColor: item.cod_status === 'shipped' ? theme.colors.primary : 'transparent',
                                        borderColor: theme.colors.primary,
                                        borderWidth: 1,
                                        opacity: (item.cod_status === 'shipped' || isAdmin) ? 1 : 0.7
                                    }]}
                                    textStyle={{
                                        fontSize: 10, lineHeight: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold',
                                        color: item.cod_status === 'shipped' ? theme.colors.onPrimary : theme.colors.primary
                                    }}
                                >
                                    {item.cod_status === 'shipped' ? 'SHIPPED' : 'MARK SHIPPED'}
                                </Chip>
                            )}
                        </View>

                        {/* Modification Warning (New Line) */}
                        {(item.adminEdited || item.verificationStatus === 'address_change_requested') && (
                            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                {item.verificationStatus === 'address_change_requested' ? (
                                    <Chip
                                        mode="outlined"
                                        style={{ borderColor: theme.colors.error, backgroundColor: theme.colors.errorContainer, height: 24 }}
                                    >
                                        <Text variant="labelSmall" style={{ color: theme.colors.error, fontWeight: 'bold', fontSize: 10, lineHeight: 10 }}>ADDR REQ</Text>
                                    </Chip>
                                ) : (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                        {/* Display Specific Modified Fields */}
                                        {item.adminModifiedFields && item.adminModifiedFields.length > 0 ? (
                                            item.adminModifiedFields.map(field => {
                                                // Map keys to readable labels
                                                const labelMap = {
                                                    totalPrice: 'PRICE',
                                                    customerName: 'NAME',
                                                    phone: 'PHONE',
                                                    address1: 'ADDRESS',
                                                    status: 'STATUS',
                                                    cod_status: 'COD',
                                                    email: 'EMAIL',
                                                    city: 'CITY',
                                                    state: 'STATE',
                                                    zip: 'ZIP',
                                                    orderNumber: 'ORDER #'
                                                };
                                                const label = labelMap[field] || field.toUpperCase();
                                                return (
                                                    <Chip
                                                        key={field}
                                                        mode="outlined"
                                                        style={{ borderColor: theme.colors.error, backgroundColor: theme.colors.errorContainer, height: 24 }}
                                                    >
                                                        <Text variant="labelSmall" style={{ color: theme.colors.error, fontWeight: 'bold', fontSize: 10, lineHeight: 10 }}>
                                                            {label} MODIFIED
                                                        </Text>
                                                    </Chip>
                                                );
                                            })
                                        ) : (
                                            // Fallback if no specific fields tracked but flag is true
                                            <Chip
                                                mode="outlined"
                                                style={{ borderColor: theme.colors.error, backgroundColor: theme.colors.errorContainer, height: 24 }}
                                            >
                                                <Text variant="labelSmall" style={{ color: theme.colors.error, fontWeight: 'bold', fontSize: 10, lineHeight: 10 }}>
                                                    ORDER MODIFIED
                                                </Text>
                                            </Chip>
                                        )}
                                    </View>
                                )}

                                {/* Admin Reset Button Inline */}
                                {isAdmin && item.adminEdited && onReset && (
                                    <IconButton
                                        icon="restore"
                                        size={16}
                                        iconColor={theme.colors.error}
                                        style={{ margin: 0, width: 20, height: 20 }}
                                        onPress={() => onReset(item)}
                                    />
                                )}
                            </View>
                        )}
                    </View>
                    <IconButton icon="chevron-right" size={20} />
                </View >
            </TouchableOpacity >
        </Surface>
    );
});

const styles = StyleSheet.create({
    listItem: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.08)',
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    docCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        marginBottom: 0
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16
    },
    cardContentMobile: {
        paddingHorizontal: 8, // Less sides padding on Mobile
        paddingVertical: 10
    },
    textContainer: {
        flex: 1,
        marginLeft: 16
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    chip: {
        height: 24,
        borderRadius: 6,
        paddingHorizontal: 0,
        justifyContent: 'center',
        alignItems: 'center'
    }
});

export default DocItem;

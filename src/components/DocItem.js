import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, TouchableWithoutFeedback, StyleSheet } from 'react-native';
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

const RecoverButton = ({ link, theme }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await Clipboard.setStringAsync(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <TouchableOpacity
            onPress={handleCopy}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: copied ? '#4caf50' : theme.colors.primaryContainer,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12
            }}
        >
            <Icon source={copied ? "check" : "link"} size={12} color={copied ? '#ffffff' : theme.colors.onPrimaryContainer} />
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: copied ? '#ffffff' : theme.colors.onPrimaryContainer, marginLeft: 4 }}>
                {copied ? "COPIED" : "RECOVER"}
            </Text>
        </TouchableOpacity>
    );
};

const DocItem = memo(({ item, isSelected, selectedCollection, theme, onPress, onToggle, onCodToggle, isAdmin, onReset, onAttachVoice, onDeleteVoice, onShippedToggle, onCancelToggle }) => {
    const { isMobile } = useResponsive();
    const isCOD = (item.paymentMethod === 'COD' || item.gateway === 'COD' || item.status === 'COD');

    // Voice Note Logic
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoadingSound, setIsLoadingSound] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [progressBarWidth, setProgressBarWidth] = useState(0);

    useEffect(() => {
        return sound ? () => { sound.unloadAsync(); } : undefined;
    }, [sound]);

    // Format milliseconds to MM:SS
    const formatTime = (millis) => {
        if (!millis) return '0:00';
        const minutes = Math.floor(millis / 60000);
        const seconds = Math.floor((millis % 60000) / 1000);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

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
                    { shouldPlay: true, progressUpdateIntervalMillis: 100 }
                );
                if (status.isLoaded) {
                    setSound(newSound);
                    setIsPlaying(true);
                    setDuration(status.durationMillis || 0);
                    newSound.setOnPlaybackStatusUpdate(s => {
                        if (s.isLoaded) {
                            setPosition(s.positionMillis);
                            setDuration(s.durationMillis || 0);
                            if (s.didJustFinish) {
                                setIsPlaying(false);
                                setPosition(0);
                                newSound.stopAsync();
                            }
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

    // Seek to a specific position when user taps on progress bar
    const progressBarRef = useRef(null);
    const progressBarLayoutRef = useRef({ x: 0, width: 0 });

    const handleSeek = useCallback(async (event) => {
        const { pageX } = event.nativeEvent;
        const { x: barX, width: barWidth } = progressBarLayoutRef.current;

        if (barWidth === 0) return;

        const touchX = pageX - barX;
        const seekRatio = Math.max(0, Math.min(1, touchX / barWidth));

        // If no sound loaded yet, load it first then seek
        if (!sound) {
            if (!item.voiceNoteUrl) return;
            try {
                setIsLoadingSound(true);
                const { sound: newSound, status } = await Audio.Sound.createAsync(
                    { uri: item.voiceNoteUrl },
                    { shouldPlay: false, progressUpdateIntervalMillis: 100 }
                );
                if (status.isLoaded) {
                    const targetDuration = status.durationMillis || 0;
                    const seekPosition = seekRatio * targetDuration;
                    setSound(newSound);
                    setDuration(targetDuration);
                    await newSound.setPositionAsync(seekPosition);
                    setPosition(seekPosition);
                    newSound.setOnPlaybackStatusUpdate(s => {
                        if (s.isLoaded) {
                            setPosition(s.positionMillis);
                            setDuration(s.durationMillis || 0);
                            if (s.didJustFinish) {
                                setIsPlaying(false);
                                setPosition(0);
                                newSound.stopAsync();
                            }
                        }
                    });
                }
            } catch (error) {
                console.error("Seek Load Error:", error);
            } finally {
                setIsLoadingSound(false);
            }
            return;
        }

        // Sound already loaded - just seek
        if (duration > 0) {
            const seekPosition = seekRatio * duration;
            try {
                await sound.setPositionAsync(seekPosition);
                setPosition(seekPosition);
            } catch (error) {
                console.error("Seek Error:", error);
            }
        }
    }, [sound, duration, item.voiceNoteUrl]);

    // Handle progress bar layout to get position and width
    const handleProgressLayout = useCallback((event) => {
        const { width } = event.nativeEvent.layout;
        // Measure the absolute position of the progress bar
        if (progressBarRef.current) {
            progressBarRef.current.measureInWindow((x, y, measuredWidth, height) => {
                progressBarLayoutRef.current = { x: x || 0, width: measuredWidth || width };
            });
        } else {
            progressBarLayoutRef.current = { x: 0, width };
        }
    }, []);

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
                            {/* Top Row: Description & Date */}
                            <View style={styles.rowBetween}>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }} numberOfLines={1}>
                                    {item.description || 'No Description'}
                                </Text>
                                {item.date && item.date.toDate && (
                                    <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                                        {item.date.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </Text>
                                )}
                            </View>

                            {/* Details Grid */}
                            <View style={{ marginTop: 4 }}>
                                {/* Type & Amount Row */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>
                                        {item.type ? item.type.toUpperCase() : 'TRANSACTION'}
                                    </Text>

                                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: isIncome ? theme.colors.primary : theme.colors.error }}>
                                        {isIncome ? '+' : '-'}₹{Math.abs(item.amount || 0).toLocaleString('en-IN')}
                                    </Text>
                                </View>

                                {/* Category (moved from top) */}
                                {item.category ? (
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>
                                        {item.category}
                                    </Text>
                                ) : <View />}

                                {/* Created At (Footer) */}
                                {item.createdAt && item.createdAt.toDate && (
                                    <Text variant="labelSmall" style={{ color: theme.colors.outlineVariant, fontSize: 10 }}>
                                        {item.createdAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                )}
                            </View>
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

        // Helper to extract location safely
        const getKeyLocation = () => {
            // Try explicit addresses first, then customer default, then fallback to root properties
            const addr = item.shipping_address || item.billing_address || item.customer?.default_address || item.default_address || item;

            // Some payloads (like Shiprocket) might have 'city' at root, others in address objs
            const city = addr.city || item.city;
            const state = addr.province_code || addr.province || addr.state || item.province || item.state;

            if (city && state) return `${city}, ${state}`;
            if (city) return city;
            return null;
        };

        // Helper to extract Traffic Source
        const getTrafficSource = () => {
            // Check Root fields OR nested attributes (common in Shopify/Fastrr)
            const source = item.referring_site ||
                item.landing_site ||
                item.custom_attributes?.landing_page_url || // <-- ADDED THIS BASED ON JSON
                item.cart_attributes?.landing_page_url ||
                item.note_attributes?.landing_page_url ||
                '';

            if (!source) return null;

            const lowerSource = source.toLowerCase();

            // 1. Google Ads (gclid is definitive)
            if (lowerSource.includes('gclid') || lowerSource.includes('google')) return { label: 'Google', icon: 'google' };

            // 2. Instagram (Specific checks first)
            if (lowerSource.includes('instagram') ||
                lowerSource.includes('utm_source=ig') ||
                lowerSource.includes('android-app://com.instagram') ||
                lowerSource.includes('ios-app://com.instagram')) {
                return { label: 'Instagram', icon: 'instagram' };
            }

            // 3. Facebook
            if (lowerSource.includes('facebook') || lowerSource.includes('fbclid')) return { label: 'Facebook', icon: 'facebook' };

            // 4. Other Socials
            if (lowerSource.includes('youtube') || lowerSource.includes('yt')) return { label: 'YouTube', icon: 'youtube' };
            if (lowerSource.includes('whatsapp') || lowerSource.includes('wa.me')) return { label: 'WhatsApp', icon: 'whatsapp' };

            // 5. Direct / Generic
            if (lowerSource.startsWith('http')) return { label: 'Web', icon: 'web' };

            return null;
        };

        const productName = getProductName();
        const locationText = getKeyLocation();
        const trafficSource = getTrafficSource();

        // Helper to extract Discount Code (String or Object)
        const getDiscountCode = () => {
            if (item.discount_codes && item.discount_codes.length > 0) {
                const first = item.discount_codes[0];
                if (typeof first === 'string') return first;
                if (typeof first === 'object' && first.code) return first.code;
            }
            if (item.applied_discount && item.applied_discount.title) { // Common in Shopify Orders
                return item.applied_discount.title;
            }
            return null;
        };
        const discountCode = getDiscountCode();

        const rtoRisk = item.rtoPredict; // 'low', 'high', etc.

        // Product Image Logic
        const productImageUrl = item.img_url || (item.items && item.items.length > 0 && item.items[0].img_url) || null;

        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={[styles.cardContent, isMobile && styles.cardContentMobile]}>
                        <Checkbox status={isSelected ? 'checked' : 'unchecked'} onPress={() => onToggle(item.id)} />

                        {!isMobile && (
                            <View>
                                {productImageUrl ? (
                                    <Avatar.Image
                                        size={40}
                                        source={{ uri: productImageUrl }}
                                        style={{ backgroundColor: theme.colors.surfaceVariant, marginLeft: 4 }}
                                    />
                                ) : (
                                    <Avatar.Icon
                                        size={40}
                                        icon="package-variant-closed"
                                        style={{ backgroundColor: theme.colors.secondaryContainer, marginLeft: 4 }}
                                        color={theme.colors.onSecondaryContainer}
                                    />
                                )}
                            </View>
                        )}

                        <View style={[styles.textContainer, { marginLeft: isMobile ? 4 : 16 }]}>
                            {/* Top Row: Name & Traffic Source */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flexShrink: 1 }} numberOfLines={1}>
                                        {item.customerName || item.first_name || 'Visitor'}
                                    </Text>
                                    {trafficSource && (
                                        <View style={{ marginLeft: 6, backgroundColor: theme.colors.surfaceVariant, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', alignItems: 'center' }}>
                                            <Icon source={trafficSource.icon} size={10} color={theme.colors.onSurfaceVariant} />
                                        </View>
                                    )}
                                    {rtoRisk && (
                                        <View style={{ marginLeft: 4, backgroundColor: rtoRisk === 'low' ? theme.colors.tertiaryContainer : theme.colors.errorContainer, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: rtoRisk === 'low' ? theme.colors.onTertiaryContainer : theme.colors.onErrorContainer }}>
                                                {rtoRisk.toUpperCase()} RTO
                                            </Text>
                                        </View>
                                    )}
                                </View>
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
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                    {(item.totalPrice > 0 || item.total_price > 0) && (
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'bold', marginRight: 8 }}>
                                            ₹{item.totalPrice || item.total_price}
                                        </Text>
                                    )}
                                    {/* Discount Code Tag */}
                                    {discountCode && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Icon source="tag" size={10} color={theme.colors.primary} />
                                            <Text style={{ fontSize: 10, color: theme.colors.primary, marginLeft: 2, fontWeight: 'bold' }}>
                                                {discountCode}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* Contact Row: Phone & Location */}
                            <View style={{ marginTop: 4 }}>
                                {(item.phone || item.phone_number || item.phoneNormalized) && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Icon source="phone" size={12} color={theme.colors.onSurfaceVariant} />
                                        <CopyableText
                                            text={item.phone || item.phone_number || item.phoneNormalized}
                                            style={{ marginLeft: 4 }}
                                            theme={theme}
                                            numberOfLines={1}
                                        />
                                    </View>
                                )}
                                {locationText && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                        <Icon source="map-marker" size={12} color={theme.colors.onSurfaceVariant} />
                                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                                            {locationText}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Bottom Row: Status, Payment & Recovery Link */}
                            <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <Chip
                                        mode="flat"
                                        compact
                                        style={[styles.chip, { backgroundColor: statusBg, height: 20 }]}
                                        textStyle={{ fontSize: 9, lineHeight: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold', color: statusText }}
                                    >
                                        {item.stage || item.latest_stage || 'ACTIVE'}
                                    </Chip>

                                    {item.payment_method && (
                                        <View style={{
                                            backgroundColor: theme.colors.surfaceVariant,
                                            borderRadius: 4,
                                            paddingHorizontal: 6,
                                            paddingVertical: 2,
                                            borderWidth: 1,
                                            borderColor: theme.colors.outlineVariant
                                        }}>
                                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                                                {item.payment_method.toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {(item.checkout_url || item.custom_attributes?.landing_page_url) && (
                                    <RecoverButton
                                        link={item.checkout_url || item.custom_attributes?.landing_page_url}
                                        theme={theme}
                                    />
                                )}
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
                        <View style={{ marginTop: 8 }}>
                            {item.voiceNoteUrl ? (

                                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation?.()}>
                                    <View style={{
                                        alignSelf: 'flex-start',
                                        maxWidth: 280,
                                        width: '100%',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        backgroundColor: theme.colors.elevation.level2,
                                        borderRadius: 20, // More rounded pill shape
                                        paddingVertical: 4,
                                        paddingHorizontal: 8,
                                        borderWidth: 1,
                                        borderColor: theme.colors.outlineVariant
                                    }}>
                                        {/* Play/Pause Button */}
                                        <View style={{
                                            backgroundColor: theme.colors.primaryContainer,
                                            borderRadius: 18,
                                            marginRight: 10
                                        }}>
                                            <IconButton
                                                icon={isPlaying ? "pause" : "play"}
                                                iconColor={theme.colors.primary}
                                                size={18}
                                                onPress={handlePlayPause}
                                                loading={isLoadingSound}
                                                disabled={isLoadingSound}
                                                style={{ margin: 0, width: 36, height: 36 }}
                                            />
                                        </View>

                                        {/* Interactive Seek Bar */}
                                        <View style={{ flex: 1, marginRight: 8 }}>
                                            <View
                                                ref={progressBarRef}
                                                onLayout={handleProgressLayout}
                                                onStartShouldSetResponder={() => true}
                                                onMoveShouldSetResponder={() => true}
                                                onResponderTerminationRequest={() => false}
                                                onResponderGrant={handleSeek}
                                                onResponderMove={handleSeek}
                                                style={{
                                                    height: 28,
                                                    justifyContent: 'center',
                                                    marginBottom: 2,
                                                }}
                                            >
                                                {/* Track Background */}
                                                <View style={{
                                                    height: 6,
                                                    backgroundColor: theme.colors.surfaceVariant,
                                                    borderRadius: 3,
                                                    overflow: 'visible',
                                                    position: 'relative'
                                                }}>
                                                    {/* Progress Fill */}
                                                    <View style={{
                                                        height: '100%',
                                                        width: `${(position / (duration || 1)) * 100}%`,
                                                        backgroundColor: theme.colors.primary,
                                                        borderRadius: 3
                                                    }} />
                                                    {/* Seek Thumb */}
                                                    <View style={{
                                                        position: 'absolute',
                                                        left: `${(position / (duration || 1)) * 100}%`,
                                                        top: '50%',
                                                        transform: [{ translateX: -7 }, { translateY: -7 }],
                                                        width: 14,
                                                        height: 14,
                                                        borderRadius: 7,
                                                        backgroundColor: theme.colors.primary,
                                                        borderWidth: 2,
                                                        borderColor: theme.colors.surface,
                                                        elevation: 3,
                                                        shadowColor: '#000',
                                                        shadowOffset: { width: 0, height: 2 },
                                                        shadowOpacity: 0.25,
                                                        shadowRadius: 2
                                                    }} />
                                                </View>
                                            </View>
                                            {/* Time Labels */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 9, fontWeight: '600' }}>
                                                    {formatTime(position)}
                                                </Text>
                                                <Text variant="labelSmall" style={{ color: theme.colors.outline, fontSize: 9 }}>
                                                    {formatTime(duration)}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Delete Button */}
                                        <IconButton
                                            icon="delete-outline"
                                            size={18}
                                            iconColor={theme.colors.error}
                                            style={{ margin: 0, width: 32, height: 32 }}
                                            onPress={() => onDeleteVoice && onDeleteVoice(item)}
                                        />
                                    </View>
                                </TouchableWithoutFeedback>
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
                            )
                            }
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

                            {/* COD Confirmation Status (Active if COD and NOT Shipped and NOT Cancelled) */}
                            {(isCOD && selectedCollection !== 'checkouts' && item.cod_status !== 'shipped' && item.cod_status !== 'cancelled') && (
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
                                        fontSize: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold',
                                        color: item.cod_status === 'confirmed' ? '#166534' : '#9a3412'
                                    }}
                                >
                                    {item.cod_status === 'confirmed' ? 'CONFIRMED' : 'PENDING'}
                                </Chip>
                            )}

                            {/* CANCELLED Status Chip */}
                            {(selectedCollection !== 'checkouts' && item.cod_status !== 'shipped') && (
                                <Chip
                                    mode="flat"
                                    compact
                                    onPress={() => onCancelToggle && onCancelToggle(item)}
                                    style={[styles.chip, {
                                        backgroundColor: item.cod_status === 'cancelled' ? theme.colors.errorContainer : 'transparent',
                                        borderColor: theme.colors.error,
                                        borderWidth: 1,
                                        opacity: 1, // Always visible to allow cancelling
                                        height: 32 // Explicit height for better touch target
                                    }]}
                                    textStyle={{
                                        fontSize: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold',
                                        color: item.cod_status === 'cancelled' ? theme.colors.onErrorContainer : theme.colors.error
                                    }}
                                >
                                    {item.cod_status === 'cancelled' ? 'CANCELLED' : 'CANCEL'}
                                </Chip>
                            )}

                            {/* Shipped Status (Visible if Shipped OR (Admin and Confirmed and NOT Cancelled)) */}
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
                                        opacity: (item.cod_status === 'shipped' || isAdmin) ? 1 : 0.7,
                                        height: 32 // Explicit height for better touch target
                                    }]}
                                    textStyle={{
                                        fontSize: 10, marginVertical: 0, marginHorizontal: 4, fontWeight: 'bold',
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
                </View>
            </TouchableOpacity>
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

// Custom comparison function for better memoization
const areEqual = (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.selectedCollection === nextProps.selectedCollection &&
        prevProps.item.voiceNoteUrl === nextProps.item.voiceNoteUrl &&
        prevProps.item.cod_status === nextProps.item.cod_status &&
        prevProps.item.adminEdited === nextProps.item.adminEdited
    );
};

export default memo(DocItem, areEqual);

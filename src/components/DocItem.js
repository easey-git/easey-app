import React, { memo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Surface, Checkbox, Avatar, Text, IconButton, Chip, Icon } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

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

const DocItem = memo(({ item, isSelected, selectedCollection, theme, onPress, onToggle }) => {
    const isCOD = (item.paymentMethod === 'COD' || item.gateway === 'COD' || item.status === 'COD');

    // Special rendering for Push Tokens
    if (selectedCollection === 'push_tokens') {
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={styles.cardContent}>
                        <Checkbox
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => onToggle(item.id)}
                        />
                        <Avatar.Icon
                            size={40}
                            icon={item.platform === 'ios' ? 'apple' : 'android'}
                            style={{ backgroundColor: theme.colors.secondaryContainer, marginLeft: 4 }}
                            color={theme.colors.onSecondaryContainer}
                        />
                        <View style={styles.textContainer}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                {item.platform ? item.platform.toUpperCase() : 'UNKNOWN'}
                            </Text>
                            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, fontFamily: 'monospace' }}>
                                {item.token}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                                User: {item.userId ? item.userId.substring(0, 8) + '...' : 'N/A'}
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
                    <View style={styles.cardContent}>
                        <Checkbox
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => onToggle(item.id)}
                        />
                        <Avatar.Icon
                            size={40}
                            icon={isInbound ? "arrow-bottom-left" : "arrow-top-right"}
                            style={{ backgroundColor: isInbound ? theme.colors.secondaryContainer : theme.colors.tertiaryContainer, marginLeft: 4 }}
                            color={isInbound ? theme.colors.onSecondaryContainer : theme.colors.onTertiaryContainer}
                        />
                        <View style={styles.textContainer}>
                            <View style={styles.rowBetween}>
                                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
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

    // Special rendering for Wallet Transactions
    if (selectedCollection === 'wallet_transactions') {
        const isIncome = item.type === 'income';
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={styles.cardContent}>
                        <Checkbox
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => onToggle(item.id)}
                        />
                        <Avatar.Icon
                            size={40}
                            icon={isIncome ? 'arrow-down-left' : 'arrow-up-right'}
                            style={{ backgroundColor: isIncome ? theme.colors.secondaryContainer : theme.colors.errorContainer, marginLeft: 4 }}
                            color={isIncome ? theme.colors.onSecondaryContainer : theme.colors.onErrorContainer}
                        />
                        <View style={styles.textContainer}>
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
                            <Text variant="labelSmall" style={{ color: theme.colors.outline }}>
                                {item.date?.toDate ? item.date.toDate().toLocaleString() : 'Just now'}
                            </Text>
                        </View>
                        <IconButton icon="chevron-right" size={20} />
                    </View>
                </TouchableOpacity>
            </Surface>
        );
    }

    // Special rendering for Notes / Dashboard
    if (selectedCollection === 'dashboard') {
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={styles.cardContent}>
                        <Checkbox
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => onToggle(item.id)}
                        />
                        <Avatar.Icon
                            size={40}
                            icon="notebook"
                            style={{ backgroundColor: theme.colors.tertiaryContainer, marginLeft: 4 }}
                            color={theme.colors.onTertiaryContainer}
                        />
                        <View style={styles.textContainer}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, textTransform: 'capitalize' }}>
                                {item.id}
                            </Text>
                            <Text variant="bodySmall" numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>
                                {item.content || item.note || 'No Content'}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.outline, marginTop: 4 }}>
                                Last Updated: {item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleString() : 'Unknown'}
                            </Text>
                        </View>
                        <IconButton icon="chevron-right" size={20} />
                    </View>
                </TouchableOpacity>
            </Surface>
        );
    }

    // Default rendering (Orders, Checkouts, etc.)
    return (
        <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
            <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                <View style={[styles.cardContent, { alignItems: 'flex-start' }]}>
                    <View style={{ paddingTop: 4 }}>
                        <Checkbox
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => onToggle(item.id)}
                        />
                    </View>
                    <Avatar.Icon
                        size={40}
                        icon="package-variant-closed"
                        style={{ backgroundColor: theme.colors.secondaryContainer, marginLeft: 4, marginTop: 4 }}
                        color={theme.colors.onSecondaryContainer}
                    />
                    <View style={styles.textContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginRight: 8 }}>
                                {item.customerName || 'No Name'}
                            </Text>
                            {selectedCollection === 'checkouts' ? (
                                <Chip
                                    mode="flat"
                                    compact
                                    style={[styles.chip, {
                                        backgroundColor: (item.latest_stage === 'ORDER_PLACED' || item.latest_stage === 'PAYMENT_INITIATED') ? theme.colors.primaryContainer :
                                            (item.latest_stage === 'CHECKOUT_ABANDONED' || item.eventType === 'ABANDONED') ? theme.colors.errorContainer :
                                                theme.colors.secondaryContainer,
                                    }]}
                                    textStyle={{
                                        fontSize: 10,
                                        lineHeight: 10,
                                        marginVertical: 0,
                                        marginHorizontal: 8,
                                        color: (item.latest_stage === 'ORDER_PLACED' || item.latest_stage === 'PAYMENT_INITIATED') ? theme.colors.onPrimaryContainer :
                                            (item.latest_stage === 'CHECKOUT_ABANDONED' || item.eventType === 'ABANDONED') ? theme.colors.onErrorContainer :
                                                theme.colors.onSecondaryContainer,
                                        fontWeight: 'bold'
                                    }}
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
                                        fontSize: 10,
                                        lineHeight: 10,
                                        marginVertical: 0,
                                        marginHorizontal: 8,
                                        color: isCOD ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer,
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {isCOD ? 'COD' : 'PAID'}
                                </Chip>
                            )}
                        </View>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontFamily: 'monospace', marginBottom: 6 }}>
                            Order #: {item.orderNumber || item.id}
                        </Text>
                        {item.phone && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                <Icon source="phone" size={14} color={theme.colors.onSurfaceVariant} />
                                <CopyableText text={item.phone} style={{ marginLeft: 6 }} theme={theme} />
                            </View>
                        )}
                        {item.email && (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Icon source="email" size={14} color={theme.colors.onSurfaceVariant} />
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 6 }}>
                                    {item.email}
                                </Text>
                            </View>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 }}>
                            <Icon source="map-marker" size={14} color={theme.colors.onSurfaceVariant} />
                            <CopyableText
                                text={[item.address1, item.city, item.province, item.zip].filter(Boolean).join(', ') || 'No Address'}
                                display={[item.address1, item.city, item.province, item.zip].filter(Boolean).join(', ') || 'No Address'}
                                style={{ marginLeft: 6, flex: 1 }}
                                theme={theme}
                                numberOfLines={2}
                            />
                        </View>
                        {item.totalPrice && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                <Icon source="cash" size={14} color={theme.colors.primary} />
                                <Text variant="bodySmall" style={{ color: theme.colors.primary, marginLeft: 6, fontWeight: 'bold' }}>
                                    ₹{item.totalPrice}
                                </Text>
                            </View>
                        )}
                    </View>
                    <IconButton icon="chevron-right" size={20} style={{ marginTop: 0 }} />
                </View>
            </TouchableOpacity>
        </Surface >
    );
});

const styles = StyleSheet.create({
    docCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        marginHorizontal: 4
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8
    },
    textContainer: {
        flex: 1,
        marginLeft: 12
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    chip: {
        height: 20,
        borderRadius: 4,
        paddingHorizontal: 0
    }
});

export default DocItem;

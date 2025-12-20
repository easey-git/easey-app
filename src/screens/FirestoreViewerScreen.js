import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, useTheme, Appbar, Surface, IconButton, Portal, Dialog, Button, Divider, TextInput, Switch, List, Checkbox, FAB, Paragraph, Snackbar, Avatar, Chip, Icon } from 'react-native-paper';
import { collection, getDocs, getDocsFromServer, getDoc, deleteDoc, updateDoc, doc, limit, query, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

const FirestoreViewerScreen = ({ navigation, route }) => {
    const [collections, setCollections] = useState(['orders', 'checkouts', 'push_tokens', 'whatsapp_messages']);
    const [selectedCollection, setSelectedCollection] = useState(route.params?.collection || 'orders');
    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [editedDoc, setEditedDoc] = useState(null);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());

    // Confirmation Dialog State
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [confirmTitle, setConfirmTitle] = useState('');
    const [confirmMessage, setConfirmMessage] = useState('');
    const [pendingAction, setPendingAction] = useState(null); // { type: 'bulk' | 'single', id?: string }

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarColor, setSnackbarColor] = useState('#333');

    const theme = useTheme();

    const showSnackbar = (message, isError = false) => {
        setSnackbarMessage(message);
        setSnackbarColor(isError ? theme.colors.error : theme.colors.inverseSurface);
        setSnackbarVisible(true);
    };

    useEffect(() => {
        fetchDocuments();
        setSelectedItems(new Set()); // Clear selection on collection change
    }, [selectedCollection]);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, selectedCollection), limit(100));
            // Force fetch from server to avoid stale cache issues
            const snapshot = await getDocsFromServer(q);
            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ref: doc.ref, // Store the reference directly
                ...doc.data()
            }));
            setDocuments(docs);
        } catch (error) {
            console.error("Error fetching docs:", error);
            showSnackbar("Failed to fetch documents", true);
        }
        setLoading(false);
    };

    const toggleSelection = (id) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const handleBulkDelete = () => {
        if (selectedItems.size === 0) return;
        setConfirmTitle("Bulk Delete");
        setConfirmMessage(`Delete ${selectedItems.size} documents?`);
        setPendingAction({ type: 'bulk' });
        setConfirmVisible(true);
    };

    const handleDelete = (id) => {
        setConfirmTitle("Delete Document");
        setConfirmMessage("Are you sure you want to delete this document?");
        setPendingAction({ type: 'single', id });
        setConfirmVisible(true);
    };

    const executeConfirm = async () => {
        setLoading(true);
        try {
            if (pendingAction?.type === 'bulk') {
                const batch = writeBatch(db);
                const itemsToDelete = Array.from(selectedItems);

                itemsToDelete.forEach(id => {
                    // Find the document object to get the ref
                    const docObj = documents.find(d => d.id === id);
                    if (docObj && docObj.ref) {
                        batch.delete(docObj.ref);
                    } else {
                        // Fallback (shouldn't happen if list is fresh)
                        const cleanId = id.trim();
                        const ref = doc(db, selectedCollection, cleanId);
                        batch.delete(ref);
                    }
                });

                await batch.commit();

                setSelectedItems(new Set());
                fetchDocuments();
                showSnackbar(`Successfully deleted ${itemsToDelete.length} documents`);
            } else if (pendingAction?.type === 'single') {
                // Find the document object to get the ref
                const docObj = documents.find(d => d.id === pendingAction.id);
                if (docObj && docObj.ref) {
                    await deleteDoc(docObj.ref);
                } else {
                    const docRef = doc(db, selectedCollection, pendingAction.id);
                    await deleteDoc(docRef);
                }
                setVisible(false);
                fetchDocuments();
                showSnackbar("Document deleted successfully");
            }
        } catch (error) {
            console.error("Error executing action:", error);
            showSnackbar(`Failed: ${error.message}`, true);
        } finally {
            setLoading(false);
            setConfirmVisible(false);
            setPendingAction(null);
        }
    };

    const handleSave = async () => {
        try {
            // Remove ID from data to avoid overwriting it
            const { id, ...dataToUpdate } = editedDoc;
            await updateDoc(doc(db, selectedCollection, id), dataToUpdate);
            setIsEditing(false);
            fetchDocuments();
            showSnackbar("Document updated successfully");
        } catch (error) {
            console.error("Error updating:", error);
            showSnackbar("Failed to update document", true);
        }
    };

    const showDocDetails = (docData) => {
        setSelectedDoc(docData);
        setEditedDoc(JSON.parse(JSON.stringify(docData))); // Deep copy for editing
        setIsEditing(false); // Default to view mode
        setVisible(true);
    };

    const updateField = (key, value, parentKey = null) => {
        setEditedDoc(prev => {
            if (parentKey) {
                return {
                    ...prev,
                    [parentKey]: {
                        ...prev[parentKey],
                        [key]: value
                    }
                };
            }
            return { ...prev, [key]: value };
        });
    };

    // Recursive Field Renderer
    const RenderField = ({ label, value, depth = 0, parentKey = null }) => {
        const paddingLeft = depth * 12;

        // 1. Handle Timestamps (Read-only for now)
        if (value && typeof value === 'object' && value.seconds) {
            const date = new Date(value.seconds * 1000).toLocaleString();
            return (
                <View style={[styles.fieldRow, { paddingLeft }]}>
                    <Text variant="labelSmall" style={{ color: theme.colors.primary, fontSize: 11 }}>{label}</Text>
                    <Text variant="bodySmall" style={{ fontSize: 12 }}>{date}</Text>
                </View>
            );
        }

        // 2. Handle Arrays/Objects (Nested)
        if (value && typeof value === 'object') {
            // Skip rawJson field for cleanliness, or show as text area
            if (label === 'rawJson') return null;

            return (
                <List.Accordion
                    title={label}
                    titleStyle={{ color: theme.colors.primary, fontWeight: 'bold', fontSize: 12 }}
                    style={{ backgroundColor: theme.colors.surface, paddingLeft: Math.max(0, paddingLeft - 12), paddingVertical: 0, minHeight: 36 }}
                >
                    {Object.entries(value).map(([k, v]) => (
                        <RenderField
                            key={k}
                            label={Array.isArray(value) ? `Item ${parseInt(k) + 1} ` : k}
                            value={v}
                            depth={depth + 1}
                            // Editing nested arrays/objects is complex, making read-only for deep nesting in this version
                            parentKey={depth === 0 ? label : null}
                        />
                    ))}
                </List.Accordion>
            );
        }

        // 3. Handle Booleans
        if (typeof value === 'boolean') {
            return (
                <View style={[styles.fieldRow, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft }]}>
                    <Text variant="bodySmall" style={{ fontSize: 12 }}>{label}</Text>
                    {isEditing ? (
                        <Switch
                            value={value}
                            onValueChange={(val) => updateField(label, val, parentKey)}
                            color={theme.colors.primary}
                        />
                    ) : (
                        <Text variant="bodySmall" style={{ fontWeight: 'bold', fontSize: 12 }}>{value ? 'True' : 'False'}</Text>
                    )}
                </View>
            );
        }

        // 4. Handle Strings/Numbers
        return (
            <View style={[styles.fieldRow, { paddingLeft }]}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>{label}</Text>
                {isEditing ? (
                    <TextInput
                        mode="outlined"
                        value={String(value)}
                        onChangeText={(text) => updateField(label, text, parentKey)}
                        style={{ backgroundColor: theme.colors.surface, height: 36, fontSize: 12 }}
                        dense
                    />
                ) : (
                    <Text variant="bodySmall" selectable style={{ fontSize: 12 }}>{String(value)}</Text>
                )}
            </View>
        );
    };

    const renderCollectionItem = ({ item }) => (
        <TouchableOpacity
            onPress={() => setSelectedCollection(item)}
            style={[
                styles.collectionTab,
                {
                    backgroundColor: selectedCollection === item ? theme.colors.primaryContainer : theme.colors.surface,
                    borderColor: theme.colors.outlineVariant
                }
            ]}
        >
            <Text style={{
                color: selectedCollection === item ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                fontWeight: 'bold'
            }}>
                {item.toUpperCase()}
            </Text>
        </TouchableOpacity>
    );

    const renderDocItem = useCallback(({ item }) => {
        const isSelected = selectedItems.has(item.id);
        return (
            <DocItem
                item={item}
                isSelected={isSelected}
                selectedCollection={selectedCollection}
                theme={theme}
                onPress={showDocDetails}
                onToggle={toggleSelection}
            />
        );
    }, [selectedItems, selectedCollection, theme, showDocDetails, toggleSelection]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} color={theme.colors.onSurface} />
                <Appbar.Content title="Firebase" titleStyle={{ fontWeight: 'bold', fontSize: 20 }} />

                {/* Select All Checkbox */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                    <Text variant="labelSmall" style={{ marginRight: 4 }}>All</Text>
                    <Checkbox
                        status={documents.length > 0 && selectedItems.size === documents.length ? 'checked' : 'unchecked'}
                        onPress={() => {
                            if (selectedItems.size === documents.length) {
                                setSelectedItems(new Set());
                            } else {
                                const allIds = new Set(documents.map(d => d.id));
                                setSelectedItems(allIds);
                            }
                        }}
                    />
                </View>

                {selectedItems.size > 0 ? (
                    <Button textColor={theme.colors.error} onPress={handleBulkDelete}>Delete ({selectedItems.size})</Button>
                ) : (
                    <Appbar.Action icon="refresh" onPress={fetchDocuments} />
                )}
            </Appbar.Header>

            <View style={{ paddingVertical: 12 }}>
                <FlatList
                    horizontal
                    data={collections}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => setSelectedCollection(item)}
                            style={[
                                styles.collectionTab,
                                {
                                    backgroundColor: selectedCollection === item ? theme.colors.primaryContainer : theme.colors.surface,
                                    borderColor: theme.colors.outlineVariant
                                }
                            ]}
                        >
                            <Text style={{
                                color: selectedCollection === item ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                                fontWeight: 'bold'
                            }}>
                                {item.toUpperCase()}
                            </Text>
                        </TouchableOpacity>
                    )}
                    keyExtractor={item => item}
                    contentContainerStyle={{ paddingHorizontal: 16 }}
                    showsHorizontalScrollIndicator={false}
                />
            </View>

            <Divider />

            <FlatList
                data={documents}
                renderItem={renderDocItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16 }}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                refreshing={loading}
                onRefresh={fetchDocuments}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
            />

            <Portal>
                <Dialog visible={visible} onDismiss={() => setVisible(false)} style={{ maxHeight: '90%' }}>
                    <Dialog.Title>
                        {isEditing ? 'Edit Document' : 'Document Details'}
                    </Dialog.Title>

                    <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
                        <ScrollView>
                            <View style={{ paddingHorizontal: 24 }}>
                                {editedDoc && Object.entries(editedDoc).map(([key, value]) => (
                                    key !== 'id' && (
                                        <RenderField key={key} label={key} value={value} />
                                    )
                                ))}
                            </View>
                        </ScrollView>
                    </Dialog.ScrollArea>

                    <Dialog.Actions>
                        <IconButton
                            icon={isEditing ? "close" : "pencil"}
                            onPress={() => setIsEditing(!isEditing)}
                            size={20}
                        />
                        {isEditing ? (
                            <Button mode="contained" onPress={handleSave}>
                                Save Changes
                            </Button>
                        ) : (
                            <Button
                                mode="outlined"
                                textColor={theme.colors.error}
                                onPress={() => handleDelete(selectedDoc.id)}
                            >
                                Delete
                            </Button>
                        )}
                        <Button onPress={() => setVisible(false)}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            {/* Confirmation Dialog */}
            <Portal>
                <Dialog visible={confirmVisible} onDismiss={() => setConfirmVisible(false)}>
                    <Dialog.Title>{confirmTitle}</Dialog.Title>
                    <Dialog.Content>
                        <Paragraph>{confirmMessage}</Paragraph>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setConfirmVisible(false)}>Cancel</Button>
                        <Button onPress={executeConfirm} textColor={theme.colors.error}>Confirm</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            {/* Success/Error Snackbar */}
            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={3000}
                style={{ backgroundColor: snackbarColor }}
            >
                <Text style={{ color: theme.colors.inverseOnSurface }}>{snackbarMessage}</Text>
            </Snackbar>
        </View>
    );
};

// Extracted, Memoized Document Item Component
const DocItem = React.memo(({ item, isSelected, selectedCollection, theme, onPress, onToggle }) => {
    const isCOD = (item.paymentMethod === 'COD' || item.gateway === 'COD' || item.status === 'COD');

    // Special rendering for Push Tokens
    if (selectedCollection === 'push_tokens') {
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
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
                        <View style={{ flex: 1, marginLeft: 12 }}>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
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
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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

    return (
        <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
            <TouchableOpacity onPress={() => onPress(item)} onLongPress={() => onToggle(item.id)} delayLongPress={200}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 }}>
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
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, marginRight: 8 }}>
                                {item.customerName || 'No Name'}
                            </Text>
                            {selectedCollection === 'checkouts' ? (
                                <Chip
                                    mode="flat"
                                    compact
                                    style={{
                                        backgroundColor: (item.latest_stage === 'ORDER_PLACED' || item.latest_stage === 'PAYMENT_INITIATED') ? theme.colors.primaryContainer :
                                            (item.latest_stage === 'CHECKOUT_ABANDONED' || item.eventType === 'ABANDONED') ? theme.colors.errorContainer :
                                                theme.colors.secondaryContainer,
                                        height: 20,
                                        borderRadius: 4,
                                        paddingHorizontal: 0
                                    }}
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
                                    style={{
                                        backgroundColor: isCOD ? theme.colors.errorContainer : theme.colors.primaryContainer,
                                        height: 20,
                                        borderRadius: 4,
                                        paddingHorizontal: 0
                                    }}
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
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 6 }}>
                                    {item.phone}
                                </Text>
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
                    </View>
                    <IconButton icon="chevron-right" size={20} style={{ marginTop: 0 }} />
                </View>
            </TouchableOpacity>
        </Surface >
    );
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    collectionTab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
    },
    docCard: {
        padding: 8,
        paddingRight: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    modalContent: {
        borderRadius: 12,
        padding: 12,
        maxHeight: '85%',
        width: '95%',
        maxWidth: 600,
        alignSelf: 'center'
    },
    fieldRow: {
        marginBottom: 2,
        paddingVertical: 1
    }
});

export default FirestoreViewerScreen;

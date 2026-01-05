import React, { useEffect, useState, useCallback } from 'react'; // Cache bust 1
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Alert, Platform } from 'react-native';
import { Text, useTheme, Appbar, Surface, IconButton, Portal, Dialog, Modal, Button, Divider, TextInput, Switch, List, Checkbox, FAB, Paragraph, Snackbar, Avatar, Chip, Icon } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { collection, query, where, limit, getDocs, doc, updateDoc, writeBatch, deleteField, getDocsFromServer, orderBy, startAfter, Timestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import DocItem from '../components/DocItem';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';
import { useResponsive } from '../hooks/useResponsive';

const FirestoreViewerScreen = ({ navigation, route }) => {
    const { hasPermission, role, user, loading: authLoading } = useAuth();
    const theme = useTheme(); // Move theme hook up

    if (authLoading) {
        return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
    }

    if (!hasPermission('access_orders')) {
        return <AccessDenied title="Database Restricted" message="You need permission to access the database." />;
    }

    const getAllowedCollections = useCallback(() => {
        const allowed = [];
        if (hasPermission('access_orders')) {
            allowed.push('orders', 'checkouts');
        }
        if (hasPermission('access_whatsapp')) {
            allowed.push('whatsapp_messages');
        }
        if (hasPermission('access_wallet')) {
            allowed.push('wallet_transactions');
        }
        // Restrict push_tokens
        if (hasPermission('manage_users')) {
            allowed.push('push_tokens');
        }
        return allowed;
    }, [hasPermission]);

    const [collections, setCollections] = useState(getAllowedCollections());
    const [selectedCollection, setSelectedCollection] = useState(() => {
        const allowed = getAllowedCollections();
        const paramCollection = route.params?.collection;
        return allowed.includes(paramCollection) ? paramCollection : allowed[0];
    });

    // Add Filter State
    const [filter, setFilter] = useState(route.params?.filter || null);

    useEffect(() => {
        const allowed = getAllowedCollections();
        setCollections(allowed);
        if (!allowed.includes(selectedCollection)) {
            setSelectedCollection(allowed[0]);
        }
        // Clear filter if switching collections, unless it's the initial mount
        if (selectedCollection !== route.params?.collection) {
            setFilter(null);
        }
    }, [getAllowedCollections, selectedCollection]); // Added selectedCollection dependency

    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [editedDoc, setEditedDoc] = useState(null);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [searchVisible, setSearchVisible] = useState(false);

    // ... (filteredDocuments memo remains same)

    const filteredDocuments = React.useMemo(() => {
        if (!searchQuery) return documents;
        const query = searchQuery.toLowerCase();
        return documents.filter(doc =>
            (doc.customerName && doc.customerName.toLowerCase().includes(query)) ||
            (doc.orderNumber && String(doc.orderNumber).toLowerCase().includes(query)) ||
            (doc.phone && String(doc.phone).includes(query)) ||
            (doc.email && doc.email.toLowerCase().includes(query)) ||
            (doc.id && doc.id.toLowerCase().includes(query))
        );
    }, [documents, searchQuery]);

    // ... (Dialog States remain same)
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [confirmTitle, setConfirmTitle] = useState('');
    const [confirmMessage, setConfirmMessage] = useState('');
    const [pendingAction, setPendingAction] = useState(null);

    // ... (Snackbar State remains same)
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarColor, setSnackbarColor] = useState('#333');

    const showSnackbar = (message, isError = false) => {
        setSnackbarMessage(message);
        setSnackbarColor(isError ? theme.colors.error : theme.colors.inverseSurface);
        setSnackbarVisible(true);
    };

    useEffect(() => {
        fetchDocuments();
        setSelectedItems(new Set());
    }, [selectedCollection, filter]); // Re-fetch when filter changes

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            let constraints = [];
            if (filter) {
                constraints.push(where(filter.field, "==", filter.value));
            }

            // Determine correct sort field based on collection schema
            const sortMapping = {
                whatsapp_messages: 'timestamp',
                checkouts: 'updatedAt',
                push_tokens: 'updatedAt',
                wallet_transactions: 'date'
            };
            const sortField = sortMapping[selectedCollection] || 'createdAt';

            // Sort by newest first
            constraints.push(orderBy(sortField, 'desc'));
            constraints.push(limit(100));

            const q = query(collection(db, selectedCollection), ...constraints);

            // Force fetch from server to avoid stale cache issues
            const snapshot = await getDocsFromServer(q);
            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ref: doc.ref,
                ...doc.data()
            }));
            setDocuments(docs);
        } catch (error) {
            console.error("Error fetching docs:", error);
            // If sorting fails (missing index or field), valid fallback to unsorted
            if (error.code === 'failed-precondition' || error.message.includes('index')) {
                showSnackbar("Missing Index: detailed sort disabled", true);
            } else {
                showSnackbar("Failed to fetch documents", true);
            }
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
                    // Always create a fresh reference from the current db instance
                    const cleanId = id.trim();
                    const docRef = doc(db, selectedCollection, cleanId);
                    batch.delete(docRef);
                });

                await batch.commit();

                setSelectedItems(new Set());
                fetchDocuments();
                showSnackbar(`Successfully deleted ${itemsToDelete.length} documents`);
            } else if (pendingAction?.type === 'single') {
                // Always create a fresh reference from the current db instance
                const docRef = doc(db, selectedCollection, pendingAction.id);
                await deleteDoc(docRef);
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
            // Remove ID and metadata fields from data to avoid overwriting them
            const { id, createdAt, updatedAt, ref, ...dataToUpdate } = editedDoc;

            // Calculate changed fields
            const changedFields = [];
            Object.keys(dataToUpdate).forEach(key => {
                // Ignore metadata
                if (key === 'adminEdited' || key === 'adminModifiedFields') return;

                const originalValue = selectedDoc[key];
                const newValue = dataToUpdate[key];

                // Simple equality check
                if (originalValue != newValue) { // Loose equality to handle number/string diffs if input type changed
                    changedFields.push(key);
                }
            });

            // Mark as edited by admin
            dataToUpdate.adminEdited = true;

            // Only update updatedAt for collections that use it for sorting (checkouts, push_tokens)
            // For orders, we DON'T want to update it because it would affect revenue calculations
            if (selectedCollection === 'checkouts' || selectedCollection === 'push_tokens') {
                dataToUpdate.updatedAt = new Date();
            }

            if (changedFields.length > 0) {
                dataToUpdate.adminModifiedFields = changedFields;
            } else if (selectedDoc.adminModifiedFields) {
                // Keep existing modification log if nothing new changed (or clear it? usually we want to persist "this was modified")
                // Let's keep it in dataToUpdate implicitly if we didn't remove it, but specific logic:
                // If we edited but detected no real changes, maybe we shouldn't update timestamp? 
                // But let's stick to user request: track changes.
                // If strictly no changes, changedFields is empty.
            }

            await updateDoc(doc(db, selectedCollection, id), dataToUpdate);
            setIsEditing(false);
            fetchDocuments();
            showSnackbar("Document updated successfully");
        } catch (error) {
            console.error("Error updating:", error);
            showSnackbar("Failed to update document", true);
        }
    };

    const handleResetModifications = async () => {
        try {
            await updateDoc(doc(db, selectedCollection, selectedDoc.id), {
                adminEdited: false,
                adminModifiedFields: deleteField()
            });
            setVisible(false);
            fetchDocuments();
            showSnackbar("Modifications reset successfully");
        } catch (error) {
            console.error("Error resetting modifications:", error);
            showSnackbar("Failed to reset modifications", true);
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

    const handleCodToggle = async (item) => {
        try {
            const newStatus = item.cod_status === 'confirmed' ? 'pending' : 'confirmed';
            await updateDoc(doc(db, selectedCollection, item.id), { cod_status: newStatus });
            // Local state update (optional if real-time listener is fast enough, but good for UX)
            setDocuments(prev => prev.map(d => d.id === item.id ? { ...d, cod_status: newStatus } : d));
            showSnackbar(`Order marked as ${newStatus}`);
        } catch (error) {
            console.error("Error toggling COD status:", error);
            showSnackbar("Failed to update status", true);
        }
    };

    const handleResetItem = async (item) => {
        try {
            await updateDoc(doc(db, selectedCollection, item.id), {
                adminEdited: false,
                adminModifiedFields: deleteField()
            });
            // Update local state immediately for snappy feel
            setDocuments(prev => prev.map(d => d.id === item.id ? {
                ...d,
                adminEdited: false,
                adminModifiedFields: undefined
            } : d));
            showSnackbar("Modifications reset");
        } catch (error) {
            console.error("Error resetting item:", error);
            showSnackbar("Failed to reset", true);
        }
    };

    const handleAttachVoice = async (item) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                // Return start of upload
                const asset = result.assets[0];
                const response = await fetch(asset.uri);
                const blob = await response.blob();
                const fileName = `voice_notes/${item.id}_${Date.now()}`;
                const storageRef = ref(storage, fileName);
                await uploadBytes(storageRef, blob);
                const url = await getDownloadURL(storageRef);
                await updateDoc(doc(db, selectedCollection, item.id), { voiceNoteUrl: url, voiceNoteName: asset.name || 'Voice Note' });
                setDocuments(prev => prev.map(d => d.id === item.id ? { ...d, voiceNoteUrl: url, voiceNoteName: asset.name || 'Voice Note' } : d));
                showSnackbar("Voice note attached");
                return true;
            }
            return false; // Canceled
        } catch (err) {
            console.error(err);
            showSnackbar("Failed to upload voice note", true);
            return false;
        }
    };

    const handleDeleteVoice = async (item) => {
        if (Platform.OS === 'web') {
            if (!confirm("Are you sure you want to delete this voice note?")) return;
        }
        // For native, Alert.alert should be used, but keeping it simple for now or assuming Alert works on web via polyfill (it often does)

        setLoading(true);
        try {
            try {
                const storageRef = ref(storage, item.voiceNoteUrl);
                await deleteObject(storageRef);
            } catch (e) { console.warn("Storage delete failed", e); }

            await updateDoc(doc(db, selectedCollection, item.id), { voiceNoteUrl: deleteField(), voiceNoteName: deleteField() });
            setDocuments(prev => prev.map(d => d.id === item.id ? { ...d, voiceNoteUrl: undefined, voiceNoteName: undefined } : d));
            showSnackbar("Voice note deleted");
        } catch (err) {
            console.error(err);
            showSnackbar("Failed to delete voice note", true);
        } finally {
            setLoading(false);
        }
    };

    const handleShippedToggle = async (item) => {
        try {
            // Reverting from 'shipped' goes back to 'confirmed' by default as logical step, or 'pending' if it was pending.
            // Assumption: Unchecking shipped means it goes back to active pool, usually 'confirmed' ready to ship.
            const newStatus = item.cod_status === 'shipped' ? 'confirmed' : 'shipped';
            await updateDoc(doc(db, selectedCollection, item.id), { cod_status: newStatus });
            setDocuments(prev => prev.map(d => d.id === item.id ? { ...d, cod_status: newStatus } : d));
            showSnackbar(`Order marked as ${newStatus.toUpperCase()}`);
        } catch (error) {
            console.error("Error toggling Shipped status:", error);
            showSnackbar("Failed to update status", true);
        }
    };

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
                onCodToggle={handleCodToggle}
                isAdmin={role === 'admin'}
                onReset={handleResetItem}
                onAttachVoice={handleAttachVoice}
                onDeleteVoice={handleDeleteVoice}
                onShippedToggle={handleShippedToggle}
            />
        );
    }, [selectedItems, selectedCollection, theme, showDocDetails, toggleSelection, role, handleCodToggle, handleResetItem, handleAttachVoice, handleDeleteVoice, handleShippedToggle]);

    const { isMobile } = useResponsive();

    return (
        <CRMLayout
            title="Firebase"
            navigation={navigation}
            scrollable={false}
            actions={
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {/* Select All Checkbox */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
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
                        <Text variant="labelSmall">All</Text>
                    </View>

                    {selectedItems.size > 0 ? (
                        <Button textColor={theme.colors.error} onPress={handleBulkDelete}>Delete ({selectedItems.size})</Button>
                    ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <IconButton icon="magnify" onPress={() => setSearchVisible(!searchVisible)} />
                            <Appbar.Action icon="refresh" onPress={fetchDocuments} />
                        </View>
                    )}
                </View>
            }
        >
            {searchVisible && (
                <View style={{ padding: 16, paddingBottom: 0 }}>
                    <TextInput
                        mode="outlined"
                        placeholder="Search by Name, Order #, Phone, Email..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        right={<TextInput.Icon icon="close" onPress={() => { setSearchQuery(''); setSearchVisible(false); }} />}
                        style={{ backgroundColor: theme.colors.surface }}
                    />
                </View>
            )}

            {filter && (
                <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                    <Chip
                        icon="filter-remove"
                        onClose={() => setFilter(null)}
                        mode="outlined"
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Filtering by {filter.value.toUpperCase()}
                    </Chip>
                </View>
            )}

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
                    contentContainerStyle={{ paddingHorizontal: isMobile ? 8 : 16 }}
                    showsHorizontalScrollIndicator={false}
                />
            </View>

            <Divider />

            <FlatList
                data={filteredDocuments}
                renderItem={renderDocItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 0, paddingBottom: 80 }}
                refreshing={loading}
                onRefresh={fetchDocuments}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
            />
            {/* Edit Modal - Full Screen on Mobile, Modal on Desktop */}
            {visible && isMobile ? (
                // Mobile: Full-screen overlay
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: theme.colors.background,
                    zIndex: 1000
                }}>
                    {/* Header */}
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.outlineVariant,
                        backgroundColor: theme.colors.surface
                    }}>
                        <Text variant="titleLarge" style={{ fontWeight: 'bold', flex: 1 }}>
                            {isEditing ? 'Edit Order' : 'Order Details'}
                        </Text>
                        <IconButton
                            icon="close"
                            size={24}
                            onPress={() => setVisible(false)}
                            style={{ margin: 0 }}
                        />
                    </View>

                    {/* Scrollable Content */}
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ padding: 16 }}
                        showsVerticalScrollIndicator={true}
                    >
                        {editedDoc && Object.entries(editedDoc).map(([key, value]) => {
                            // Hide system fields
                            const systemFields = ['id', 'createdAt', 'updatedAt', 'ref', 'rawJson'];
                            if (systemFields.includes(key)) return null;

                            // Skip complex nested objects
                            if (value && typeof value === 'object' && !value.seconds) return null;

                            // Render timestamp
                            if (value && typeof value === 'object' && value.seconds) {
                                const date = new Date(value.seconds * 1000).toLocaleString();
                                return (
                                    <View key={key} style={{ marginBottom: 16 }}>
                                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                                            {key}
                                        </Text>
                                        <Text variant="bodyLarge">{date}</Text>
                                    </View>
                                );
                            }

                            // Render boolean
                            if (typeof value === 'boolean') {
                                return (
                                    <View key={key} style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 16,
                                        paddingVertical: 8
                                    }}>
                                        <Text variant="bodyLarge">{key}</Text>
                                        {isEditing ? (
                                            <Switch
                                                value={value}
                                                onValueChange={(val) => updateField(key, val)}
                                                color={theme.colors.primary}
                                            />
                                        ) : (
                                            <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>
                                                {value ? 'Yes' : 'No'}
                                            </Text>
                                        )}
                                    </View>
                                );
                            }

                            // Full-width fields
                            const fullWidthFields = ['address1', 'address2', 'note', 'notes'];
                            const isFullWidth = fullWidthFields.includes(key);

                            // Render string/number
                            return (
                                <View key={key} style={{ marginBottom: 16 }}>
                                    <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                                        {key}
                                    </Text>
                                    {isEditing ? (
                                        <TextInput
                                            mode="outlined"
                                            value={String(value)}
                                            onChangeText={(text) => updateField(key, text)}
                                            style={{ backgroundColor: theme.colors.surface }}
                                            multiline={isFullWidth}
                                            numberOfLines={isFullWidth ? 3 : 1}
                                        />
                                    ) : (
                                        <Text variant="bodyLarge" selectable>
                                            {String(value) || '—'}
                                        </Text>
                                    )}
                                </View>
                            );
                        })}
                    </ScrollView>

                    {/* Footer Actions */}
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        padding: 16,
                        borderTopWidth: 1,
                        borderTopColor: theme.colors.outlineVariant,
                        gap: 8,
                        flexWrap: 'wrap',
                        backgroundColor: theme.colors.surface
                    }}>
                        {isEditing ? (
                            <>
                                <Button
                                    mode="outlined"
                                    onPress={() => {
                                        setIsEditing(false);
                                        setEditedDoc(JSON.parse(JSON.stringify(selectedDoc)));
                                    }}
                                    style={{ minWidth: 100 }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleSave}
                                    icon="content-save"
                                    style={{ minWidth: 100 }}
                                >
                                    Save
                                </Button>
                            </>
                        ) : (
                            <>
                                {role === 'admin' && selectedDoc?.adminEdited && (
                                    <Button
                                        mode="outlined"
                                        textColor={theme.colors.error}
                                        onPress={handleResetModifications}
                                        icon="restore"
                                        style={{ minWidth: 100 }}
                                    >
                                        Reset
                                    </Button>
                                )}
                                <Button
                                    mode="outlined"
                                    textColor={theme.colors.error}
                                    onPress={() => selectedDoc?.id && handleDelete(selectedDoc.id)}
                                    icon="delete"
                                    style={{ minWidth: 100 }}
                                >
                                    Delete
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={() => setIsEditing(true)}
                                    icon="pencil"
                                    style={{ minWidth: 100 }}
                                >
                                    Edit
                                </Button>
                            </>
                        )}
                    </View>
                </View>
            ) : visible && !isMobile ? (
                // Desktop: Modal
                <Portal>
                    <Modal
                        visible={visible}
                        onDismiss={() => setVisible(false)}
                        contentContainerStyle={[
                            {
                                backgroundColor: theme.colors.surface,
                                borderRadius: 16,
                                overflow: 'hidden',
                                alignSelf: 'center',
                                width: '90%',
                                maxWidth: 800,
                                maxHeight: '90%'
                            }
                        ]}
                    >
                        {/* Header */}
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 24,
                            borderBottomWidth: 1,
                            borderBottomColor: theme.colors.outlineVariant
                        }}>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }}>
                                {isEditing ? 'Edit Order' : 'Order Details'}
                            </Text>
                            <IconButton
                                icon="close"
                                size={24}
                                onPress={() => setVisible(false)}
                                style={{ margin: 0 }}
                            />
                        </View>

                        {/* Scrollable Content */}
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ padding: 24 }}
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                        >
                            <View style={{
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                gap: 16
                            }}>
                                {editedDoc && Object.entries(editedDoc).map(([key, value]) => {
                                    // Hide system fields
                                    const systemFields = ['id', 'createdAt', 'updatedAt', 'ref', 'rawJson'];
                                    if (systemFields.includes(key)) return null;

                                    // Skip complex nested objects for simplicity
                                    if (value && typeof value === 'object' && !value.seconds) return null;

                                    // Render timestamp
                                    if (value && typeof value === 'object' && value.seconds) {
                                        const date = new Date(value.seconds * 1000).toLocaleString();
                                        return (
                                            <View key={key} style={{
                                                marginBottom: 20,
                                                width: 'calc(50% - 8px)',
                                                minWidth: 250
                                            }}>
                                                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                                                    {key}
                                                </Text>
                                                <Text variant="bodyLarge">{date}</Text>
                                            </View>
                                        );
                                    }

                                    // Render boolean
                                    if (typeof value === 'boolean') {
                                        return (
                                            <View key={key} style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginBottom: 20,
                                                paddingVertical: 8,
                                                width: 'calc(50% - 8px)',
                                                minWidth: 250
                                            }}>
                                                <Text variant="bodyLarge">{key}</Text>
                                                {isEditing ? (
                                                    <Switch
                                                        value={value}
                                                        onValueChange={(val) => updateField(key, val)}
                                                        color={theme.colors.primary}
                                                    />
                                                ) : (
                                                    <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>
                                                        {value ? 'Yes' : 'No'}
                                                    </Text>
                                                )}
                                            </View>
                                        );
                                    }

                                    // Full-width fields (address, notes)
                                    const fullWidthFields = ['address1', 'address2', 'note', 'notes'];
                                    const isFullWidth = fullWidthFields.includes(key);

                                    // Render string/number
                                    return (
                                        <View key={key} style={{
                                            marginBottom: 20,
                                            width: isFullWidth ? '100%' : 'calc(50% - 8px)',
                                            minWidth: isFullWidth ? '100%' : 250
                                        }}>
                                            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                                                {key}
                                            </Text>
                                            {isEditing ? (
                                                <TextInput
                                                    mode="outlined"
                                                    value={String(value)}
                                                    onChangeText={(text) => updateField(key, text)}
                                                    style={{ backgroundColor: theme.colors.surface }}
                                                    multiline={isFullWidth}
                                                    numberOfLines={isFullWidth ? 3 : 1}
                                                />
                                            ) : (
                                                <Text variant="bodyLarge" selectable>
                                                    {String(value) || '—'}
                                                </Text>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </ScrollView>

                        {/* Footer Actions */}
                        <View style={{
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            padding: 24,
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.outlineVariant,
                            gap: 8,
                            flexWrap: 'wrap'
                        }}>
                            {isEditing ? (
                                <>
                                    <Button
                                        mode="outlined"
                                        onPress={() => {
                                            setIsEditing(false);
                                            setEditedDoc(JSON.parse(JSON.stringify(selectedDoc)));
                                        }}
                                        style={{ minWidth: 100 }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        mode="contained"
                                        onPress={handleSave}
                                        icon="content-save"
                                        style={{ minWidth: 100 }}
                                    >
                                        Save
                                    </Button>
                                </>
                            ) : (
                                <>
                                    {role === 'admin' && selectedDoc?.adminEdited && (
                                        <Button
                                            mode="outlined"
                                            textColor={theme.colors.error}
                                            onPress={handleResetModifications}
                                            icon="restore"
                                            style={{ minWidth: 100 }}
                                        >
                                            Reset
                                        </Button>
                                    )}
                                    <Button
                                        mode="outlined"
                                        textColor={theme.colors.error}
                                        onPress={() => selectedDoc?.id && handleDelete(selectedDoc.id)}
                                        icon="delete"
                                        style={{ minWidth: 100 }}
                                    >
                                        Delete
                                    </Button>
                                    <Button
                                        mode="contained"
                                        onPress={() => setIsEditing(true)}
                                        icon="pencil"
                                        style={{ minWidth: 100 }}
                                    >
                                        Edit
                                    </Button>
                                </>
                            )}
                        </View>
                    </Modal>
                </Portal>
            ) : null}

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
        </CRMLayout>
    );
};

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

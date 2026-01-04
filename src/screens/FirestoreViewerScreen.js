import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, useTheme, Appbar, Surface, IconButton, Portal, Dialog, Button, Divider, TextInput, Switch, List, Checkbox, FAB, Paragraph, Snackbar, Avatar, Chip, Icon } from 'react-native-paper';
import { collection, getDocsFromServer, deleteDoc, updateDoc, doc, limit, query, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import DocItem from '../components/DocItem';
import { CRMLayout } from '../components/CRMLayout';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';

const FirestoreViewerScreen = ({ navigation, route }) => {
    const { hasPermission } = useAuth();

    if (!hasPermission('access_orders')) {
        return <AccessDenied title="Database Restricted" message="You need permission to access the database." />;
    }

    const [collections, setCollections] = useState(['orders', 'checkouts', 'push_tokens', 'whatsapp_messages', 'wallet_transactions', 'dashboard']);
    const [selectedCollection, setSelectedCollection] = useState(route.params?.collection || 'orders');
    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [editedDoc, setEditedDoc] = useState(null);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [searchVisible, setSearchVisible] = useState(false);

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
                {item === 'dashboard' ? 'NOTES' : item.toUpperCase()}
            </Text>
        </TouchableOpacity>
    );

    const handleCodToggle = async (item) => {
        try {
            const newStatus = item.cod_status === 'confirmed' ? 'pending' : 'confirmed';
            await updateDoc(item.ref, { cod_status: newStatus });
            // Local state update (optional if real-time listener is fast enough, but good for UX)
            setDocuments(prev => prev.map(d => d.id === item.id ? { ...d, cod_status: newStatus } : d));
            showSnackbar(`Order marked as ${newStatus}`);
        } catch (error) {
            console.error("Error toggling COD status:", error);
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
            />
        );
    }, [selectedItems, selectedCollection, theme, showDocDetails, toggleSelection]);

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
                                {item === 'dashboard' ? 'NOTES' : item.toUpperCase()}
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
                data={filteredDocuments}
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

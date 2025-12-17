import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, useTheme, Appbar, Surface, IconButton, Portal, Modal, Button, Divider, TextInput, Switch, List, Checkbox, FAB, Dialog, Paragraph, Snackbar } from 'react-native-paper';
import { collection, getDocs, deleteDoc, updateDoc, doc, limit, query, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

const FirestoreViewerScreen = ({ navigation }) => {
    const [collections, setCollections] = useState(['orders', 'checkouts', 'customers']);
    const [selectedCollection, setSelectedCollection] = useState('orders');
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
    const [onConfirm, setOnConfirm] = useState(() => () => { });

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
            const q = query(collection(db, selectedCollection), limit(50));
            const snapshot = await getDocs(q);
            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
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
        setConfirmTitle("Bulk Delete");
        setConfirmMessage(`Delete ${selectedItems.size} documents?`);
        setOnConfirm(() => async () => {
            setLoading(true);
            console.log(`Attempting bulk delete of ${selectedItems.size} items from ${selectedCollection}`);
            try {
                const batch = writeBatch(db);
                selectedItems.forEach(id => {
                    console.log(`Queueing delete for: ${id}`);
                    const ref = doc(db, selectedCollection, id);
                    batch.delete(ref);
                });
                await batch.commit();
                console.log("Batch commit successful");
                setSelectedItems(new Set());
                fetchDocuments();
                showSnackbar("Documents deleted successfully");
            } catch (error) {
                console.error("Error bulk deleting:", error);
                showSnackbar(`Failed to delete: ${error.message}`, true);
            }
            setLoading(false);
            setConfirmVisible(false);
        });
        setConfirmVisible(true);
    };

    const handleDelete = (id) => {
        setConfirmTitle("Delete Document");
        setConfirmMessage("Are you sure you want to delete this document?");
        setOnConfirm(() => async () => {
            console.log(`Attempting to delete document: ${id} from collection: ${selectedCollection}`);
            try {
                const docRef = doc(db, selectedCollection, id);
                await deleteDoc(docRef);
                console.log("Delete successful");
                setVisible(false);
                fetchDocuments();
                showSnackbar("Document deleted successfully");
            } catch (error) {
                console.error("Error deleting document:", error);
                showSnackbar(`Failed to delete: ${error.message}`, true);
            }
            setConfirmVisible(false);
        });
        setConfirmVisible(true);
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

    const showDocDetails = (doc) => {
        setSelectedDoc(doc);
        setEditedDoc(JSON.parse(JSON.stringify(doc))); // Deep copy for editing
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
        const paddingLeft = depth * 16;

        // 1. Handle Timestamps (Read-only for now)
        if (value && typeof value === 'object' && value.seconds) {
            const date = new Date(value.seconds * 1000).toLocaleString();
            return (
                <View style={[styles.fieldRow, { paddingLeft }]}>
                    <Text variant="labelSmall" style={{ color: theme.colors.primary }}>{label}</Text>
                    <Text variant="bodyMedium">{date}</Text>
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
                    titleStyle={{ color: theme.colors.primary, fontWeight: 'bold', fontSize: 14 }}
                    style={{ backgroundColor: theme.colors.surface, paddingLeft: Math.max(0, paddingLeft - 16), paddingVertical: 0 }}
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
                    <Text variant="bodyMedium">{label}</Text>
                    {isEditing ? (
                        <Switch
                            value={value}
                            onValueChange={(val) => updateField(label, val, parentKey)}
                            color={theme.colors.primary}
                        />
                    ) : (
                        <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>{value ? 'True' : 'False'}</Text>
                    )}
                </View>
            );
        }

        // 4. Handle Strings/Numbers
        return (
            <View style={[styles.fieldRow, { paddingLeft }]}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
                {isEditing ? (
                    <TextInput
                        mode="outlined"
                        value={String(value)}
                        onChangeText={(text) => updateField(label, text, parentKey)}
                        style={{ backgroundColor: theme.colors.surface, height: 40 }}
                        dense
                    />
                ) : (
                    <Text variant="bodyMedium" selectable>{String(value)}</Text>
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

    const renderDocItem = ({ item }) => {
        const isSelected = selectedItems.has(item.id);
        return (
            <Surface style={[styles.docCard, { backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surface }]} elevation={1}>
                <TouchableOpacity onPress={() => showDocDetails(item)} onLongPress={() => toggleSelection(item.id)} delayLongPress={200}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Checkbox
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => toggleSelection(item.id)}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text variant="titleSmall" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                                {item.customerName || item.id}
                            </Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                {item.email || item.phone || 'No Contact Info'}
                            </Text>
                        </View>
                        <IconButton icon="chevron-right" size={20} />
                    </View>
                </TouchableOpacity>
            </Surface>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} color={theme.colors.onSurface} />
                <Appbar.Content title="Database" titleStyle={{ fontWeight: 'bold', fontSize: 20 }} />

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
            />

            {/* Details Modal */}
            <Portal>
                <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={{ padding: 20 }}>
                    <Surface style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>
                                {isEditing ? 'Edit Document' : 'Document Details'}
                            </Text>
                            <View style={{ flexDirection: 'row' }}>
                                <IconButton
                                    icon={isEditing ? "close" : "pencil"}
                                    onPress={() => setIsEditing(!isEditing)}
                                />
                                <IconButton icon="close" onPress={() => setVisible(false)} />
                            </View>
                        </View>

                        <ScrollView style={{ marginBottom: 16 }}>
                            {editedDoc && Object.entries(editedDoc).map(([key, value]) => (
                                key !== 'id' && (
                                    <RenderField key={key} label={key} value={value} />
                                )
                            ))}
                        </ScrollView>

                        {isEditing ? (
                            <Button mode="contained" onPress={handleSave} style={{ marginTop: 8 }}>
                                Save Changes
                            </Button>
                        ) : (
                            <Button
                                mode="outlined"
                                textColor={theme.colors.error}
                                style={{ marginTop: 8, borderColor: theme.colors.error }}
                                onPress={() => handleDelete(selectedDoc.id)}
                            >
                                Delete Document
                            </Button>
                        )}
                    </Surface>
                </Modal>
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
                        <Button onPress={onConfirm} textColor={theme.colors.error}>Confirm</Button>
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
                {snackbarMessage}
            </Snackbar>
        </View>
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
        padding: 20,
        height: '90%',
        width: '100%',
        alignSelf: 'center'
    },
    fieldRow: {
        marginBottom: 8,
        paddingVertical: 4
    }
});

export default FirestoreViewerScreen;

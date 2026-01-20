import React, { useEffect, useState, useCallback } from 'react'; // Cache bust 1
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Alert, Platform } from 'react-native';
import { Text, useTheme, Appbar, Surface, IconButton, Portal, Dialog, Modal, Button, Divider, TextInput, Switch, List, Checkbox, FAB, Paragraph, Snackbar, Avatar, Chip, Icon, ActivityIndicator } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { collection, query, where, limit, getDocs, doc, updateDoc, writeBatch, deleteField, getDocsFromServer, orderBy, startAfter, Timestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import DocItem from '../components/DocItem';
import { CRMLayout } from '../components/CRMLayout';
import { ActivityLogService } from '../services/activityLogService';
import { useAuth } from '../context/AuthContext';
import { AccessDenied } from '../components/AccessDenied';
import { useResponsive } from '../hooks/useResponsive';
import { DatePickerModal, registerTranslation, en } from 'react-native-paper-dates';
registerTranslation('en', en);

const FirestoreViewerScreen = ({ navigation, route }) => {
    const { hasPermission, role, user, loading: authLoading } = useAuth();
    const theme = useTheme(); // Move theme hook up

    if (authLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
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

    // Custom Date Picker State
    const [openDatePicker, setOpenDatePicker] = useState(false);
    const [customDate, setCustomDate] = useState(() => {
        if (route.params?.customDate) {
            return new Date(route.params.customDate);
        }
        return undefined;
    });

    // Edit Date Picker State
    const [editDatePickerVisible, setEditDatePickerVisible] = useState(false);
    const [editDateParams, setEditDateParams] = useState({ key: null, value: null, parentKey: null });

    useEffect(() => {
        const allowed = getAllowedCollections();
        setCollections(allowed);
        if (!allowed.includes(selectedCollection)) {
            setSelectedCollection(allowed[0]);
        }
        // Clear filter if switching collections
        if (selectedCollection !== route.params?.collection) {
            setFilter(null);
        }
    }, [getAllowedCollections, selectedCollection]);

    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [editedDoc, setEditedDoc] = useState(null);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination state
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const PAGE_SIZE = 25; // Reduced from 100 for better performance

    // Filter Documents with debouncing
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const filteredDocuments = documents;

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

    // Filter Persistence
    const [knownAttributes, setKnownAttributes] = useState({ events: new Set(), stages: new Set(), financialStatuses: new Set(), paymentGateways: new Set() });

    // 1. Reset Filters & Attributes when Collection Changes
    useEffect(() => {
        setKnownAttributes({ events: new Set(), stages: new Set(), financialStatuses: new Set(), paymentGateways: new Set() });
    }, [selectedCollection]);

    // 2. Fetch Data when Collection OR Filter changes
    useEffect(() => {
        setDocuments([]);
        fetchDocuments();
        setSelectedItems(new Set());
    }, [selectedCollection, filter, customDate, debouncedSearchQuery]);

    // Helper: Get Date Range
    const getDateRange = () => {
        if (customDate) {
            const start = new Date(customDate);
            start.setHours(0, 0, 0, 0); // Start of day
            const end = new Date(customDate);
            end.setHours(23, 59, 59, 999); // End of day
            return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
        }
        return { start: null, end: null };
    };

    const onDismissDatePicker = useCallback(() => {
        setOpenDatePicker(false);
    }, [setOpenDatePicker]);

    const onConfirmDatePicker = useCallback(
        ({ date }) => {
            setOpenDatePicker(false);
            setCustomDate(date);
        },
        [setOpenDatePicker, setCustomDate]
    );

    // ... (rest of code)

    // Update Known Attributes whenever documents successfully load
    useEffect(() => {
        if (documents.length > 0) {
            setKnownAttributes(prev => {
                const newEvents = new Set(prev.events);
                const newStages = new Set(prev.stages);
                const newStatuses = new Set(prev.statuses || []);
                const newFinancial = new Set(prev.financialStatuses || []);
                const newGateways = new Set(prev.paymentGateways || []);
                let changed = false;

                if (selectedCollection === 'checkouts') {
                    documents.forEach(doc => {
                        if (doc.eventType && !newEvents.has(doc.eventType)) {
                            newEvents.add(doc.eventType);
                            changed = true;
                        }
                        if (doc.latest_stage && !newStages.has(doc.latest_stage)) {
                            newStages.add(doc.latest_stage);
                            changed = true;
                        }
                    });
                    return changed ? { ...prev, events: newEvents, stages: newStages } : prev;
                } else if (selectedCollection === 'orders') {
                    documents.forEach(doc => {
                        // COD Status -> mapped to 'stages'
                        if (doc.cod_status && !newStages.has(doc.cod_status)) {
                            newStages.add(doc.cod_status);
                            changed = true;
                        }
                        // Root Status -> mapped to 'statuses'
                        if (doc.status && !newStatuses.has(doc.status)) {
                            newStatuses.add(doc.status);
                            changed = true;
                        }
                        // Financial Status
                        if (doc.financial_status && !newFinancial.has(doc.financial_status)) {
                            newFinancial.add(doc.financial_status);
                            changed = true;
                        }
                        // Payment Gateways
                        if (doc.payment_gateway_names && Array.isArray(doc.payment_gateway_names)) {
                            doc.payment_gateway_names.forEach(py => {
                                if (py && !newGateways.has(py)) {
                                    newGateways.add(py);
                                    changed = true;
                                }
                            });
                        }
                    });
                    return changed ? { ...prev, stages: newStages, statuses: newStatuses, financialStatuses: newFinancial, paymentGateways: newGateways } : prev;
                }

                return prev;
            });
        }
    }, [documents, selectedCollection]);

    const fetchDocuments = async (isLoadMore = false) => {
        if (isLoadMore) {
            if (!hasMore || loadingMore || loading) return;
            // Safety check: cannot load more without a cursor
            if (!lastDoc) return;
            setLoadingMore(true);
        } else {
            setLoading(true);
            setLastDoc(null);
            setHasMore(true);
        }

        try {
            // 0. Server-Side Search (Industry Standard Pattern for Firestore)
            if (debouncedSearchQuery && debouncedSearchQuery.trim().length > 0) {
                const searchText = debouncedSearchQuery.trim();
                const colRef = collection(db, selectedCollection);
                const searchQueries = [];

                // Helper to generate case permutations (e.g., "john" -> ["john", "John", "JOHN"])
                const getPermutations = (text) => {
                    const lower = text.toLowerCase();
                    const upper = text.toUpperCase();
                    const title = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
                    return Array.from(new Set([text, lower, upper, title]));
                };

                const permutations = getPermutations(searchText);

                // 1. ID Match (Exact) - All Collections
                searchQueries.push(query(colRef, where('id', '==', searchText)));

                // 2. Collection Specific Fields
                if (selectedCollection === 'orders' || selectedCollection === 'checkouts') {
                    // Order Number (Numeric & String)
                    if (!isNaN(searchText)) {
                        const numVal = Number(searchText);
                        searchQueries.push(query(colRef, where('orderNumber', '==', numVal)));
                        searchQueries.push(query(colRef, where('order_number', '==', numVal)));
                        // Also try string numeric
                        searchQueries.push(query(colRef, where('orderNumber', '==', searchText)));
                    }

                    // Phone (Exact & Prefix) - Phone usually doesn't need case permutations
                    searchQueries.push(query(colRef, where('phone', '>=', searchText), where('phone', '<=', searchText + '\uf8ff')));

                    // Email (Try permutations)
                    permutations.forEach(term => {
                        searchQueries.push(query(colRef, where('email', '==', term)));
                    });

                    // Customer Name & First Name (Prefix - Permutations)
                    permutations.forEach(term => {
                        searchQueries.push(query(colRef, where('customerName', '>=', term), where('customerName', '<=', term + '\uf8ff')));
                        searchQueries.push(query(colRef, where('first_name', '>=', term), where('first_name', '<=', term + '\uf8ff')));
                    });
                }

                if (selectedCollection === 'whatsapp_messages') {
                    searchQueries.push(query(colRef, where('phone', '>=', searchText), where('phone', '<=', searchText + '\uf8ff')));
                    searchQueries.push(query(colRef, where('phoneNormalized', '>=', searchText), where('phoneNormalized', '<=', searchText + '\uf8ff')));
                }

                if (selectedCollection === 'wallet_transactions') {
                    permutations.forEach(term => {
                        searchQueries.push(query(colRef, where('description', '>=', term), where('description', '<=', term + '\uf8ff')));
                        searchQueries.push(query(colRef, where('category', '==', term)));
                    });
                }

                // Execute all queries in parallel
                const results = await Promise.all(searchQueries.map(q => getDocs(q)));

                // Deduplicate & Merge Logic
                const mergedDocs = new Map();
                results.forEach(snapshot => {
                    snapshot.docs.forEach(doc => {
                        mergedDocs.set(doc.id, {
                            id: doc.id,
                            ref: doc.ref,
                            ...doc.data()
                        });
                    });
                });

                const finalDocs = Array.from(mergedDocs.values());

                // Client-side Sort
                finalDocs.sort((a, b) => {
                    const getDate = (d) => {
                        if (d.createdAt?.seconds) return d.createdAt.seconds;
                        if (d.timestamp?.seconds) return d.timestamp.seconds;
                        if (d.date?.seconds) return d.date.seconds;
                        if (d.updatedAt?.seconds) return d.updatedAt.seconds;
                        return 0;
                    };
                    return getDate(b) - getDate(a);
                });

                setDocuments(finalDocs);

                // Update State
                setHasMore(false);
                setLoading(false);
                setLoadingMore(false);
                return; // Exit fetchDocuments early
            }

            let constraints = [];

            // 1. Attribute Filters
            if (filter) {
                const op = filter.operator || "==";
                let val = filter.value;
                // Auto-convert ISO date strings to Date objects for Firestore comparison
                if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
                    val = new Date(val);
                }
                constraints.push(where(filter.field, op, val));
            }

            // 2. Date Filters
            if (customDate) {
                const { start, end } = getDateRange();
                // Siloed breakdown: checkouts -> updatedAt, others -> createdAt
                const dateField = selectedCollection === 'checkouts' ? 'updatedAt' : 'createdAt';

                if (start) constraints.push(where(dateField, '>=', start));
                if (end) constraints.push(where(dateField, '<=', end));
            }

            // Determine correct sort field based on collection schema
            const sortMapping = {
                whatsapp_messages: 'timestamp',
                checkouts: 'updatedAt',
                wallet_transactions: 'date',
            };
            const sortField = sortMapping[selectedCollection] || 'createdAt';

            // Sort by newest first
            constraints.push(orderBy(sortField, 'desc'));

            // Pagination
            if (isLoadMore && lastDoc) {
                constraints.push(startAfter(lastDoc));
            }
            constraints.push(limit(PAGE_SIZE));

            const q = query(collection(db, selectedCollection), ...constraints);

            // Use standard getDocs to utilize cache (much faster)
            const snapshot = await getDocs(q);
            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ref: doc.ref,
                ...doc.data()
            }));

            // Update pagination state
            if (snapshot.docs.length > 0) {
                setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
                setHasMore(snapshot.docs.length === PAGE_SIZE);
            } else {
                setHasMore(false);
            }

            // Append or replace documents
            if (isLoadMore) {
                setDocuments(prev => [...prev, ...docs]);
            } else {
                setDocuments(docs);
            }
        } catch (error) {
            console.error("Error fetching docs:", error);
            if (error.code === 'failed-precondition' || error.message.includes('index')) {
                showSnackbar("Missing Index: detailed sort disabled", true);
            } else {
                showSnackbar("Failed to fetch documents", true);
            }
        }

        if (isLoadMore) {
            setLoadingMore(false);
        } else {
            setLoading(false);
        }
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

        if (selectedItems.size === 1) {
            setConfirmTitle("Delete Document");
            setConfirmMessage("Are you sure you want to delete this document?");
        } else {
            setConfirmTitle("Bulk Delete");
            setConfirmMessage(`Delete ${selectedItems.size} documents?`);
        }

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

                // Log Activity
                if (user) {
                    ActivityLogService.log(
                        user.uid,
                        user.email,
                        'BULK_DELETE_DOCS',
                        `Deleted ${itemsToDelete.length} docs from ${selectedCollection}`,
                        { count: itemsToDelete.length, collection: selectedCollection }
                    );
                }

                setSelectedItems(new Set());
                fetchDocuments();
                showSnackbar(`Successfully deleted ${itemsToDelete.length} documents`);
            } else if (pendingAction?.type === 'single') {
                // Always create a fresh reference from the current db instance
                const docRef = doc(db, selectedCollection, pendingAction.id);
                await deleteDoc(docRef);

                // Log Activity
                if (user) {
                    const deletedDoc = documents.find(d => d.id === pendingAction.id);
                    const docIdentifier = deletedDoc?.order_number ? `#${deletedDoc.order_number}` : pendingAction.id;
                    const meta = { docId: pendingAction.id, collection: selectedCollection };
                    if (deletedDoc?.order_number) meta.orderNumber = deletedDoc.order_number;
                    ActivityLogService.log(
                        user.uid,
                        user.email,
                        'DELETE_DOC',
                        `Deleted ${docIdentifier} from ${selectedCollection}`,
                        meta
                    );
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
                // If we edited but detected no real changes, changedFields is empty.
            }

            await updateDoc(doc(db, selectedCollection, id), dataToUpdate);

            // Log Activity
            if (user) {
                const docIdentifier = selectedDoc.order_number ? `#${selectedDoc.order_number}` : id;
                const meta = { docId: id, collection: selectedCollection, changedFields };
                if (selectedDoc.order_number) meta.orderNumber = selectedDoc.order_number;
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'EDIT_DOC',
                    `Edited doc ${docIdentifier} in ${selectedCollection}`,
                    meta
                );
            }

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

            // Log Activity
            if (user) {
                const docIdentifier = selectedDoc.order_number ? `#${selectedDoc.order_number}` : selectedDoc.id;
                const meta = { docId: selectedDoc.id, collection: selectedCollection };
                if (selectedDoc.order_number) meta.orderNumber = selectedDoc.order_number;
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'RESET_DOC_MODS',
                    `Reset modifications for ${docIdentifier}`,
                    meta
                );
            }

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

    const handleEditDate = (key, value, parentKey = null) => {
        // value is { seconds, nanoseconds } or Date object
        let initialDate = new Date();
        if (value && value.seconds) {
            initialDate = new Date(value.seconds * 1000);
        } else if (value instanceof Date) {
            initialDate = value;
        }
        setEditDateParams({ key, value: initialDate, parentKey });
        setEditDatePickerVisible(true);
    };

    const updateField = useCallback((key, value, parentKey = null) => {
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
    }, []);

    const onConfirmEditDate = useCallback(
        ({ date }) => {
            setEditDatePickerVisible(false);
            if (editDateParams.key) {
                // Convert to Firestore Timestamp-like object or maintain Date depends on how updateDoc handles it.
                // updateDoc accepts Date objects.
                // But local state 'editedDoc' might expect { seconds } if we want to keep consistent rendering before save?
                // RenderField checks value.seconds.
                // Let's store as Firestore Timestamp to maintain consistency with RenderField logic
                const timestamp = Timestamp.fromDate(date);
                updateField(editDateParams.key, timestamp, editDateParams.parentKey);
            }
        },
        [editDateParams, updateField]
    );

    // Recursive Field Renderer
    const RenderField = ({ label, value, depth = 0, parentKey = null }) => {
        const paddingLeft = depth * 12;

        // 1. Handle Timestamps
        if (value && typeof value === 'object' && value.seconds) {
            const dateObj = new Date(value.seconds * 1000);
            const dateStr = dateObj.toLocaleString();

            return (
                <View style={[styles.fieldRow, { paddingLeft }]}>
                    <Text variant="labelSmall" style={{ color: theme.colors.primary, fontSize: 11 }}>{label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity
                            disabled={!isEditing}
                            onPress={() => handleEditDate(label, value, parentKey)}
                            style={{ flex: 1, paddingVertical: 4, borderBottomWidth: isEditing ? 1 : 0, borderBottomColor: theme.colors.outlineVariant }}
                        >
                            <Text variant="bodySmall" style={{ fontSize: 12, color: isEditing ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
                                {dateStr}
                            </Text>
                        </TouchableOpacity>

                        {isEditing && (
                            <IconButton
                                icon="pencil"
                                size={20}
                                onPress={() => handleEditDate(label, value, parentKey)}
                                iconColor={theme.colors.primary}
                            />
                        )}
                    </View>
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

            // Log Activity
            if (user) {
                const docIdentifier = item.order_number ? `#${item.order_number}` : item.id;
                const meta = { docId: item.id, collection: selectedCollection, newStatus };
                if (item.order_number) meta.orderNumber = item.order_number;
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'UPDATE_STATUS',
                    `Toggled COD status to ${newStatus} for ${docIdentifier}`,
                    meta
                );
            }

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

            // Log Activity
            if (user) {
                const docIdentifier = item.order_number ? `#${item.order_number}` : item.id;
                const meta = { docId: item.id, collection: selectedCollection };
                if (item.order_number) meta.orderNumber = item.order_number;
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'RESET_DOC_MODS',
                    `Reset modifications for ${docIdentifier}`,
                    meta
                );
            }

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

                // Log Activity
                if (user) {
                    const docIdentifier = item.order_number ? `#${item.order_number}` : item.id;
                    const meta = { docId: item.id, collection: selectedCollection };
                    if (item.order_number) meta.orderNumber = item.order_number;
                    ActivityLogService.log(
                        user.uid,
                        user.email,
                        'ATTACH_VOICE_NOTE',
                        `Attached voice note to ${docIdentifier}`,
                        meta
                    );
                }

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

            // Log Activity
            if (user) {
                const docIdentifier = item.order_number ? `#${item.order_number}` : item.id;
                const meta = { docId: item.id, collection: selectedCollection };
                if (item.order_number) meta.orderNumber = item.order_number;
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'DELETE_VOICE_NOTE',
                    `Deleted voice note from ${docIdentifier}`,
                    meta
                );
            }

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

            // Log Activity
            if (user) {
                const docIdentifier = item.order_number ? `#${item.order_number}` : item.id;
                const meta = { docId: item.id, collection: selectedCollection, newStatus };
                if (item.order_number) meta.orderNumber = item.order_number;
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'UPDATE_STATUS',
                    `Toggled SHIPPED status to ${newStatus} for ${docIdentifier}`,
                    meta
                );
            }

            setDocuments(prev => prev.map(d => d.id === item.id ? { ...d, cod_status: newStatus } : d));
            showSnackbar(`Order marked as ${newStatus.toUpperCase()}`);
        } catch (error) {
            console.error("Error toggling Shipped status:", error);
            showSnackbar("Failed to update status", true);
        }
    };

    const handleCancelToggle = async (item) => {
        try {
            // Reverting from 'cancelled' goes back to 'pending' (neutral state).
            const newStatus = item.cod_status === 'cancelled' ? 'pending' : 'cancelled';
            await updateDoc(doc(db, selectedCollection, item.id), { cod_status: newStatus });

            // Log Activity
            if (user) {
                const docIdentifier = item.order_number ? `#${item.order_number}` : item.id;
                const meta = { docId: item.id, collection: selectedCollection, newStatus };
                if (item.order_number) meta.orderNumber = item.order_number;
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'UPDATE_STATUS',
                    `Toggled CANCELLED status to ${newStatus} for ${docIdentifier}`,
                    meta
                );
            }

            setDocuments(prev => prev.map(d => d.id === item.id ? { ...d, cod_status: newStatus } : d));
            showSnackbar(`Order marked as ${newStatus.toUpperCase()}`);
        } catch (error) {
            console.error("Error toggling Cancelled status:", error);
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
                onCancelToggle={handleCancelToggle}
            />
        );
    }, [selectedItems, selectedCollection, theme, showDocDetails, toggleSelection, role, handleCodToggle, handleResetItem, handleAttachVoice, handleDeleteVoice, handleShippedToggle]);

    // Reusable Field Editor Component to ensure consistency across Mobile/Desktop views
    const EditFieldItem = ({ k, value, isEditing, onUpdate, onEditDate, theme, style }) => {
        // Render timestamp
        if (value && typeof value === 'object' && value.seconds) {
            const dateObj = new Date(value.seconds * 1000);
            const dateStr = dateObj.toLocaleString();
            return (
                <View style={style}>
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                        {k}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity
                            disabled={!isEditing}
                            onPress={() => onEditDate(k, value)}
                            style={{ flex: 1, paddingVertical: 4, borderBottomWidth: isEditing ? 1 : 0, borderBottomColor: theme.colors.outlineVariant }}
                        >
                            <Text variant="bodyLarge" style={{ color: isEditing ? theme.colors.onSurface : theme.colors.onSurface }}>
                                {dateStr}
                            </Text>
                        </TouchableOpacity>

                        {isEditing && (
                            <IconButton
                                icon="pencil"
                                size={20}
                                onPress={() => onEditDate(k, value)}
                                iconColor={theme.colors.primary}
                            />
                        )}
                    </View>
                </View>
            );
        }

        // Render boolean
        if (typeof value === 'boolean') {
            return (
                <View style={[style, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }]}>
                    <Text variant="bodyLarge">{k}</Text>
                    {isEditing ? (
                        <Switch
                            value={value}
                            onValueChange={(val) => onUpdate(k, val)}
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

        // Render string/number
        const fullWidthFields = ['address1', 'address2', 'note', 'notes', 'description'];
        const isFullWidth = fullWidthFields.includes(k);

        return (
            <View style={style}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                    {k}
                </Text>
                {isEditing ? (
                    <TextInput
                        mode="outlined"
                        value={String(value)}
                        onChangeText={(text) => onUpdate(k, text)}
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
    };

    const { isMobile } = useResponsive();

    return (
        <CRMLayout
            title={selectedCollection.replace(/_/g, ' ').toUpperCase()}
            navigation={navigation}
            scrollable={false}
            fullWidth={true}
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
                        <Button textColor={theme.colors.error} onPress={handleBulkDelete}>
                            {selectedItems.size === 1 ? 'Delete Item' : `Bulk Delete (${selectedItems.size})`}
                        </Button>
                    ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {customDate ? (
                                <Chip
                                    mode="flat"
                                    onClose={() => setCustomDate(undefined)}
                                    style={{ marginRight: 8, backgroundColor: theme.colors.secondaryContainer }}
                                    textStyle={{ color: theme.colors.onSecondaryContainer }}
                                    onPress={() => setOpenDatePicker(true)}
                                >
                                    {customDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </Chip>
                            ) : (
                                <IconButton
                                    icon="calendar"
                                    onPress={() => setOpenDatePicker(true)}
                                    iconColor={theme.colors.onSurface}
                                />
                            )}
                            <Appbar.Action icon="refresh" onPress={() => fetchDocuments()} />
                        </View>
                    )}
                </View>
            }
        >
            {/* Search Bar - Clean & Beautiful */}
            <View style={styles.searchContainer}>
                <Surface style={[styles.searchBar, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
                    <IconButton icon="magnify" size={20} iconColor={theme.colors.onSurfaceVariant} />
                    <TextInput
                        placeholder="Search by Name, Order #, Phone..."
                        placeholderTextColor={theme.colors.onSurfaceVariant}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={[styles.searchInput, { color: theme.colors.onSurface }]}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        theme={{ colors: { background: 'transparent' } }}
                    />
                    {searchQuery.length > 0 && <IconButton icon="close" size={20} onPress={() => setSearchQuery('')} />}
                </Surface>
            </View>



            <View style={{ paddingVertical: 12 }}>
                <FlatList
                    horizontal
                    data={collections}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => {
                                setFilter(null);
                                setSelectedCollection(item);
                            }}
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



            {/* DYNAMIC FILTERS FOR DOCUMENTS */}
            {(selectedCollection === 'checkouts' || selectedCollection === 'orders') && (
                <View style={{ paddingVertical: 8 }}>
                    <Text variant="labelMedium" style={{ marginBottom: 4, paddingHorizontal: 16, color: theme.colors.outline }}>Attributes</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                        {(() => {
                            let filters = [];

                            if (selectedCollection === 'orders') {
                                // HARDCODED ORDERS FILTERS (Standardized)
                                filters = [
                                    { label: 'ALL', value: null },
                                    { label: 'COD', value: 'COD', field: 'status' },
                                    { label: 'PAID', value: 'Paid', field: 'status' },
                                    { label: 'CONFIRMED', value: 'confirmed', field: 'cod_status' },
                                    { label: 'PENDING', value: 'pending', field: 'cod_status' },
                                    { label: 'CANCELLED', value: 'cancelled', field: 'cod_status' },
                                    { label: 'SHIPPED', value: 'shipped', field: 'cod_status' }
                                ];
                            } else if (selectedCollection === 'checkouts') {
                                // FULLY DYNAMIC / DATA-DRIVEN for Checkouts using discovered attributes
                                filters = [{ label: 'All', value: null }];

                                // 1. Add Event Types
                                if (knownAttributes.events) {
                                    Array.from(knownAttributes.events).sort().forEach(evt => {
                                        filters.push({
                                            label: String(evt).replace(/_/g, ' '),
                                            value: evt,
                                            field: 'eventType'
                                        });
                                    });
                                }

                                // 2. Add Stages
                                if (knownAttributes.stages) {
                                    Array.from(knownAttributes.stages).sort().forEach(stage => {
                                        filters.push({
                                            label: String(stage),
                                            value: stage,
                                            field: 'latest_stage'
                                        });
                                    });
                                }
                            }

                            return filters.map((f, index) => {
                                // Calculate dynamic values if needed
                                let queryValue = f.value;

                                // Selection State Logic
                                let isSelected = false;
                                if (!filter && f.value === null) {
                                    isSelected = true;
                                } else if (filter && f.value !== null) {
                                    const filterOp = filter.operator || '==';
                                    const configOp = f.operator || '==';

                                    if (filter.field === f.field && filterOp === configOp) {
                                        isSelected = filter.value === queryValue;
                                    }
                                }

                                return (
                                    <Chip
                                        key={`${f.field}-${f.label}-${index}`}
                                        icon={isSelected ? 'check' : undefined}
                                        onPress={() => setFilter(f.value !== null ? {
                                            field: f.field,
                                            operator: f.operator || '==',
                                            value: queryValue,
                                            label: f.label
                                        } : null)}
                                        style={{
                                            backgroundColor: isSelected ? theme.colors.secondaryContainer : theme.colors.surface,
                                            borderColor: isSelected ? theme.colors.secondaryContainer : theme.colors.outlineVariant,
                                            borderWidth: 1
                                        }}
                                        textStyle={{
                                            fontWeight: isSelected ? '700' : '400',
                                            color: isSelected ? theme.colors.onSecondaryContainer : theme.colors.onSurface
                                        }}
                                    >
                                        {f.label}
                                    </Chip>
                                );
                            });
                        })()}
                    </ScrollView>
                </View>
            )}

            <Divider />

            <FlatList
                style={{ flex: 1 }}
                data={filteredDocuments}
                renderItem={renderDocItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 12, paddingBottom: 80, flexGrow: 1 }}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                refreshing={loading}
                onRefresh={fetchDocuments}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                updateCellsBatchingPeriod={50}
                onEndReached={() => fetchDocuments(true)}
                onEndReachedThreshold={0.5}
                ListFooterComponent={() => (
                    loadingMore ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={theme.colors.primary} />
                            <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.outline }}>
                                Loading more...
                            </Text>
                        </View>
                    ) : !hasMore && filteredDocuments.length > 0 ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                                No more items
                            </Text>
                        </View>
                    ) : null
                )}
                ListEmptyComponent={() => (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                        {loading ? (
                            <ActivityIndicator size="large" color={theme.colors.primary} />
                        ) : (
                            <>
                                <Icon source="file-remove-outline" size={64} color={theme.colors.outline} />
                                <Text variant="titleMedium" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>
                                    No records found
                                </Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
                                    Try adjusting your filters
                                </Text>
                            </>
                        )}
                    </View>
                )}
            />
            <DatePickerModal
                locale="en"
                mode="single"
                visible={openDatePicker}
                onDismiss={onDismissDatePicker}
                date={customDate}
                onConfirm={onConfirmDatePicker}
            />

            <DatePickerModal
                locale="en"
                mode="single"
                visible={editDatePickerVisible}
                onDismiss={() => setEditDatePickerVisible(false)}
                date={editDateParams.value}
                onConfirm={onConfirmEditDate}
                presentationStyle="pageSheet"
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

                            return (
                                <EditFieldItem
                                    key={key}
                                    k={key}
                                    value={value}
                                    isEditing={isEditing}
                                    onUpdate={updateField}
                                    onEditDate={handleEditDate}
                                    theme={theme}
                                    style={{ marginBottom: 16 }}
                                />
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

                                    // Desktop Grid Logic
                                    const fullWidthFields = ['address1', 'address2', 'note', 'notes', 'description'];
                                    const isFullWidth = fullWidthFields.includes(key);

                                    return (
                                        <EditFieldItem
                                            key={key}
                                            k={key}
                                            value={value}
                                            isEditing={isEditing}
                                            onUpdate={updateField}
                                            onEditDate={handleEditDate}
                                            theme={theme}
                                            style={{
                                                marginBottom: 20,
                                                width: isFullWidth ? '100%' : 'calc(50% - 8px)',
                                                minWidth: isFullWidth ? '100%' : 250
                                            }}
                                        />
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

            {/* Confirmation Dialog (Compact & Industry Standard) */}
            <Portal>
                <Dialog visible={confirmVisible} onDismiss={() => setConfirmVisible(false)} style={{ maxWidth: 400, width: '100%', alignSelf: 'center' }}>
                    <Dialog.Title style={{ textAlign: 'center' }}>{confirmTitle}</Dialog.Title>
                    <Dialog.Content>
                        <Paragraph style={{ textAlign: 'center' }}>{confirmMessage}</Paragraph>
                    </Dialog.Content>
                    <Dialog.Actions style={{ justifyContent: 'center', paddingBottom: 16 }}>
                        <Button onPress={() => setConfirmVisible(false)} style={{ marginRight: 8 }}>Cancel</Button>
                        <Button mode="contained" onPress={executeConfirm} buttonColor={theme.colors.error} textColor={theme.colors.onError}>Delete</Button>
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
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    searchBar: {
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        paddingHorizontal: 4,
    },
    searchInput: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});

export default FirestoreViewerScreen;

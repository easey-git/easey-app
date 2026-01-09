import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, useTheme, FAB, Surface, Dialog, Portal, TextInput, IconButton, Snackbar, Button } from 'react-native-paper';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import * as Clipboard from 'expo-clipboard';
import { CRMLayout } from '../components/CRMLayout';

const NOTE_COLORS = [
    { value: 'default', label: 'Default' },
    { value: '#ffafa3', label: 'Red' },
    { value: '#f39f76', label: 'Orange' },
    { value: '#fff8b8', label: 'Yellow' },
    { value: '#e2f6d3', label: 'Green' },
    { value: '#b4ddd3', label: 'Teal' },
    { value: '#d4e4ed', label: 'Blue' },
    { value: '#aeccdc', label: 'Dark Blue' },
    { value: '#d3bfdb', label: 'Purple' },
    { value: '#f6e2dd', label: 'Pink' },
    { value: '#e9e3d4', label: 'Brown' },
    { value: '#efeff1', label: 'Grey' },
];

const NotesScreen = ({ navigation }) => {
    const theme = useTheme();
    const { user } = useAuth();
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Dialog States
    const [visible, setVisible] = useState(false);
    const [currentNote, setCurrentNote] = useState({ title: '', body: '', color: 'default' });
    const [isEditing, setIsEditing] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    // Persistence
    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'notes'), where('userId', '==', user.uid));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => {
                    const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : Date.now();
                    const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : Date.now();
                    return tB - tA;
                });
            setNotes(notesList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching notes:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    const handleSave = async () => {
        if (!currentNote.title.trim() && !currentNote.body.trim()) return;

        try {
            const noteData = {
                title: currentNote.title,
                body: currentNote.body,
                color: currentNote.color || 'default',
                updatedAt: serverTimestamp()
            };

            if (isEditing && currentNote.id) {
                await updateDoc(doc(db, 'notes', currentNote.id), noteData);
                showSnackbar('Note updated');
            } else {
                noteData.userId = user.uid;
                noteData.createdAt = serverTimestamp();
                await addDoc(collection(db, 'notes'), noteData);
                showSnackbar('Note created');
            }
            setVisible(false);
        } catch (error) {
            console.error("Error saving note:", error);
            showSnackbar('Error saving note');
        }
    };

    const handleDelete = async () => {
        if (!currentNote.id) return;
        try {
            await deleteDoc(doc(db, 'notes', currentNote.id));
            setVisible(false);
            showSnackbar('Note deleted');
        } catch (error) {
            console.error("Error deleting note:", error);
            showSnackbar('Error deleting note');
        }
    };

    const openEdit = (note) => {
        setCurrentNote({ ...note, color: note.color || 'default' });
        setIsEditing(true);
        setVisible(true);
    };

    const openNew = () => {
        setCurrentNote({ title: '', body: '', color: 'default' });
        setIsEditing(false);
        setVisible(true);
    };

    const showSnackbar = (msg) => {
        setSnackbarMessage(msg);
        setSnackbarVisible(true);
    };

    const filteredNotes = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return notes.filter(note =>
            (note.title && note.title.toLowerCase().includes(query)) ||
            (note.body && note.body.toLowerCase().includes(query))
        );
    }, [notes, searchQuery]);

    // Masonry Columns
    const leftColumn = filteredNotes.filter((_, i) => i % 2 === 0);
    const rightColumn = filteredNotes.filter((_, i) => i % 2 !== 0);

    const NoteCard = ({ item }) => {
        const isDefault = !item.color || item.color === 'default' || item.color === '#ffffff';
        // If it's a specific color, text should be dark (since colors are pastel). If default, respect theme.
        const textColor = isDefault ? theme.colors.onSurface : '#000000';
        const subTextColor = isDefault ? theme.colors.onSurfaceVariant : '#444444';
        const bgColor = isDefault ? theme.colors.surface : item.color;

        return (
            <Surface style={[styles.card, { backgroundColor: bgColor }]} elevation={1}>
                <TouchableOpacity onPress={() => openEdit(item)} activeOpacity={0.7}>
                    {!!item.title && (
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginBottom: 8, color: textColor }}>
                            {item.title}
                        </Text>
                    )}
                    {!!item.body && (
                        <Text variant="bodyMedium" numberOfLines={10} style={{ color: textColor, lineHeight: 20 }}>
                            {item.body}
                        </Text>
                    )}
                    <Text variant="labelSmall" style={{ color: subTextColor, marginTop: 12, opacity: 0.7 }}>
                        {item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Just now'}
                    </Text>
                </TouchableOpacity>
            </Surface>
        );
    };

    // Derived state for Dialog Colors
    const isDialogDefault = !currentNote.color || currentNote.color === 'default' || currentNote.color === '#ffffff';
    const dialogBg = isDialogDefault ? theme.colors.surface : currentNote.color;
    const dialogText = isDialogDefault ? theme.colors.onSurface : '#000000';
    const dialogGooglePlaceholder = isDialogDefault ? theme.colors.onSurfaceVariant : '#666666';

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <CRMLayout title="Notes" navigation={navigation}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Surface style={[styles.searchBar, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
                    <IconButton icon="magnify" size={20} iconColor={theme.colors.onSurfaceVariant} />
                    <TextInput
                        placeholder="Search your notes"
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

            {filteredNotes.length === 0 ? (
                <View style={[styles.emptyState, { opacity: 0.6 }]}>
                    <IconButton icon="notebook-edit-outline" size={80} iconColor={theme.colors.outline} style={{ margin: 0 }} />
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
                        {searchQuery ? 'No matching notes' : 'Capture your thoughts'}
                    </Text>
                    {!searchQuery && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                            Tap the + button to create a note
                        </Text>
                    )}
                </View>
            ) : (
                <View style={styles.gridContainer}>
                    <View style={styles.column}>
                        {leftColumn.map(item => <View key={item.id} style={{ marginBottom: 12 }}><NoteCard item={item} /></View>)}
                    </View>
                    <View style={styles.column}>
                        {rightColumn.map(item => <View key={item.id} style={{ marginBottom: 12 }}><NoteCard item={item} /></View>)}
                    </View>
                </View>
            )}

            <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                color={theme.colors.onPrimary}
                onPress={openNew}
            />

            {/* Edit/Create Dialog */}
            <Portal>
                <Dialog visible={visible} onDismiss={() => setVisible(false)} style={[styles.dialog, { backgroundColor: dialogBg }]}>
                    <Dialog.Content style={{ paddingBottom: 0 }}>
                        <TextInput
                            placeholder="Title"
                            value={currentNote.title}
                            onChangeText={text => setCurrentNote(prev => ({ ...prev, title: text }))}
                            style={[styles.dialogInput, { fontSize: 22, fontWeight: 'bold', color: dialogText, marginBottom: 12 }]}
                            placeholderTextColor={dialogGooglePlaceholder}
                            underlineColor="transparent"
                            activeUnderlineColor="transparent"
                            multiline
                            selectionColor={theme.colors.primary}
                            cursorColor={dialogText}
                            theme={{ colors: { background: 'transparent' } }}
                        />
                        <TextInput
                            placeholder="Note"
                            value={currentNote.body}
                            onChangeText={text => setCurrentNote(prev => ({ ...prev, body: text }))}
                            style={[styles.dialogInput, { fontSize: 16, color: dialogText, minHeight: 150 }]}
                            placeholderTextColor={dialogGooglePlaceholder}
                            underlineColor="transparent"
                            activeUnderlineColor="transparent"
                            multiline
                            selectionColor={theme.colors.primary}
                            cursorColor={dialogText}
                            theme={{ colors: { background: 'transparent' } }}
                        />
                    </Dialog.Content>

                    <View style={styles.colorPickerContainer}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 24, justifyContent: 'center' }}>
                            {NOTE_COLORS.map(c => (
                                <TouchableOpacity
                                    key={c.value}
                                    onPress={() => setCurrentNote(prev => ({ ...prev, color: c.value }))}
                                    style={[
                                        styles.colorCircle,
                                        {
                                            backgroundColor: c.value === 'default' ? theme.colors.surfaceVariant : c.value,
                                            borderColor: c.value === 'default' ? theme.colors.outline : 'transparent'
                                        },
                                        currentNote.color === c.value && { borderWidth: 2, borderColor: dialogText }
                                    ]}
                                >
                                    {c.value === 'default' && (
                                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                            <IconButton icon="format-color-highlight" size={16} iconColor={theme.colors.onSurfaceVariant} style={{ margin: 0 }} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <Dialog.Actions style={{ justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 }}>
                        {isEditing ? (
                            <IconButton icon="trash-can-outline" iconColor={theme.colors.error} onPress={handleDelete} />
                        ) : (
                            <View /> // Spacer
                        )}
                        <Button
                            mode="contained"
                            onPress={handleSave}
                            buttonColor={isDialogDefault ? theme.colors.primary : '#000000'}
                            textColor={isDialogDefault ? theme.colors.onPrimary : '#ffffff'}
                            style={{ minWidth: 100 }}
                        >
                            Save
                        </Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={2000}>
                {snackbarMessage}
            </Snackbar>
        </CRMLayout>
    );
};

const styles = StyleSheet.create({
    searchContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16
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
    gridContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 12,
    },
    column: {
        flex: 1,
    },
    card: {
        borderRadius: 12,
        padding: 16,
        // No fixed height, let content dictate
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 100
    },
    fab: {
        position: 'absolute',
        right: 16,
        bottom: 24,
        borderRadius: 16,
    },
    dialog: {
        borderRadius: 16,
    },
    dialogInput: {
        backgroundColor: 'transparent',
        paddingHorizontal: 0,
    },
    colorPickerContainer: {
        paddingVertical: 16,
    },
    colorCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden'
    }
});

export default NotesScreen;

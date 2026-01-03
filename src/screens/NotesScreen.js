import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { Text, useTheme, Appbar, FAB, Surface, Dialog, Portal, TextInput, IconButton, Snackbar, Button } from 'react-native-paper';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import * as Clipboard from 'expo-clipboard';

const NotesScreen = ({ navigation }) => {
    const theme = useTheme();
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Dialog States
    const [visible, setVisible] = useState(false);
    const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
    const [noteToDelete, setNoteToDelete] = useState(null);

    const [currentNote, setCurrentNote] = useState({ title: '', body: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    // Fetch Notes
    useEffect(() => {
        const q = query(collection(db, 'notes'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notesList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => {
                const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : Date.now());
                const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : Date.now());
                return tB - tA;
            });
            setNotes(notesList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching notes:", error);
            showSnackbar("Failed to load notes");
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSave = async () => {
        if (!currentNote.title.trim() && !currentNote.body.trim()) {
            return;
        }

        try {
            if (isEditing && currentNote.id) {
                await updateDoc(doc(db, 'notes', currentNote.id), {
                    title: currentNote.title,
                    body: currentNote.body,
                    updatedAt: serverTimestamp()
                });
                showSnackbar('Note updated');
            } else {
                await addDoc(collection(db, 'notes'), {
                    title: currentNote.title,
                    body: currentNote.body,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                showSnackbar('Note created');
            }
            setVisible(false);
            setCurrentNote({ title: '', body: '' });
        } catch (error) {
            console.error("Error saving note:", error);
            showSnackbar('Error saving note');
        }
    };

    const confirmDelete = (id) => {
        setNoteToDelete(id);
        setDeleteDialogVisible(true);
    };

    const handleDelete = async () => {
        if (!noteToDelete) return;
        try {
            await deleteDoc(doc(db, 'notes', noteToDelete));
            showSnackbar('Note deleted');
        } catch (error) {
            showSnackbar('Error deleting note');
        } finally {
            setDeleteDialogVisible(false);
            setNoteToDelete(null);
        }
    };

    const copyToClipboard = async (text) => {
        await Clipboard.setStringAsync(text);
        showSnackbar('Copied to clipboard');
    };

    const openEdit = (note) => {
        setCurrentNote(note);
        setIsEditing(true);
        setVisible(true);
    };

    const openNew = () => {
        setCurrentNote({ title: '', body: '' });
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

    const renderItem = ({ item }) => (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <TouchableOpacity onPress={() => openEdit(item)} style={{ flex: 1 }}>
                <View style={styles.cardHeader}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
                        {item.title || 'Untitled'}
                    </Text>
                    <IconButton
                        icon="content-copy"
                        size={20}
                        onPress={() => copyToClipboard(item.body)}
                        style={{ margin: 0 }}
                    />
                </View>
                <Text variant="bodyMedium" numberOfLines={3} style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                    {item.body}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.outline, marginTop: 8 }}>
                    {item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleDateString() : 'Just now'}
                </Text>
            </TouchableOpacity>
            <View style={styles.cardActions}>
                <IconButton icon="pencil" size={20} onPress={() => openEdit(item)} />
                <IconButton icon="delete" size={20} iconColor={theme.colors.error} onPress={() => confirmDelete(item.id)} />
            </View>
        </Surface>
    );

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
                <Appbar.BackAction onPress={() => navigation.goBack()} />
                <Appbar.Content title="Notes" titleStyle={{ fontWeight: 'bold' }} />
            </Appbar.Header>

            <View style={{ padding: 16 }}>
                <TextInput
                    mode="outlined"
                    placeholder="Search notes..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    left={<TextInput.Icon icon="magnify" />}
                    style={{ backgroundColor: theme.colors.surface }}
                    dense
                />
            </View>

            {filteredNotes.length === 0 ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
                    <IconButton icon="book-off-outline" size={64} iconColor={theme.colors.onSurfaceVariant} />
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>No notes found</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredNotes}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16, paddingTop: 0 }}
                    numColumns={1}
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                />
            )}

            <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: theme.colors.primary }]}
                color={theme.colors.onPrimary}
                onPress={openNew}
            />

            <Portal>
                {/* Edit/Create Dialog */}
                <Dialog visible={visible} onDismiss={() => setVisible(false)} style={{ maxHeight: '80%' }}>
                    <Dialog.Title>{isEditing ? 'Edit Note' : 'New Note'}</Dialog.Title>
                    <Dialog.Content>
                        <TextInput
                            label="Title"
                            value={currentNote.title}
                            onChangeText={text => setCurrentNote(prev => ({ ...prev, title: text }))}
                            mode="outlined"
                            style={{ marginBottom: 16, backgroundColor: theme.colors.surface }}
                        />
                        <TextInput
                            label="Content"
                            value={currentNote.body}
                            onChangeText={text => setCurrentNote(prev => ({ ...prev, body: text }))}
                            mode="outlined"
                            multiline
                            style={{ backgroundColor: theme.colors.surface, minHeight: 150 }}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setVisible(false)}>Cancel</Button>
                        <Button onPress={handleSave} mode="contained" style={{ marginLeft: 8 }}>Save</Button>
                    </Dialog.Actions>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
                    <Dialog.Title>Delete Note</Dialog.Title>
                    <Dialog.Content>
                        <Text variant="bodyMedium">Are you sure you want to delete this note? This action cannot be undone.</Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
                        <Button onPress={handleDelete} textColor={theme.colors.error}>Delete</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={2000}
            >
                {snackbarMessage}
            </Snackbar>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    card: {
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardActions: {
        justifyContent: 'space-between',
        marginLeft: 8,
    },
    fab: {
        position: 'absolute',
        margin: 16,
        right: 0,
        bottom: 0,
        borderRadius: 16,
    },
});

export default NotesScreen;

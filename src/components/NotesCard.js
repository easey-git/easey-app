import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface, Text, TextInput, useTheme, IconButton } from 'react-native-paper';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export const NotesCard = () => {
    const theme = useTheme();
    const [note, setNote] = useState('');
    const [status, setStatus] = useState('Loading...');
    const isFirstLoad = useRef(true);

    // Load note on mount
    useEffect(() => {
        const loadNote = async () => {
            try {
                const docRef = doc(db, 'dashboard', 'notes');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setNote(docSnap.data().content || '');
                } else {
                    setNote('');
                }
                setStatus('Ready');
            } catch (e) {
                console.error("Failed to load notes", e);
                setStatus('Error loading');
            } finally {
                // Small delay to prevent auto-save from triggering immediately after load
                setTimeout(() => {
                    isFirstLoad.current = false;
                }, 500);
            }
        };
        loadNote();
    }, []);

    // Auto-save logic
    useEffect(() => {
        if (isFirstLoad.current) return;

        setStatus('Typing...');
        const handler = setTimeout(async () => {
            setStatus('Saving...');
            try {
                await setDoc(doc(db, 'dashboard', 'notes'), {
                    content: note,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                setStatus('Saved');
            } catch (e) {
                console.error("Failed to save note", e);
                setStatus('Error saving');
            }
        }, 1500); // Save after 1.5s of inactivity

        return () => clearTimeout(handler);
    }, [note]);

    return (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IconButton icon="notebook" size={20} style={{ margin: 0, marginRight: 8 }} />
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                        Scratchpad
                    </Text>
                </View>
                <Text variant="labelSmall" style={{ color: status === 'Saved' ? theme.colors.primary : theme.colors.outline }}>
                    {status}
                </Text>
            </View>
            <TextInput
                mode="flat"
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Write down quick ideas, to-do lists, or reminders..."
                placeholderTextColor={theme.colors.outline}
                style={{
                    backgroundColor: 'transparent',
                    minHeight: 120,
                    fontSize: 14,
                    paddingHorizontal: 0
                }}
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                textColor={theme.colors.onSurfaceVariant}
            />
        </Surface>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
    },
    header: {
        flexDirection: 'row',

        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    }
});

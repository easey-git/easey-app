import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface, Text, TextInput, useTheme, IconButton } from 'react-native-paper';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export const NotesCard = ({ style }) => {
    const theme = useTheme();
    const { user } = useAuth();
    const [note, setNote] = useState('');
    const [status, setStatus] = useState('Loading...');
    const isFirstLoad = useRef(true);

    useEffect(() => {
        let unsubscribe;
        const fetchNote = async () => {
            if (!user) return;
            try {
                const docRef = doc(db, 'users', user.uid, 'scratchpad', 'main');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setNote(docSnap.data().content || '');
                }
                setStatus('Ready');
            } catch (error) {
                console.error("Error fetching note:", error);
                setStatus('Error');
            } finally {
                isFirstLoad.current = false;
            }
        };

        fetchNote();
        return () => unsubscribe && unsubscribe();
    }, [user]);

    useEffect(() => {
        if (isFirstLoad.current) return;

        const saveNote = async () => {
            if (!user) return;
            setStatus('Saving...');
            try {
                const docRef = doc(db, 'users', user.uid, 'scratchpad', 'main');
                await setDoc(docRef, {
                    content: note,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                setStatus('Saved');
            } catch (error) {
                console.error("Error saving note:", error);
                setStatus('Error');
            }
        };

        const timeoutId = setTimeout(() => {
            if (note !== '') saveNote();
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [note, user]);

    return (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }, style]} elevation={0}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IconButton icon="notebook" size={20} style={{ margin: 0, marginRight: 8 }} />
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                        NoteBook
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
                    flex: 1, // Allow input to grow
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

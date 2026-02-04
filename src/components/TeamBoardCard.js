import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface, Text, TextInput, useTheme, IconButton } from 'react-native-paper';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { ActivityLogService } from '../services/activityLogService';

export const TeamBoardCard = ({ style }) => {
    const theme = useTheme();
    const { user } = useAuth();
    const [note, setNote] = useState('');
    const [status, setStatus] = useState('Loading...');
    const [lastEditedBy, setLastEditedBy] = useState('');
    const isFirstLoad = useRef(true);

    // 1. Real-time Listener for Shared Team Board
    useEffect(() => {
        const docRef = doc(db, 'system', 'team_board');
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setNote(data.content || '');
                if (data.lastEditedBy) setLastEditedBy(data.lastEditedBy);
            } else {
                setNote('');
                setLastEditedBy('');
            }
            if (isFirstLoad.current) {
                setStatus('Live');
            }
            isFirstLoad.current = false;
        }, (error) => {
            console.error("Error fetching Team Board:", error);
            setStatus('Error');
        });

        return () => unsubscribe();
    }, []);

    // 2. Auto-Save Logic (Debounced)
    useEffect(() => {
        if (isFirstLoad.current) return;

        const saveNote = async () => {
            if (!user) return;
            try {
                setStatus('Saving...');
                const docRef = doc(db, 'system', 'team_board');
                await setDoc(docRef, {
                    content: note,
                    lastEditedBy: user.email || 'Unknown',
                    updatedAt: serverTimestamp()
                }, { merge: true });

                setStatus('Live');
            } catch (error) {
                console.error("Error saving Team Board:", error);
                setStatus('Error');
            }
        };

        const timeoutId = setTimeout(() => {
            saveNote();
        }, 1500); // Increased debounce to 1.5s for stability

        return () => clearTimeout(timeoutId);
    }, [note, user]); // Include user for correct attribution when switching accounts

    // Extract username from email (part before @)
    const getUsername = (email) => {
        if (!email) return '';
        return email.split('@')[0];
    };

    return (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }, style]} elevation={0}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IconButton icon="clipboard-text-outline" size={20} style={{ margin: 0, marginRight: 8 }} />
                    <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurfaceVariant }}>
                        Team Board
                    </Text>
                </View>
                <Text variant="labelSmall" style={{ color: status === 'Live' ? theme.colors.primary : theme.colors.outline }}>
                    {status}
                </Text>
            </View>
            <TextInput
                mode="flat"
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Share updates, tasks, or important info with the team..."
                placeholderTextColor={theme.colors.outline}
                style={{
                    backgroundColor: 'transparent',
                    flex: 1,
                    fontSize: 14,
                    paddingHorizontal: 0
                }}
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                textColor={theme.colors.onSurfaceVariant}
            />
            {lastEditedBy && (
                <Text variant="labelSmall" style={{ color: theme.colors.outline, marginTop: 8, alignSelf: 'flex-end', opacity: 0.7 }}>
                    Last edit: {getUsername(lastEditedBy)}
                </Text>
            )}
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

import React, { createContext, useState, useContext, useEffect } from 'react';
import { Audio } from 'expo-av';

const SoundContext = createContext();

export const useSound = () => useContext(SoundContext);

export const SoundProvider = ({ children }) => {
    const [soundEnabled, setSoundEnabled] = useState(true);

    useEffect(() => {
        const configureAudio = async () => {
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    staysActiveInBackground: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                });
            } catch (error) {

            }
        };
        configureAudio();
    }, []);

    // Sound playback disabled - using system notification sounds
    const soundMap = {};

    const playSound = async (type) => {
        // Disabled - notifications use system sounds
        return;
    };

    return (
        <SoundContext.Provider value={{
            soundEnabled,
            setSoundEnabled,
            playSound
        }}>
            {children}
        </SoundContext.Provider>
    );
};

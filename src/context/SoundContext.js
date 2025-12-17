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

    // SAFE SOUND MAPPING
    // 1. Place your mp3 files in assets/sounds/
    // 2. Uncomment the lines below to enable them
    const soundMap = {
        'live': require('../../assets/sounds/live.mp3'),
        // 'cash': require('../../assets/sounds/cash.mp3'),
        // 'chime': require('../../assets/sounds/chime.mp3'),
    };

    const playSound = async (type) => {
        if (!soundEnabled) return;



        try {
            // Simplified: Always use 'live' sound for now as requested
            let soundKey = 'live';
            let soundFile = soundMap[soundKey];

            if (soundFile) {
                const { sound } = await Audio.Sound.createAsync(soundFile);
                await sound.playAsync();
                sound.setOnPlaybackStatusUpdate(async (status) => {
                    if (status.didJustFinish) {
                        await sound.unloadAsync();
                    }
                });
            } else {

            }
        } catch (error) {

        }
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

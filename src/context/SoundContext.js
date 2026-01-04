import React, { createContext, useState, useContext, useEffect } from 'react';
// import { Audio } from 'expo-av'; // Deprecated and unused


const SoundContext = createContext();

export const useSound = () => useContext(SoundContext);

export const SoundProvider = ({ children }) => {
    const [soundEnabled, setSoundEnabled] = useState(true);

    // Audio configuration removed as sound is disabled


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

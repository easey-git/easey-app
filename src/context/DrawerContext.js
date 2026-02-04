import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DrawerContext = createContext({
    isDrawerOpen: false,
    openDrawer: () => { },
    closeDrawer: () => { },
    toggleDrawer: () => { },
    isSidebarExpanded: false,
    setSidebarExpanded: () => { },
    isSidebarPinned: false,
    toggleSidebarPinned: () => { }
});

export const DrawerProvider = ({ children }) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
    const [isSidebarPinned, setIsSidebarPinned] = useState(false);

    const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
    const toggleDrawer = useCallback(() => setIsDrawerOpen(prev => !prev), []);
    const toggleSidebarPinned = useCallback(() => setIsSidebarPinned(prev => !prev), []);

    useEffect(() => {
        const loadSidebarPrefs = async () => {
            try {
                const pinned = await AsyncStorage.getItem('sidebarPinned');
                if (pinned !== null) setIsSidebarPinned(pinned === 'true');
            } catch (error) {
                console.warn('Failed to load sidebar prefs', error);
            }
        };
        loadSidebarPrefs();
    }, []);

    useEffect(() => {
        const saveSidebarPrefs = async () => {
            try {
                await AsyncStorage.setItem('sidebarPinned', String(isSidebarPinned));
            } catch (error) {
                console.warn('Failed to save sidebar prefs', error);
            }
        };
        saveSidebarPrefs();
    }, [isSidebarPinned]);

    return (
        <DrawerContext.Provider value={{
            isDrawerOpen,
            openDrawer,
            closeDrawer,
            toggleDrawer,
            isSidebarExpanded,
            setSidebarExpanded: setIsSidebarExpanded,
            isSidebarPinned,
            toggleSidebarPinned,
        }}>
            {children}
        </DrawerContext.Provider>
    );
};

export const useDrawer = () => useContext(DrawerContext);

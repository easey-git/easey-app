import React, { createContext, useContext, useState, useCallback } from 'react';

const DrawerContext = createContext({
    isDrawerOpen: false,
    openDrawer: () => { },
    closeDrawer: () => { },
    toggleDrawer: () => { }
});

export const DrawerProvider = ({ children }) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
    const toggleDrawer = useCallback(() => setIsDrawerOpen(prev => !prev), []);

    return (
        <DrawerContext.Provider value={{ isDrawerOpen, openDrawer, closeDrawer, toggleDrawer }}>
            {children}
        </DrawerContext.Provider>
    );
};

export const useDrawer = () => useContext(DrawerContext);

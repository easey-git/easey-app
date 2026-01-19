import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ActivityLogService } from '../services/activityLogService';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    const ADMIN_EMAIL = 'easeyspace@yahoo.com';

    // ... useEffect ...

    const hasPermission = (permission) => {
        if (role === 'admin') return true;
        return permissions.includes(permission);
    };



    // ...



    useEffect(() => {
        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
            if (authUser) {
                try {
                    // Check if user document exists in Firestore
                    const userRef = doc(db, 'users', authUser.uid);
                    const userSnap = await getDoc(userRef);

                    let userRole = 'user';
                    let userPermissions = [];

                    // Check logic for auto-admin
                    const isSuperAdmin = authUser.email && authUser.email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();

                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        userRole = data.role || 'user';
                        userPermissions = data.permissions || [];


                        // If user exists but should be admin (and isn't), update them
                        if (isSuperAdmin) {
                            userRole = 'admin'; // FORCE ADMIN LOCALLY

                            if (data.role !== 'admin') {
                                try {
                                    await setDoc(userRef, { role: 'admin' }, { merge: true });
                                } catch (e) {
                                    console.error("Auto-assign admin failed:", e);
                                }
                            }
                        }
                    } else {
                        // Create user document if it doesn't exist
                        if (isSuperAdmin) {
                            userRole = 'admin';
                        }


                        // Use email username if displayName is missing
                        const defaultName = authUser.displayName || (authUser.email ? authUser.email.split('@')[0] : 'User');

                        await setDoc(userRef, {
                            email: authUser.email,
                            role: userRole,
                            permissions: [],
                            createdAt: new Date().toISOString(),
                            displayName: defaultName
                        });
                    }

                    setUser(authUser);
                    setRole(userRole);
                    setPermissions(userPermissions);


                    // Persist user session with role
                    await AsyncStorage.setItem('user', JSON.stringify({
                        uid: authUser.uid,
                        email: authUser.email,
                        displayName: authUser.displayName,
                        role: userRole
                    }));
                } catch (error) {
                    console.error("Error fetching user role:", error);
                    // Fallback to basic user if firestore fails
                    setUser(authUser);
                    setRole('user');
                }
            } else {
                setUser(null);
                setRole(null);
                await AsyncStorage.removeItem('user');
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const login = async (email, password) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Log Login
            ActivityLogService.log(
                userCredential.user.uid,
                userCredential.user.email,
                'LOGIN',
                'User logged in via email/password'
            );
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        try {
            if (user) {
                ActivityLogService.log(
                    user.uid,
                    user.email,
                    'LOGOUT',
                    'User logged out'
                );
            }
            await signOut(auth);
            await AsyncStorage.removeItem('user');
            setRole(null);
            setPermissions([]);
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            role,
            permissions,
            isAdmin: role === 'admin',
            hasPermission,
            loading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

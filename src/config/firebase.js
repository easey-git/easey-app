import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// TODO: Replace with your Firebase config object
const firebaseConfig = {
    apiKey: "AIzaSyCrp7A4FlGRbIkmPpzP0nxzae4u808RHBw",
    authDomain: "easey-db.firebaseapp.com",
    projectId: "easey-db",
    storageBucket: "easey-db.firebasestorage.app",
    messagingSenderId: "783483362570",
    appId: "1:783483362570:web:8cd006aa659d66e79baef3",
    measurementId: "G-CHZFNWKVYQ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

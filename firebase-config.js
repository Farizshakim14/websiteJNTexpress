/**
 * J&T Express - Transportation Monitoring System
 * Firebase SDK Configuration & Initialization (Project ID: jntexpres-c377f)
 * ⚡ FIREBASE-ONLY MODE — Live config, Email/Password Auth.
 */

// Firebase Configuration — LIVE (jntexpres-c377f)
const firebaseConfig = {
    apiKey: "AIzaSyAsd4dSEv_ARfcLtxst-c16DeTFP7hyeak",
    authDomain: "jntexpres-c377f.firebaseapp.com",
    projectId: "jntexpres-c377f",
    storageBucket: "jntexpres-c377f.firebasestorage.app",
    messagingSenderId: "667157450247",
    appId: "1:667157450247:web:3cf72a34486f15927da4a2",
    measurementId: "G-BCT0JWRGHT"
};

// Check if running on localhost with emulators enabled
const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
);
const useEmulator = isLocalhost &&
    window.location.search.includes('emulator=true');

if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    window.db   = firebase.firestore();
    window.auth = firebase.auth();

    if (useEmulator) {
        try {
            window.auth.useEmulator('http://127.0.0.1:9099');
            window.db.useEmulator('127.0.0.1', 8080);
            console.log('🛠️ Firebase Emulator Suite aktif (Auth:9099, Firestore:8080)');
        } catch (err) {
            console.warn('Emulator connection failed:', err.message);
        }
    }

    // ✅ NO ANONYMOUS AUTH — Returns current real (email/password) user saja.
    // Anonymous auth dihapus untuk mencegah spam akun di Firebase Auth.
    window.ensureFirebaseAuth = async function () {
        const currentUser = window.auth.currentUser;
        if (currentUser && !currentUser.isAnonymous) {
            return currentUser;
        }
        return null;
    };


    window.isFirebaseConfigPlaceholder = () => false; // Config sudah LIVE
    console.log('🔥 Firebase Initialized (LIVE):', firebaseConfig.projectId);

} else {
    console.warn('⚠️ Firebase SDK CDN belum dimuat sebelum firebase-config.js');
}

/**
 * J&T Express - Transportation Monitoring System
 * Firebase SDK Configuration & Initialization (Project ID: jntexpres-ab678)
 */

// Firebase Configuration for Project: jntexpres-ab678
const firebaseConfig = {
    apiKey: "AIzaSy_JNT_EXPRESS_DEMO_KEY",
    authDomain: "jntexpres-ab678.firebaseapp.com",
    projectId: "jntexpres-ab678",
    storageBucket: "jntexpres-ab678.firebasestorage.app",
    messagingSenderId: "102938475612",
    appId: "1:102938475612:web:jnt987654321"
};

// Check if running on localhost with emulators enabled or query flag
const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1'
);
const useEmulator = isLocalhost && (
    window.location.search.includes('emulator=true') || 
    localStorage.getItem('jnt_use_emulator') === 'true'
);

if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    auth = firebase.auth();

    if (useEmulator) {
        try {
            auth.useEmulator('http://127.0.0.1:9099');
            db.useEmulator('127.0.0.1', 8080);
            console.log("🛠️ Connected to Firebase Local Emulator Suite (Auth: 9099, Firestore: 8080)");
        } catch (err) {
            console.warn("Could not connect to Firebase emulator:", err.message);
        }
    }

    // Attach to window object for global accessibility
    window.db = db;
    window.auth = auth;
    window.isFirebaseConfigPlaceholder = () => {
        return firebaseConfig.apiKey.includes('DEMO_KEY') || firebaseConfig.projectId.includes('jntexpres-ab678');
    };
    console.log("🔥 Firebase Initialized:", firebaseConfig.projectId, window.isFirebaseConfigPlaceholder() ? "(PLACEHOLDER CONFIG)" : "(LIVE CONFIG)");
} else {
    console.warn("⚠️ Firebase SDK CDN scripts need to be loaded before firebase-config.js");
}

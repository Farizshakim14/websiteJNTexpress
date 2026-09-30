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

// Initialize Firebase App & Services
let db = null;
let auth = null;

if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    auth = firebase.auth();

    // Ensure user is authenticated for Firestore rules
    auth.onAuthStateChanged((user) => {
        if (!user) {
            auth.signInAnonymously().catch(err => console.warn("Firebase Anonymous Auth:", err.message));
        }
    });

    // Attach to window object for global accessibility
    window.db = db;
    window.auth = auth;
    console.log("🔥 Firebase Firestore Connected: jntexpres-ab678");
} else {
    console.warn("⚠️ Firebase SDK CDN scripts need to be loaded before firebase-config.js");
}

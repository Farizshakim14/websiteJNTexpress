/**
 * J&T Express - Transportation Monitoring System
 * Firebase SDK Configuration & Initialization (Project ID: jntexpres-ab678)
 * ⚡ FIREBASE-ONLY MODE — Live config, Anonymous Auth untuk Firestore access.
 */

// Firebase Configuration — LIVE (jntexpres-ab678)
const firebaseConfig = {
    apiKey: "AIzaSyDa7-G9pAtUChHfya-XM8YZcX-WP1kfVeU",
    authDomain: "jntexpres-ab678.firebaseapp.com",
    databaseURL: "https://jntexpres-ab678-default-rtdb.firebaseio.com",
    projectId: "jntexpres-ab678",
    storageBucket: "jntexpres-ab678.firebasestorage.app",
    messagingSenderId: "178404857541",
    appId: "1:178404857541:web:dc146ca198cbeef24242ac",
    measurementId: "G-2NW170G2VZ"
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

    // ⚡ AUTO ANONYMOUS AUTH — Sign in anonymously agar request.auth != null
    // Dipanggil otomatis saat halaman load. Jika sudah ada sesi auth, skip.
    window.ensureFirebaseAuth = async function () {
        try {
            const currentUser = window.auth.currentUser;
            if (currentUser) {
                console.log('🔑 Firebase Auth: sesi aktif UID =', currentUser.uid);
                return currentUser;
            }
            const cred = await window.auth.signInAnonymously();
            console.log('🔑 Firebase Auth: Anonymous sign-in berhasil, UID =', cred.user.uid);
            return cred.user;
        } catch (err) {
            console.error('❌ Firebase Anonymous Auth gagal:', err.message);
            return null;
        }
    };

    // Jalankan saat halaman load (jika user sudah login ke app)
    window.auth.onAuthStateChanged((user) => {
        if (!user) {
            // Cek apakah user sudah login ke sistem lokal
            const isLoggedIn = sessionStorage.getItem('jnt_is_logged_in') === 'true';
            if (isLoggedIn) {
                // Sign in anonymously supaya Firestore rules terpenuhi
                window.ensureFirebaseAuth();
            }
        }
    });

    window.isFirebaseConfigPlaceholder = () => false; // Config sudah LIVE
    console.log('🔥 Firebase Initialized (LIVE):', firebaseConfig.projectId);

} else {
    console.warn('⚠️ Firebase SDK CDN belum dimuat sebelum firebase-config.js');
}

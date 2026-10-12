/**
 * J&T Express TMS v5 - Phase 1 Firebase Authentication & Identity Test Suite
 * Automated Test Runner for Auth, Legacy Account Migration, RBAC, and Route Guards
 */

const assert = require('assert');

// 1. Mock Browser Environment
const storageMap = {};
global.sessionStorage = {
    getItem(k) { return storageMap[k] || null; },
    setItem(k, v) { storageMap[k] = String(v); },
    removeItem(k) { delete storageMap[k]; },
    clear() { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
};
global.localStorage = {
    getItem(k) { return storageMap[k] || null; },
    setItem(k, v) { storageMap[k] = String(v); },
    removeItem(k) { delete storageMap[k]; },
    clear() { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
};

// 2. Mock Firebase Auth & Firestore Adapter
const authUsersDB = new Map(); // email -> { uid, email, password }
let currentUser = null;
const authListeners = [];

const mockAuth = {
    get currentUser() { return currentUser; },
    async signInWithEmailAndPassword(email, password) {
        const u = authUsersDB.get(email.toLowerCase());
        if (!u) {
            const err = new Error("There is no user record corresponding to this identifier.");
            err.code = 'auth/user-not-found';
            throw err;
        }
        if (u.password !== password) {
            const err = new Error("The password is invalid or the user does not have a password.");
            err.code = 'auth/wrong-password';
            throw err;
        }
        currentUser = { uid: u.uid, email: u.email, displayName: u.displayName || u.email };
        authListeners.forEach(fn => fn(currentUser));
        return { user: currentUser };
    },
    async createUserWithEmailAndPassword(email, password) {
        if (authUsersDB.has(email.toLowerCase())) {
            const err = new Error("The email address is already in use by another account.");
            err.code = 'auth/email-already-in-use';
            throw err;
        }
        const uid = 'auth_uid_' + Math.random().toString(36).substring(2, 9);
        const newUser = { uid, email: email.toLowerCase(), password };
        authUsersDB.set(email.toLowerCase(), newUser);
        currentUser = { uid: newUser.uid, email: newUser.email };
        authListeners.forEach(fn => fn(currentUser));
        return { user: currentUser };
    },
    async sendPasswordResetEmail(email) {
        if (!authUsersDB.has(email.toLowerCase())) {
            const err = new Error("User not found.");
            err.code = 'auth/user-not-found';
            throw err;
        }
        return true;
    },
    async signOut() {
        currentUser = null;
        authListeners.forEach(fn => fn(null));
        return true;
    },
    onAuthStateChanged(callback) {
        authListeners.push(callback);
        callback(currentUser);
        return () => {
            const idx = authListeners.indexOf(callback);
            if (idx >= 0) authListeners.splice(idx, 1);
        };
    }
};

const firestoreDB = new Map(); // "col/id" -> docData
const mockDb = {
    collection(colName) {
        return {
            doc(docId) {
                return {
                    async get() {
                        const key = `${colName}/${docId}`;
                        const exists = firestoreDB.has(key);
                        return {
                            exists,
                            id: docId,
                            data: () => firestoreDB.get(key)
                        };
                    },
                    async set(data, options) {
                        const key = `${colName}/${docId}`;
                        if (options && options.merge && firestoreDB.has(key)) {
                            firestoreDB.set(key, { ...firestoreDB.get(key), ...data });
                        } else {
                            firestoreDB.set(key, data);
                        }
                        return true;
                    },
                    async delete() {
                        firestoreDB.delete(`${colName}/${docId}`);
                        return true;
                    }
                };
            },
            async get() {
                const docs = [];
                for (const [key, val] of firestoreDB.entries()) {
                    if (key.startsWith(`${colName}/`)) {
                        docs.push({ id: key.split('/')[1], data: () => val });
                    }
                }
                return { empty: docs.length === 0, docs };
            },
            where(field, op, val) {
                return {
                    async get() {
                        const docs = [];
                        for (const [key, docData] of firestoreDB.entries()) {
                            if (key.startsWith(`${colName}/`) && docData[field] === val) {
                                docs.push({ id: key.split('/')[1], data: () => docData });
                            }
                        }
                        return { empty: docs.length === 0, docs };
                    },
                    limit(num) {
                        return this;
                    }
                };
            },
            async add(data) {
                const autoId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                firestoreDB.set(`${colName}/${autoId}`, { ...data, id: autoId });
                return { id: autoId };
            }
        };
    }
};

global.window = {
    auth: mockAuth,
    db: mockDb,
    location: { pathname: '/login.html', href: 'login.html' },
    addEventListener() {},
    dispatchEvent() {},
    isFirebaseConfigPlaceholder: () => false
};

// 3. Load JNTFirebaseService
const fs = require('fs');
global.document = { addEventListener() {}, dispatchEvent() {} };
global.CustomEvent = class CustomEvent { constructor(name, opts) { this.name = name; this.detail = opts ? opts.detail : null; } };
let serviceCode = fs.readFileSync('firebase-service.js', 'utf8');
serviceCode = serviceCode.replace('const JNTFirebaseService =', 'global.JNTFirebaseService =');
eval(serviceCode);

let passCount = 0;
let failCount = 0;

function report(cond, testName, note = '') {
    if (cond) {
        console.log(`  ✅ PASS: ${testName}`);
        passCount++;
    } else {
        console.error(`  ❌ FAIL: ${testName} ${note ? '(' + note + ')' : ''}`);
        failCount++;
    }
}

async function runPhase1AuthTests() {
    console.log("==========================================================================");
    console.log("   FASE 1: FIREBASE AUTHENTICATION & LEGACY ACCOUNT MIGRATION TEST SUITE ");
    console.log("==========================================================================\n");

    // Seed initial users into local store & Firestore
    const legacyAdmin = {
        username: "admin",
        fullname: "Admin System",
        email: "admin@jtexpress.co.id",
        role: "ADMIN",
        status: "Aktif",
        tlc: "Head Office"
    };
    const legacyOperator = {
        username: "hamdan",
        fullname: "Hamdan Hamdani",
        email: "hamdan@jtexpress.co.id",
        role: "Operator SLA",
        status: "Aktif",
        tlc: "TLC Cikande"
    };
    const legacyInactive = {
        username: "budi",
        fullname: "Budi Santoso",
        email: "budi@jtexpress.co.id",
        role: "Operator SLA",
        status: "Nonaktif",
        tlc: "Gateway Surabaya"
    };

    JNTFirebaseService.saveLocalStore('users', [
        { id: 'admin', ...legacyAdmin },
        { id: 'hamdan', ...legacyOperator },
        { id: 'budi', ...legacyInactive }
    ]);
    await mockDb.collection('users').doc('admin').set(legacyAdmin);
    await mockDb.collection('users').doc('hamdan').set(legacyOperator);
    await mockDb.collection('users').doc('budi').set(legacyInactive);

    // -------------------------------------------------------------------------
    // TEST 1: Seed / Provision an Active User in Firebase Auth
    // -------------------------------------------------------------------------
    console.log("▶ [SKENARIO 1] Provisioning & Login Kredensial Valid");
    const adminCreated = await JNTFirebaseService.createUserAccount({
        username: "admin",
        fullname: "Admin System",
        email: "admin@jtexpress.co.id",
        role: "ADMIN",
        tlc: "Head Office"
    }, "Admin123!");

    report(adminCreated.uid && adminCreated.uid.startsWith('auth_uid_'), "User created with unique Firebase UID");
    report(adminCreated.role === 'ADMIN', "User role preserved as ADMIN without heuristics");

    const loginRes = await JNTFirebaseService.loginWithFirebaseAuth("admin", "Admin123!");
    report(loginRes.user.email === "admin@jtexpress.co.id", "Login via username resolved to email and authenticated");
    report(loginRes.profile.uid === adminCreated.uid, "Profile mapped correctly to Firebase UID");

    // -------------------------------------------------------------------------
    // TEST 2: Login dengan Password Salah & Akun Tidak Terdaftar
    // -------------------------------------------------------------------------
    console.log("\n▶ [SKENARIO 2] Negative Test: Password Salah & Akun Tidak Terdaftar");
    let wrongPassCaught = false;
    try {
        await JNTFirebaseService.loginWithFirebaseAuth("admin", "WrongPass123");
    } catch (e) {
        wrongPassCaught = (e.code === 'auth/wrong-password');
    }
    report(wrongPassCaught, "Login dengan password salah ditolak (auth/wrong-password)");

    let unregCaught = false;
    try {
        await JNTFirebaseService.loginWithFirebaseAuth("ghost_user_99", "RandomPass123!");
    } catch (e) {
        unregCaught = (e.code === 'auth/user-not-found');
    }
    report(unregCaught, "Login akun tidak terdaftar ditolak (auth/user-not-found)");

    // -------------------------------------------------------------------------
    // TEST 3: Deteksi Akun Lama & Alur Migrasi Eksplisit
    // -------------------------------------------------------------------------
    console.log("\n▶ [SKENARIO 3] Deteksi Akun Lama & Aktivasi Migrasi ke Firebase Auth");
    let legacyDetected = false;
    try {
        // 'hamdan' exists in legacy store, but not in Firebase Auth
        await JNTFirebaseService.loginWithFirebaseAuth("hamdan", "anypass");
    } catch (e) {
        if (e.code === 'LEGACY_ACCOUNT_NEEDS_ACTIVATION') {
            legacyDetected = true;
        }
    }
    report(legacyDetected, "Akun lama terdeteksi dan diarahkan untuk aktivasi migrasi eksplisit");

    // Run explicit migration for legacy user
    const actRes = await JNTFirebaseService.activateLegacyUser("hamdan", "HamdanPass2026!");
    report(actRes.user.uid && actRes.profile.migratedToFirebaseAuth === true, "Aktivasi akun lama berhasil dan profil dipetakan ke UID");
    report(actRes.profile.role === 'OPERATOR_SLA', "Role lama (Operator SLA) dinormalisasi tanpa eskalasi");

    // Login with newly activated credentials
    const hamdanLogin = await JNTFirebaseService.loginWithFirebaseAuth("hamdan", "HamdanPass2026!");
    report(hamdanLogin.profile.username === 'hamdan', "Akun hasil migrasi dapat login normal dengan password barunya");

    // -------------------------------------------------------------------------
    // TEST 4: Akun Berstatus Nonaktif Ditolak Masuk
    // -------------------------------------------------------------------------
    console.log("\n▶ [SKENARIO 4] Penolakan Akses Akun Berstatus Nonaktif");
    await JNTFirebaseService.activateLegacyUser("budi", "BudiPass2026!");
    let inactiveBlocked = false;
    try {
        await JNTFirebaseService.loginWithFirebaseAuth("budi", "BudiPass2026!");
    } catch (e) {
        if (e.message.includes("Nonaktif")) {
            inactiveBlocked = true;
        }
    }
    report(inactiveBlocked, "Pengguna dengan status Nonaktif ditolak masuk sistem meskipun password benar");

    // -------------------------------------------------------------------------
    // TEST 5: Pemulihan Password via Firebase Auth
    // -------------------------------------------------------------------------
    console.log("\n▶ [SKENARIO 5] Pemulihan Password (Password Reset Email)");
    const resetEmail = await JNTFirebaseService.sendPasswordReset("hamdan");
    report(resetEmail === "hamdan@jtexpress.co.id", "Tautan reset password terkirim ke email terdaftar via Firebase Auth");

    // -------------------------------------------------------------------------
    // TEST 6: Logout Membersihkan State & Sesi
    // -------------------------------------------------------------------------
    console.log("\n▶ [SKENARIO 6] Logout & Pembersihan Identitas");
    global.sessionStorage.setItem('jnt_is_logged_in', 'true');
    global.sessionStorage.setItem('jnt_active_username', 'Hamdan');
    await JNTFirebaseService.logoutFirebaseAuth();
    report(mockAuth.currentUser === null, "Firebase Auth currentUser disetel ke null setelah logout");
    report(global.sessionStorage.getItem('jnt_is_logged_in') === null, "Session storage dibersihkan setelah logout");

    // -------------------------------------------------------------------------
    // TEST 7: Pembuatan Akun Baru dengan Role Terbatas
    // -------------------------------------------------------------------------
    console.log("\n▶ [SKENARIO 7] Pembuatan Akun Terbatas & Pencegahan Eskalasi Role");
    const opMonitoring = await JNTFirebaseService.createUserAccount({
        username: "rizky",
        fullname: "Rizky Ramadhan",
        email: "rizky@jtexpress.co.id",
        role: "Operator Monitoring",
        tlc: "Head Office"
    }, "RizkyPass2026!");

    report(opMonitoring.role === 'OPERATOR_MONITORING', "Role operator monitoring dinormalisasi secara presisi");
    report(opMonitoring.uid && opMonitoring.id === opMonitoring.uid, "Profil tersimpan dengan Document ID = UID");

    // -------------------------------------------------------------------------
    // TEST 8: Log Audit Immutability pada Setiap Aksi Autentikasi
    // -------------------------------------------------------------------------
    console.log("\n▶ [SKENARIO 8] Pencatatan Audit Trail untuk Seluruh Aktivitas Auth");
    const auditLogsSnap = await mockDb.collection('audit_logs').get();
    const hasAuthLogs = auditLogsSnap.docs.some(d => d.data().modul === 'Autentikasi' || d.data().modul === 'User Management');
    report(hasAuthLogs && auditLogsSnap.docs.length >= 3, "Seluruh operasi login, aktivasi, dan create user tercatat di audit_logs");

    console.log("\n==========================================================================");
    console.log(`   TOTAL FASE 1 TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
    console.log("==========================================================================");

    if (failCount === 0) {
        console.log("🎉 SELURUH PENGUJIAN FASE 1 FIREBASE AUTHENTICATION BERHASIL 100%!\n");
        process.exit(0);
    } else {
        console.error("⚠️ TERDAPAT KEGAGALAN PADA PENGUJIAN FASE 1.\n");
        process.exit(1);
    }
}

runPhase1AuthTests();

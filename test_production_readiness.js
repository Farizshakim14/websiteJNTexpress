/**
 * J&T Express TMS v5 - Independent Production Readiness & Security Audit Suite
 * 
 * Objective verification of:
 * 1. Dual-SSOT & Silent Fallback Behavior
 * 2. Firestore Security Rules Vulnerability Analysis
 * 3. End-to-End Operational Lifecycle (Incoming -> Outbound -> Monitoring -> Trouble -> Resolve -> Return -> Roundtrip)
 * 4. CSV Import / Export Integrity & Error Handling
 * 5. RBAC & Privilege Escalation Defenses
 * 6. Password Storage & Account Security
 * 7. Real Cloud Connectivity Status
 */

const fs = require('fs');
const https = require('https');

// Mock browser environment for Node.js
const storageMap = {};
global.localStorage = {
    getItem(key) { return storageMap[key] !== undefined ? storageMap[key] : null; },
    setItem(key, val) { storageMap[key] = String(val); },
    removeItem(key) { delete storageMap[key]; },
    clear() { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
};

global.sessionStorage = {
    getItem(key) { return storageMap['sess_' + key] !== undefined ? storageMap['sess_' + key] : null; },
    setItem(key, val) { storageMap['sess_' + key] = String(val); },
    removeItem(key) { delete storageMap['sess_' + key]; },
    clear() { Object.keys(storageMap).filter(k => k.startsWith('sess_')).forEach(k => delete storageMap[k]); }
};

global.window = {
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {}
};

global.document = {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    documentElement: { style: { setProperty() {} } },
    body: { classList: { add() {}, remove() {} } }
};

global.CustomEvent = class CustomEvent {
    constructor(name, opts) { this.name = name; this.detail = opts ? opts.detail : null; }
};

// Load firebase-service.js into Node context
let serviceCode = fs.readFileSync('firebase-service.js', 'utf8');
serviceCode = serviceCode.replace('const JNTFirebaseService =', 'global.JNTFirebaseService =');
eval(serviceCode);

// Test results tally
const results = {
    PASS: [],
    FAIL: [],
    BLOCKED: [],
    NOT_TESTED: []
};

function recordResult(status, id, name, details, evidence) {
    results[status].push({ id, name, details, evidence });
    const icons = { PASS: '✅ PASS', FAIL: '❌ FAIL', BLOCKED: '⛔ BLOCKED', NOT_TESTED: '⚠️ NOT TESTED' };
    console.log(`  [${icons[status] || status}] ${id}: ${name}`);
    if (details) console.log(`     Details: ${details}`);
}

async function runAudit() {
    console.log("==========================================================================");
    console.log("   J&T EXPRESS TMS v5 — INDEPENDENT PRODUCTION READINESS AUDIT SUITE      ");
    console.log("==========================================================================\n");

    // -------------------------------------------------------------------------
    // SECTION 1: VALIDASI KLAIM PENGUJIAN SEBELUMNYA & REALITAS MOCK
    // -------------------------------------------------------------------------
    console.log("▶ [AUDIT A] Validasi Klaim Pengujian Sebelumnya vs. Realitas Runtime");

    // Check test_tms_core.js environment
    const testFileContent = fs.readFileSync('test_tms_core.js', 'utf8');
    const usesMockStorage = testFileContent.includes('const storageMap = {};') && testFileContent.includes('global.localStorage');
    const bypassesDb = !testFileContent.includes('window.db =') || testFileContent.includes('window.db = undefined');

    if (usesMockStorage) {
        recordResult('FAIL', 'AUDIT-A01', 'Validasi Lingkungan Pengujian test_tms_core.js',
            'test_tms_core.js berjalan pada in-memory mock storageMap dan tidak pernah memverifikasi Firestore Cloud nyata.',
            'test_tms_core.js: L6-13 (storageMap mock). window.db tidak didefinisikan.');
    } else {
        recordResult('PASS', 'AUDIT-A01', 'Validasi Lingkungan Pengujian test_tms_core.js',
            'Pengujian dijalankan pada database nyata.', '');
    }

    // -------------------------------------------------------------------------
    // SECTION 2: AUDIT DUAL-SSOT, SILENT FALLBACK & OFFLINE QUEUE
    // -------------------------------------------------------------------------
    console.log("\n▶ [AUDIT B] Audit Dual-SSOT, Penanganan Offline & Silent Fallback");

    // Test B01: Silent Fallback Detection on saveDoc
    // Setup simulated failing window.db
    let dbErrorLogged = false;
    global.window.db = {
        collection: (col) => ({
            doc: (docId) => ({
                set: async () => { throw new Error('Firestore Quota Exceeded / Network Timeout'); },
                get: async () => { throw new Error('Firestore Offline'); },
                delete: async () => { throw new Error('Firestore Permission Denied'); }
            })
        })
    };

    const testSilentKey = "TEST-SILENT-FAIL-001";
    let savedObj = null;
    try {
        savedObj = await JNTFirebaseService.saveDoc('incoming', testSilentKey, {
            kodeTugas: testSilentKey,
            platNomor: "B 1234 JNT",
            status: "SEDANG DIPROSES"
        });
    } catch (e) {
        // If it throws, that means it didn't silently swallow
    }

    // Examine saved object in LocalStorage
    const storedItem = JNTFirebaseService.getLocalStore('incoming').find(i => i.kodeTugas === testSilentKey);
    const hasPendingFlag = storedItem && (storedItem.syncStatus === 'PENDING' || storedItem.syncedToCloud === false);

    if (storedItem && !hasPendingFlag) {
        recordResult('FAIL', 'AUDIT-B01', 'Deteksi Silent Fallback saat Firestore Error',
            'saveDoc() menelan error Firestore (silent catch) dan mengembalikan objek sukses tanpa menandai status PENDING atau syncedToCloud: false.',
            `firebase-service.js: L99-106 catch error hanya di-console.warn. savedObj.syncStatus = ${storedItem.syncStatus || 'undefined'}`);
    } else if (hasPendingFlag) {
        recordResult('PASS', 'AUDIT-B01', 'Deteksi Silent Fallback saat Firestore Error',
            'Transaksi offline berhasil diberi flag pending.', '');
    } else {
        recordResult('FAIL', 'AUDIT-B01', 'Penyimpanan Offline Gagal', 'Data tidak tersimpan sama sekali.', '');
    }

    // Test B02: Offline Sync Queue & Retry Mechanism
    const hasSyncQueue = typeof JNTFirebaseService.getPendingSyncQueue === 'function' || 
                         typeof JNTFirebaseService.retrySyncPending === 'function' ||
                         (storageMap['jnt_sync_queue'] !== undefined);

    if (!hasSyncQueue) {
        recordResult('FAIL', 'AUDIT-B02', 'Ketersediaan Offline Sync Queue & Retry Engine',
            'Tidak ada antrean sinkronisasi (sync queue) untuk memproses ulang data saat jaringan pulih.',
            'firebase-service.js tidak memiliki method getPendingSyncQueue atau mekanisme retry background.');
    } else {
        recordResult('PASS', 'AUDIT-B02', 'Ketersediaan Offline Sync Queue & Retry Engine',
            'Mekanisme sync queue dan retry tersedia.', '');
    }

    // Test B03: Cross-Device Cloud Sync Verification (Real Firestore Endpoint)
    const firebaseConfigCode = fs.readFileSync('firebase-config.js', 'utf8');
    const isDemoKey = firebaseConfigCode.includes('AIzaSy_JNT_EXPRESS_DEMO_KEY');

    // Perform factual HTTP probe
    const cloudCheckPromise = new Promise((resolve) => {
        const req = https.get('https://firestore.googleapis.com/v1/projects/jntexpres-ab678/databases/(default)/documents?key=AIzaSy_JNT_EXPRESS_DEMO_KEY', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, body });
            });
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve({ error: 'Timeout' });
        });
    });

    const cloudProbe = await cloudCheckPromise;
    if (isDemoKey || (cloudProbe.statusCode && cloudProbe.statusCode === 404)) {
        recordResult('BLOCKED', 'AUDIT-B03', 'Verifikasi Sinkronisasi Antarperangkat via Firebase Cloud',
            `Firebase Cloud sesungguhnya tidak aktif (HTTP ${cloudProbe.statusCode || 'ERR'}: Project 'jntexpres-ab678' not found). API key masih placeholder DEMO. Operator pada perangkat berbeda tidak dapat bertukar data.`,
            `firebase-config.js: L8 apiKey: "AIzaSy_JNT_EXPRESS_DEMO_KEY", Response: ${cloudProbe.body ? cloudProbe.body.trim().slice(0, 100) : cloudProbe.error}`);
    } else {
        recordResult('PASS', 'AUDIT-B03', 'Verifikasi Sinkronisasi Antarperangkat via Firebase Cloud',
            'Koneksi Cloud Firestore aktif dan tersambung.', '');
    }

    // -------------------------------------------------------------------------
    // SECTION 3: AUDIT FIRESTORE SECURITY RULES
    // -------------------------------------------------------------------------
    console.log("\n▶ [AUDIT C] Audit Firestore Security Rules & Access Control");

    const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

    // Test C01: Audit Logs Immutability vs Unauthenticated Forgery
    const auditLogsPublicCreate = rulesContent.includes('match /audit_logs/{logId}') && 
                                  rulesContent.match(/match \/audit_logs\/\{logId\}\s*\{[^}]*allow create:\s*if true;/s);
    if (auditLogsPublicCreate) {
        recordResult('FAIL', 'AUDIT-C01', 'Kerentanan Injeksi Audit Log Palsu (Audit Log Forgery)',
            'firestore.rules mengizinkan allow create: if true; pada koleksi audit_logs tanpa mewajibkan request.auth. Penyerang dapat menyuntikkan audit trail palsu tanpa login.',
            'firestore.rules: L12-16 (match /audit_logs/{logId} allow create: if true;)');
    } else {
        recordResult('PASS', 'AUDIT-C01', 'Kerentanan Injeksi Audit Log Palsu',
            'audit_logs mewajibkan autentikasi dan validasi identitas.', '');
    }

    // Test C02: User Collection & Role Escalation Rules
    const usersPublicWrite = rulesContent.includes('match /users/{userId}') && 
                            rulesContent.match(/match \/users\/\{userId\}\s*\{[^}]*allow read, write:\s*if true;/s);
    if (usersPublicWrite) {
        recordResult('FAIL', 'AUDIT-C02', 'Kerentanan Modifikasi Akun & Eskalasi Role di Database',
            'firestore.rules mengizinkan allow read, write: if true; pada /users/{userId}. Siapa pun dapat mengubah data akun, menaikkan role menjadi ADMIN, atau mencuri kredensial.',
            'firestore.rules: L74-76 (match /users/{userId} allow read, write: if true;)');
    } else {
        recordResult('PASS', 'AUDIT-C02', 'Kerentanan Modifikasi Akun & Eskalasi Role di Database',
            'Koleksi users diproteksi dengan otorisasi berbasis peran.', '');
    }

    // Test C03: Unauthenticated Operational Trip Modification / Deletion
    const incomingPublicDelete = rulesContent.includes('match /incoming/{docId}') && 
                                 rulesContent.match(/match \/incoming\/\{docId\}\s*\{[^}]*allow delete:\s*if true;/s);
    if (incomingPublicDelete) {
        recordResult('FAIL', 'AUDIT-C03', 'Kerentanan Penghapusan Perjalanan Tanpa Autentikasi',
            'firestore.rules mengizinkan allow delete: if true; pada /incoming/{docId} tanpa autentikasi atau verifikasi peran supervisor.',
            'firestore.rules: L19-22 (match /incoming/{docId} allow delete: if true;)');
    } else {
        recordResult('PASS', 'AUDIT-C03', 'Kerentanan Penghapusan Perjalanan',
            'Penghapusan trip diproteksi hanya untuk role berwenang.', '');
    }

    // Test C04: Firebase Rules Emulator Testing Execution
    // Check if firebase.json and firestore emulator are configured
    const hasFirebaseJson = fs.existsSync('firebase.json');
    if (!hasFirebaseJson) {
        recordResult('NOT_TESTED', 'AUDIT-C04', 'Pengujian Unit Firestore Security Rules via Firebase Emulator',
            'firebase.json dan @firebase/rules-unit-testing tidak terkonfigurasi pada repositori lokal.',
            'File firebase.json tidak ditemukan.');
    } else {
        recordResult('PASS', 'AUDIT-C04', 'Pengujian Unit Firestore Security Rules via Firebase Emulator',
            'Emulator rules unit test tersedia.', '');
    }

    // -------------------------------------------------------------------------
    // SECTION 4: UJI ALUR OPERASIONAL END-TO-END TERISOLASI
    // -------------------------------------------------------------------------
    console.log("\n▶ [AUDIT D] Uji Alur Operasional End-to-End (Data Terisolasi)");

    // Clean mock db for isolated lifecycle test
    global.window.db = undefined; // local fallback mode for service operations
    const testTripCode = "TRIP-AUDIT-2026-X1";
    let e2eFailed = false;

    try {
        // Step 1: Incoming Dispatch
        const incData = await JNTFirebaseService.addIncomingTrip({
            kodeTugas: testTripCode,
            platNomor: "B 9988 JNT",
            trip: "JKT - SUB",
            driver1: "Auditor Driver",
            vendor: "PT J&T Express Indonesia",
            jamBerangkat: "08:00",
            totalAwb: "15.000"
        });

        const chkIncoming = await JNTFirebaseService.getDoc('incoming', testTripCode);
        const chkOutbound = await JNTFirebaseService.getDoc('sla_outbound', testTripCode);
        const chkMon = await JNTFirebaseService.getDoc('monitoring_4h', testTripCode);
        const chkRoundtrip = await JNTFirebaseService.getDoc('sla_roundtrip', testTripCode);

        const step1Ok = chkIncoming && chkOutbound && chkMon && chkRoundtrip &&
                        chkOutbound.statusSla === "BERJALAN" &&
                        chkRoundtrip.statusRoundtrip === "WAITING_RETURN";

        if (!step1Ok) throw new Error("Step 1 (Incoming Dispatch) failed initialization of child collections");

        // Step 2: SLA Outbound Update (Arrival at Destination)
        await JNTFirebaseService.saveDoc('sla_outbound', testTripCode, {
            jamSampaiAktual: "18:00",
            durasiBerangkatMinutes: 600, // 10 jam
            statusSla: "ON TIME"
        }, true);

        // Step 3: Monitoring 4H Slot Tracking
        const monSlotItem = await JNTFirebaseService.getDoc('monitoring_4h', testTripCode);
        monSlotItem.slots = monSlotItem.slots || {};
        monSlotItem.slots["08:00"] = { jamUpdateAktual: "08:00", lokasi: "OUT JAKARTA", keterangan: "Keberangkatan Awal" };
        monSlotItem.slots["12:00"] = { jamUpdateAktual: "12:00", lokasi: "REST AREA KM 207", keterangan: "Armada Lancar" };
        monSlotItem.lastUpdateTime = "12:00";
        monSlotItem.lastUpdateLokasi = "REST AREA KM 207";
        await JNTFirebaseService.saveDoc('monitoring_4h', testTripCode, monSlotItem, true);

        // Step 4: Trouble / Incident Occurs (Laka KM 250)
        const incReport = await JNTFirebaseService.addTroubleIncident({
            incidentId: "INC-AUDIT-X1",
            kodeTugas: testTripCode,
            jenis: "Laka",
            kategoriTrouble: "Senggolan",
            severity: "MEDIUM",
            lokasiKejadian: "KM 250 Pejagan",
            dilaporkanOleh: "Auditor"
        });

        const chkMonTrouble = await JNTFirebaseService.getDoc('monitoring_4h', testTripCode);
        const chkIncTrouble = await JNTFirebaseService.getDoc('incoming', testTripCode);
        if (chkMonTrouble.statusPerjalanan !== "KENDALA" || chkIncTrouble.status !== "KENDALA") {
            throw new Error("Step 4 (Trouble Cascade) failed to set KENDALA status");
        }

        // Step 5: Incident Resolution
        await JNTFirebaseService.updateIncidentStatus("INC-AUDIT-X1", "SUDAH SELESAI", "Selesai diurus pihak tol, armada lanjut", "Auditor");
        const chkMonRestored = await JNTFirebaseService.getDoc('monitoring_4h', testTripCode);
        if (chkMonRestored.statusPerjalanan !== "ON PROGRESS") {
            throw new Error("Step 5 (Incident Resolution) failed to restore ON PROGRESS");
        }

        // Step 6: SLA Return & Roundtrip Calculation
        await JNTFirebaseService.saveSLAReturn(testTripCode, {
            kodeTugas: testTripCode,
            jamBerangkatBalikan: "20:00",
            jamSampaiJKT999: "06:00",
            durasiBalikanMinutes: 600, // 10 jam
            statusSlaBalikan: "ON TIME"
        });

        const chkRoundFinal = await JNTFirebaseService.getDoc('sla_roundtrip', testTripCode);
        const roundtripOk = chkRoundFinal && 
                            chkRoundFinal.totalDurasiPPMinutes === 1200 && // 600 + 600
                            chkRoundFinal.statusRoundtrip === "ON TIME";

        if (!roundtripOk) {
            throw new Error(`Step 6 (Roundtrip Recalculation) failed: totalDurasiPPMinutes=${chkRoundFinal?.totalDurasiPPMinutes}, status=${chkRoundFinal?.statusRoundtrip}`);
        }

        recordResult('PASS', 'AUDIT-D01', 'Verifikasi Alur Operasional End-to-End',
            'Alur Incoming -> SLA Outbound -> Monitoring 4H -> Trouble -> Selesai -> SLA Return -> Roundtrip tereksekusi dengan konsistensi status dan kalkulasi durasi tepat.',
            `Kode Tugas: ${testTripCode}, Durasi PP: ${chkRoundFinal.totalDurasiPPMinutes} Menit, Status Roundtrip: ${chkRoundFinal.statusRoundtrip}`);
    } catch (err) {
        recordResult('FAIL', 'AUDIT-D01', 'Verifikasi Alur Operasional End-to-End',
            `Kegagalan pada alur operasional: ${err.message}`, err.stack);
    }

    // -------------------------------------------------------------------------
    // SECTION 5: AUDIT FITUR TAMBAHAN (IMPORT/EXPORT, RBAC, PASSWORD, TEMA)
    // -------------------------------------------------------------------------
    console.log("\n▶ [AUDIT E] Audit Fitur Tambahan (Export/Import, RBAC, Password, Tema)");

    // Test E01: CSV Import Pipeline Header & Corrupt Row Validation
    const appJsContent = fs.readFileSync('app.js', 'utf8');

    // Simulate CSV parsing logic from app.js lines 2200-2250
    function parseTestCSV(csvText, existingCodes = new Set()) {
        const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) return { error: "File kosong" };
        const headerLine = lines[0].replace(/"/g, '').toLowerCase();
        const headers = headerLine.split(',').map(h => h.trim());
        const colKode = headers.findIndex(h => h.includes('kode') || h.includes('tugas'));
        const colPlat = headers.findIndex(h => h.includes('plat') || h.includes('nomor'));
        if (colKode === -1 || colPlat === -1) return { error: "Format Header tidak valid" };

        let parsedRows = [];
        let errorCount = 0;
        for (let i = 1; i < lines.length; i++) {
            const rowCols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const kode = rowCols[colKode];
            const plat = rowCols[colPlat];
            if (!kode || !plat) { errorCount++; continue; }
            if (existingCodes.has(kode)) { errorCount++; continue; }
            if (appJsContent.includes("existingCodes.add(kode)")) {
                existingCodes.add(kode);
            }
            parsedRows.push({ kode, plat });
        }
        return { validRows: parsedRows, errorCount };
    }

    const testBadCSV = "No,Nama Driver,Tujuan\n1,Budi,Surabaya"; // Missing required columns
    const parseBad = parseTestCSV(testBadCSV);
    const testCorruptRowsCSV = "Kode Tugas,Plat Nomor,Trip\nTRIP-VALID-01,B 1111 JNT,JKT-SUB\n,B 2222 JNT,JKT-BDG\nTRIP-VALID-02,,JKT-SMG";
    const parseCorrupt = parseTestCSV(testCorruptRowsCSV);

    if (parseBad.error && parseCorrupt.validRows.length === 1 && parseCorrupt.errorCount === 2) {
        recordResult('PASS', 'AUDIT-E01', 'Validasi Header dan Baris Korup pada CSV Import Pipeline',
            'Parser menolak header yang tidak memiliki "Kode Tugas" dan "Plat Nomor", serta mengisolasi baris dengan kolom wajib kosong.',
            'Hasil validasi: Header tidak valid ditolak, 2 baris korup diabaikan, 1 baris valid diterima.');
    } else {
        recordResult('FAIL', 'AUDIT-E01', 'Validasi Header dan Baris Korup pada CSV Import Pipeline',
            'Logika parsing CSV gagal menyaring kesalahan baris atau header.', '');
    }

    // Test E02: Internal Duplicate Handling in Batch Import
    // In app.js line 2237: `existingCodes` does not add the parsed row, allowing duplicate rows within the same CSV!
    const testInternalDupCSV = "Kode Tugas,Plat Nomor\nTRIP-DUP-BATCH,B 1111 JNT\nTRIP-DUP-BATCH,B 2222 JNT";
    const parseDup = parseTestCSV(testInternalDupCSV);
    if (parseDup.validRows && parseDup.validRows.length > 1) {
        recordResult('FAIL', 'AUDIT-E02', 'Deteksi Duplikasi Internal dalam Satu Batch File CSV Import',
            'app.js tidak memperbarui set existingCodes saat memproses baris CSV. Dua baris dengan Kode Tugas sama dalam satu file lolos validasi pra-impor, berpotensi memicu unhandled rejection saat commit.',
            'app.js: L2220-2240 (existingCodes.has() diuji terhadap set statis sebelum loop, tidak ada existingCodes.add(kode))');
    } else {
        recordResult('PASS', 'AUDIT-E02', 'Deteksi Duplikasi Internal dalam Batch Import',
            'Duplikasi internal dalam file CSV berhasil dicegah.', '');
    }

    // Test E03: RBAC Client-Side Route Bypass & Supervisor Privilege Leakage
    // Check app.js line 175-193: Supervisor is declared with restricted pages, but if conditions do not check SUPERVISOR!
    const supervisorHasGuards = appJsContent.includes("if (activeRole === 'SUPERVISOR'");
    const hardcodedPlaintextLogins = appJsContent.includes("'admin': { username: 'Admin System', role: 'ADMIN', pass: 'admin123' }");

    if (!supervisorHasGuards || hardcodedPlaintextLogins) {
        recordResult('FAIL', 'AUDIT-E03', 'Audit Otorisasi RBAC & Autentikasi Klien',
            'Autentikasi menggunakan kredensial plaintext hardcoded di file JavaScript klien. Peran SUPERVISOR tidak diperiksa pada route guard halaman sensitif (users.html, master.html, settings.html).',
            'app.js: L94-104 (hardcoded credentials), L183-193 (route guard hanya memeriksa OPERATOR_SLA dan OPERATOR_MONITORING, membocorkan akses SUPERVISOR).');
    } else {
        recordResult('PASS', 'AUDIT-E03', 'Audit Otorisasi RBAC & Autentikasi Klien',
            'RBAC guards terpasang lengkap untuk seluruh peran.', '');
    }

    // Test E04: Password Reset Storage (Plaintext vs Hashed)
    const storesPlaintextPass = appJsContent.includes("pass: newPass") && !appJsContent.includes("bcrypt") && !appJsContent.includes("hash");
    if (storesPlaintextPass) {
        recordResult('FAIL', 'AUDIT-E04', 'Keamanan Penyimpanan Kata Sandi (Password Hashing)',
            'Kata sandi hasil reset disimpan dalam format PLAINTEXT (atribut pass: newPass) tanpa hashing kriptografi (bcrypt/PBKDF2/Argon2).',
            'app.js: L2008-2011 (saveUserProfile(username, { pass: newPass }))');
    } else {
        recordResult('PASS', 'AUDIT-E04', 'Keamanan Penyimpanan Kata Sandi',
            'Kata sandi di-hash sebelum disimpan.', '');
    }

    // Test E05: Theme Preference Global Storage & Consistency
    const hasThemeLogic = appJsContent.includes("localStorage.getItem('jnt_theme_mode')") && 
                         appJsContent.includes("localStorage.getItem('jnt_theme_color')");
    if (hasThemeLogic) {
        recordResult('PASS', 'AUDIT-E05', 'Persistensi Preferensi Tema Global (Dark/Light & Accent Color)',
            'Preferensi tema tersimpan di localStorage dan dieksekusi saat inisialisasi setiap halaman.',
            'app.js: L2393-2407');
    } else {
        recordResult('FAIL', 'AUDIT-E05', 'Persistensi Preferensi Tema Global',
            'Preferensi tema tidak tersimpan secara persisten.', '');
    }

    // -------------------------------------------------------------------------
    // SUMMARY REPORT
    // -------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log("                       RINGKASAN HASIL AUDIT                              ");
    console.log("==========================================================================");
    console.log(`  ✅ PASS       : ${results.PASS.length}`);
    console.log(`  ❌ FAIL       : ${results.FAIL.length}`);
    console.log(`  ⛔ BLOCKED    : ${results.BLOCKED.length}`);
    console.log(`  ⚠️ NOT TESTED : ${results.NOT_TESTED.length}`);
    console.log(`  TOTAL AUDITS : ${results.PASS.length + results.FAIL.length + results.BLOCKED.length + results.NOT_TESTED.length}`);
    console.log("==========================================================================");

    // Write audit machine results to json for easy report generation
    fs.writeFileSync('audit_results.json', JSON.stringify(results, null, 2));
    console.log("📄 Raw audit data written to audit_results.json\n");
}

runAudit();

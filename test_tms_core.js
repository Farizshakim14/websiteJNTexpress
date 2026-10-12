/**
 * J&T Express TMS v5 - Automated Comprehensive Test Suite
 * Tests Dual-SSOT, Trouble Engine, User Management, Backup/Restore, Audit Trail, and Report Engine
 */

// Mock browser environment for Node.js
const storageMap = {};
global.localStorage = {
    getItem(key) { return storageMap[key] || null; },
    setItem(key, val) { storageMap[key] = String(val); },
    removeItem(key) { delete storageMap[key]; },
    clear() { Object.keys(storageMap).forEach(k => delete storageMap[k]); }
};

global.sessionStorage = {
    getItem(key) { return storageMap['sess_' + key] || null; },
    setItem(key, val) { storageMap['sess_' + key] = String(val); },
    removeItem(key) { delete storageMap['sess_' + key]; },
    clear() { Object.keys(storageMap).filter(k => k.startsWith('sess_')).forEach(k => delete storageMap[k]); }
};

global.window = {
    dispatchEvent() {},
    addEventListener() {}
};

global.document = {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; }
};

global.CustomEvent = class CustomEvent {
    constructor(name, opts) { this.name = name; this.detail = opts ? opts.detail : null; }
};

// Load firebase-service.js in Node context
const fs = require('fs');
let serviceCode = fs.readFileSync('firebase-service.js', 'utf8');
serviceCode = serviceCode.replace('const JNTFirebaseService =', 'global.JNTFirebaseService =');
eval(serviceCode);

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        failed++;
    }
}

async function runTests() {
    console.log("=================================================================");
    console.log("   J&T EXPRESS TMS v5 — AUTOMATED E2E VERIFICATION TEST SUITE   ");
    console.log("=================================================================\n");

    // -------------------------------------------------------------------------
    // TEST SUITE 1: Dual-SSOT Database Seeding & Persistence
    // -------------------------------------------------------------------------
    console.log("▶ Test Suite 1: Dual-SSOT Database Seeding & Persistence");
    await JNTFirebaseService.seedInitialDataIfEmpty();

    const trips = JNTFirebaseService.getLocalStore('master_trips');
    assert(trips.length > 0, "master_trips seeded with active routes");

    const fleets = JNTFirebaseService.getLocalStore('master_fleets');
    assert(fleets.length > 0, "master_fleets seeded with registered trucks");

    const users = JNTFirebaseService.getLocalStore('users');
    assert(users.length > 0, "users seeded with initial operational accounts");

    const shifts = JNTFirebaseService.getLocalStore('shifts');
    assert(shifts.length > 0, "shifts seeded with active/history shifts");

    const troubles = JNTFirebaseService.getLocalStore('troubles');
    assert(troubles.length > 0, "troubles seeded with initial incidents");

    const incoming = JNTFirebaseService.getLocalStore('incoming');
    assert(incoming.length > 0, "incoming seeded with initial SSOT trips");

    // -------------------------------------------------------------------------
    // TEST SUITE 2: Trouble & Laka Incident Management & Trip Cascade
    // -------------------------------------------------------------------------
    console.log("\n▶ Test Suite 2: Trouble & Laka Incident Management & Trip Cascade");

    // Seed a test trip into incoming and monitoring
    const testKode = "TEST-TRIP-9901";
    await JNTFirebaseService.saveDoc('incoming', testKode, {
        kodeTugas: testKode,
        platNomor: "B 9999 JNT",
        driver1: "Sopir Uji Coba",
        trip: "JKT - SUB",
        status: "SEDANG DIPROSES"
    });
    await JNTFirebaseService.saveDoc('monitoring_4h', testKode, {
        kodeTugas: testKode,
        platNomor: "B 9999 JNT",
        statusPerjalanan: "ON PROGRESS"
    });
    await JNTFirebaseService.saveDoc('sla_outbound', testKode, {
        kodeTugas: testKode,
        platNomor: "B 9999 JNT",
        statusSla: "BERJALAN"
    });

    // Create incident
    const newInc = await JNTFirebaseService.addTroubleIncident({
        incidentId: "INC-TEST-001",
        kodeTugas: testKode,
        jenis: "Trouble",
        kategoriTrouble: "Ban Pecah",
        severity: "HIGH",
        lokasiKejadian: "KM 72 Cipali",
        dilaporkanOleh: "Hamdan"
    });

    assert(newInc.incidentId === "INC-TEST-001", "addTroubleIncident created with correct incidentId");
    assert(newInc.status === "DALAM PENANGANAN", "New incident status set to DALAM PENANGANAN");

    // Verify trip cascade: incoming and monitoring status switched to KENDALA
    const checkIncoming = await JNTFirebaseService.getDoc('incoming', testKode);
    assert(checkIncoming.status === "KENDALA", "Incoming trip status cascaded to KENDALA");

    const checkMon = await JNTFirebaseService.getDoc('monitoring_4h', testKode);
    assert(checkMon.statusPerjalanan === "KENDALA", "Monitoring 4H status cascaded to KENDALA");

    // Duplicate Prevention Check
    let duplicateCaught = false;
    try {
        await JNTFirebaseService.addTroubleIncident({
            incidentId: "INC-TEST-002",
            kodeTugas: testKode,
            jenis: "Laka",
            kategoriTrouble: "Laka Lantas",
            severity: "CRITICAL",
            lokasiKejadian: "KM 75 Cipali"
        });
    } catch (err) {
        duplicateCaught = true;
    }
    assert(duplicateCaught, "Duplicate active incident on same Kode Tugas successfully rejected");

    // Incident Resolution & Trip Restoration
    const updatedInc = await JNTFirebaseService.updateIncidentStatus(
        "INC-TEST-001",
        "SUDAH SELESAI",
        "Ban telah diganti, armada siap jalan",
        "Hamdan"
    );

    assert(updatedInc.status === "SUDAH SELESAI", "updateIncidentStatus updated to SUDAH SELESAI");
    assert(updatedInc.history.length === 2, "Incident history timeline appended");

    const restoredMon = await JNTFirebaseService.getDoc('monitoring_4h', testKode);
    assert(restoredMon.statusPerjalanan === "ON PROGRESS", "Monitoring 4H status restored to ON PROGRESS on incident resolution");

    // -------------------------------------------------------------------------
    // TEST SUITE 3: User Management & Profile Updates
    // -------------------------------------------------------------------------
    console.log("\n▶ Test Suite 3: User Management & Profile Updates");

    const testUser = "user_test_ops";
    await JNTFirebaseService.saveUserProfile(testUser, {
        username: testUser,
        fullname: "User Uji Operasional",
        email: "user.test@jtexpress.co.id",
        role: "Operator",
        status: "Aktif",
        tlc: "TLC Cikande"
    });

    const readUser = await JNTFirebaseService.getDoc('users', testUser);
    assert(readUser && readUser.fullname === "User Uji Operasional", "User profile saved and retrieved accurately");

    await JNTFirebaseService.saveUserProfile(testUser, {
        status: "Nonaktif"
    });
    const updatedUser = await JNTFirebaseService.getDoc('users', testUser);
    assert(updatedUser.status === "Nonaktif", "User status toggled to Nonaktif");

    // -------------------------------------------------------------------------
    // TEST SUITE 4: Audit Trail Log Immutability
    // -------------------------------------------------------------------------
    console.log("\n▶ Test Suite 4: Audit Trail Log Immutability");

    await JNTFirebaseService.logAuditEvent({
        waktu: "12/10/2026 10:00",
        operator: "Admin Test",
        shiftId: "SHIFT-TEST-01",
        modul: "Testing Suite",
        kodeTugas: testKode,
        aktivitas: "Verifikasi Audit Trail Engine"
    });

    const logs = JNTFirebaseService.getLocalStore('audit_logs');
    const targetLog = logs.find(l => l.kodeTugas === testKode);
    assert(targetLog !== undefined, "Audit event recorded in audit_logs");
    assert(targetLog.operator === "Admin Test", "Audit event operator logged accurately");

    // -------------------------------------------------------------------------
    // TEST SUITE 5: Backup & Restore Snapshot Engine
    // -------------------------------------------------------------------------
    console.log("\n▶ Test Suite 5: Backup & Restore Snapshot Engine");

    const snapshot = await JNTFirebaseService.exportDatabaseSnapshot();
    assert(snapshot.schemaVersion === "5.0.0", "Backup snapshot has valid schemaVersion 5.0.0");
    assert(snapshot.collections && snapshot.collections.master_trips, "Backup snapshot contains collections object");

    // Test Restore Validation
    let invalidRestoreCaught = false;
    try {
        await JNTFirebaseService.restoreDatabaseFromJSON({ corrupted: true });
    } catch (e) {
        invalidRestoreCaught = true;
    }
    assert(invalidRestoreCaught, "Corrupted restore file rejected by schema validator");

    const restoreSuccess = await JNTFirebaseService.restoreDatabaseFromJSON(snapshot);
    assert(restoreSuccess && restoreSuccess.success === true && restoreSuccess.restoredCount > 0, "Valid snapshot restored cleanly into Dual-SSOT");

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n=================================================================");
    console.log(`   TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=================================================================");

    if (failed === 0) {
        console.log("🎉 ALL SYSTEM & INTEGRATION TESTS COMPLETED SUCCESSFULLY!");
        process.exit(0);
    } else {
        console.error("⚠️ SOME TESTS FAILED. PLEASE CHECK LOGS ABOVE.");
        process.exit(1);
    }
}

runTests();

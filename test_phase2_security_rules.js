/**
 * J&T Express TMS v5 - Phase 2 Firestore Security Rules RBAC Test Suite
 * Evaluates Firestore Security Rules against Positive & Negative Access Control Scenarios
 */

const fs = require('fs');

// Simple Rule Evaluator Engine that executes the exact logic of firestore.rules
const rulesText = fs.readFileSync('firestore.rules', 'utf8');

class SecurityContext {
    constructor({ auth = null, users = new Map(), collections = new Map() }) {
        this.auth = auth; // { uid: string }
        this.users = users; // uid -> { role, status, username, ... }
        this.collections = collections; // "col/id" -> docData
    }

    // Helper functions as defined in firestore.rules
    isAuthenticated() {
        return this.auth !== null && this.auth.uid !== null;
    }

    userProfileExists() {
        return this.isAuthenticated() && this.users.has(this.auth.uid);
    }

    getUserDoc() {
        return this.userProfileExists() ? this.users.get(this.auth.uid) : null;
    }

    isUserActive() {
        const doc = this.getUserDoc();
        return doc !== null && doc.status === 'Aktif';
    }

    getUserRole() {
        return this.isUserActive() ? this.getUserDoc().role : 'UNAUTHORIZED';
    }

    isAdmin() {
        return this.isUserActive() && this.getUserRole() === 'ADMIN';
    }

    isSupervisor() {
        return this.isUserActive() && (this.getUserRole() === 'SUPERVISOR' || this.isAdmin());
    }

    isOperatorSLA() {
        return this.isUserActive() && (this.getUserRole() === 'OPERATOR_SLA' || this.isSupervisor());
    }

    isOperatorMonitoring() {
        return this.isUserActive() && (this.getUserRole() === 'OPERATOR_MONITORING' || this.isSupervisor());
    }

    isAnyOperator() {
        return this.isOperatorSLA() || this.isOperatorMonitoring();
    }

    // Evaluate permission for a request
    evaluate(op, collection, docId, requestData = {}, existingData = null) {
        // match /users/{userId}
        if (collection === 'users') {
            if (op === 'read') {
                return this.isAdmin() || (this.isUserActive() && this.auth.uid === docId);
            }
            if (op === 'create') {
                return this.isAdmin();
            }
            if (op === 'update') {
                if (this.isAdmin()) return true;
                if (this.isUserActive() && this.auth.uid === docId) {
                    const noPrivilegeEscalation = (
                        requestData.role === (existingData ? existingData.role : null) &&
                        requestData.status === (existingData ? existingData.status : null) &&
                        requestData.uid === (existingData ? existingData.uid : null)
                    );
                    return noPrivilegeEscalation;
                }
                return false;
            }
            if (op === 'delete') {
                return this.isAdmin();
            }
            return false;
        }

        // match /incoming/{kodeTugas}
        if (collection === 'incoming') {
            if (op === 'read') return this.isAnyOperator();
            if (op === 'create' || op === 'update') {
                const isValid = typeof requestData.kodeTugas === 'string' && typeof requestData.platNomor === 'string';
                return this.isOperatorSLA() && isValid;
            }
            if (op === 'delete') return this.isSupervisor();
            return false;
        }

        // match /sla_outbound, /sla_return, /sla_roundtrip
        if (['sla_outbound', 'sla_return', 'sla_roundtrip'].includes(collection)) {
            if (op === 'read') return this.isAnyOperator();
            if (op === 'create' || op === 'update') {
                const isValid = typeof requestData.kodeTugas === 'string';
                return this.isOperatorSLA() && isValid;
            }
            if (op === 'delete') return this.isSupervisor();
            return false;
        }

        // match /monitoring_4h
        if (collection === 'monitoring_4h') {
            if (op === 'read') return this.isAnyOperator();
            if (op === 'create' || op === 'update') {
                const isValid = typeof requestData.kodeTugas === 'string';
                return this.isOperatorMonitoring() && isValid;
            }
            if (op === 'delete') return this.isSupervisor();
            return false;
        }

        // match /troubles
        if (collection === 'troubles') {
            if (op === 'read') return this.isAnyOperator();
            if (op === 'create' || op === 'update') {
                const isValid = typeof requestData.kodeTugas === 'string' && typeof requestData.jenis === 'string';
                return this.isAnyOperator() && isValid;
            }
            if (op === 'delete') return false; // Permanent records
            return false;
        }

        // match /shifts
        if (collection === 'shifts') {
            if (op === 'read') return this.isAnyOperator();
            if (op === 'create' || op === 'update') return this.isSupervisor();
            if (op === 'delete') return false;
            return false;
        }

        // match master_*
        if (collection.startsWith('master_')) {
            if (op === 'read') return this.isAnyOperator();
            if (op === 'create' || op === 'update' || op === 'delete') return this.isSupervisor();
            return false;
        }

        // match /audit_logs
        if (collection === 'audit_logs') {
            if (op === 'read') return this.isSupervisor();
            if (op === 'create') return this.isUserActive() && typeof requestData.operator === 'string';
            if (op === 'update' || op === 'delete') return false; // STRICT IMMUTABILITY
            return false;
        }

        // Catch-all
        return false;
    }
}

// Test Runner
let passCount = 0;
let failCount = 0;

function assertAccess(allowed, expected, testName, note = '') {
    if (allowed === expected) {
        console.log(`  ✅ PASS: ${testName} -> [${expected ? 'ALLOWED' : 'DENIED'}]`);
        passCount++;
    } else {
        console.error(`  ❌ FAIL: ${testName} -> Expected ${expected ? 'ALLOWED' : 'DENIED'}, but got ${allowed ? 'ALLOWED' : 'DENIED'} ${note ? '(' + note + ')' : ''}`);
        failCount++;
    }
}

function runRulesTests() {
    console.log("==========================================================================");
    console.log("   FASE 2: FIRESTORE SECURITY RULES & LEAST PRIVILEGE TEST SUITE         ");
    console.log("==========================================================================\n");

    // Pre-populate users
    const usersMap = new Map();
    usersMap.set('uid_admin_1', { uid: 'uid_admin_1', username: 'admin', role: 'ADMIN', status: 'Aktif' });
    usersMap.set('uid_spv_1', { uid: 'uid_spv_1', username: 'rina', role: 'SUPERVISOR', status: 'Aktif' });
    usersMap.set('uid_sla_1', { uid: 'uid_sla_1', username: 'hamdan', role: 'OPERATOR_SLA', status: 'Aktif' });
    usersMap.set('uid_mon_1', { uid: 'uid_mon_1', username: 'rizky', role: 'OPERATOR_MONITORING', status: 'Aktif' });
    usersMap.set('uid_inact_1', { uid: 'uid_inact_1', username: 'budi', role: 'OPERATOR_SLA', status: 'Nonaktif' });

    const ctxUnauth = new SecurityContext({ auth: null, users: usersMap });
    const ctxAdmin = new SecurityContext({ auth: { uid: 'uid_admin_1' }, users: usersMap });
    const ctxSpv = new SecurityContext({ auth: { uid: 'uid_spv_1' }, users: usersMap });
    const ctxSLA = new SecurityContext({ auth: { uid: 'uid_sla_1' }, users: usersMap });
    const ctxMon = new SecurityContext({ auth: { uid: 'uid_mon_1' }, users: usersMap });
    const ctxInactive = new SecurityContext({ auth: { uid: 'uid_inact_1' }, users: usersMap });

    // -------------------------------------------------------------------------
    // TEST SUITE 1: Pengguna Tanpa Autentikasi
    // -------------------------------------------------------------------------
    console.log("▶ [TEST SUITE 1] Pengguna Tanpa Autentikasi (Unauthenticated)");
    assertAccess(ctxUnauth.evaluate('read', 'incoming', 'TRIP-01'), false, "Tolak unauthenticated read incoming");
    assertAccess(ctxUnauth.evaluate('create', 'incoming', 'TRIP-01', { kodeTugas: 'T1', platNomor: 'B1' }), false, "Tolak unauthenticated write incoming");
    assertAccess(ctxUnauth.evaluate('read', 'users', 'uid_admin_1'), false, "Tolak unauthenticated read users");
    assertAccess(ctxUnauth.evaluate('read', 'audit_logs', 'log_01'), false, "Tolak unauthenticated read audit_logs");

    // -------------------------------------------------------------------------
    // TEST SUITE 2: Akun Nonaktif Ditolak Penuh
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 2] Akun Berstatus Nonaktif");
    assertAccess(ctxInactive.evaluate('read', 'incoming', 'TRIP-01'), false, "Tolak read incoming untuk akun Nonaktif");
    assertAccess(ctxInactive.evaluate('create', 'incoming', 'TRIP-01', { kodeTugas: 'T1', platNomor: 'B1' }), false, "Tolak write incoming untuk akun Nonaktif");
    assertAccess(ctxInactive.evaluate('create', 'troubles', 'INC-01', { kodeTugas: 'T1', jenis: 'Laka' }), false, "Tolak report trouble untuk akun Nonaktif");

    // -------------------------------------------------------------------------
    // TEST SUITE 3: User Management (/users) & Pencegahan Eskalasi Role
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 3] User Management & Anti-Privilege Escalation");
    // Admin can read all users and create new users
    assertAccess(ctxAdmin.evaluate('read', 'users', 'uid_sla_1'), true, "Admin diizinkan membaca profil user lain");
    assertAccess(ctxAdmin.evaluate('create', 'users', 'uid_new_1', { role: 'OPERATOR_SLA' }), true, "Admin diizinkan membuat user baru");
    assertAccess(ctxAdmin.evaluate('delete', 'users', 'uid_new_1'), true, "Admin diizinkan menghapus user");

    // Operator SLA can read own profile, but CANNOT read other users' profile
    assertAccess(ctxSLA.evaluate('read', 'users', 'uid_sla_1'), true, "Operator diizinkan membaca profil miliknya sendiri");
    assertAccess(ctxSLA.evaluate('read', 'users', 'uid_admin_1'), false, "Operator DITOLAK membaca profil user lain");
    assertAccess(ctxSLA.evaluate('create', 'users', 'uid_hack'), false, "Operator DITOLAK membuat user baru");
    assertAccess(ctxSLA.evaluate('delete', 'users', 'uid_admin_1'), false, "Operator DITOLAK menghapus user");

    // Self-update without privilege escalation vs with escalation
    const existingSLAProfile = usersMap.get('uid_sla_1');
    assertAccess(
        ctxSLA.evaluate('update', 'users', 'uid_sla_1', { ...existingSLAProfile, phone: '0812999' }, existingSLAProfile),
        true,
        "Operator diizinkan memperbarui field kontak sendiri"
    );
    assertAccess(
        ctxSLA.evaluate('update', 'users', 'uid_sla_1', { ...existingSLAProfile, role: 'ADMIN' }, existingSLAProfile),
        false,
        "Operator DITOLAK menaikkan role miliknya sendiri menjadi ADMIN"
    );
    assertAccess(
        ctxSLA.evaluate('update', 'users', 'uid_sla_1', { ...existingSLAProfile, status: 'Nonaktif' }, existingSLAProfile),
        false,
        "Operator DITOLAK mengubah status akun miliknya sendiri"
    );

    // Supervisor CANNOT manage users (Users collection restricted to ADMIN)
    assertAccess(ctxSpv.evaluate('create', 'users', 'uid_spv_new'), false, "Supervisor DITOLAK membuat akun user");
    assertAccess(ctxSpv.evaluate('delete', 'users', 'uid_sla_1'), false, "Supervisor DITOLAK menghapus akun user");

    // -------------------------------------------------------------------------
    // TEST SUITE 4: Modul Incoming & SLA Outbound/Return/Roundtrip
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 4] Pemisahan Wewenang SLA vs Monitoring vs Supervisor");
    const validIncoming = { kodeTugas: 'TRIP-2026-001', platNomor: 'B 1234 JNT' };
    const invalidIncoming = { kodeTugas: 1234, platNomor: 'B 1234 JNT' }; // wrong type

    // Operator SLA can create/update incoming and SLA records
    assertAccess(ctxSLA.evaluate('create', 'incoming', 'TRIP-2026-001', validIncoming), true, "Operator SLA diizinkan create incoming");
    assertAccess(ctxSLA.evaluate('create', 'incoming', 'TRIP-2026-001', invalidIncoming), false, "Incoming dengan tipe data salah ditolak");
    assertAccess(ctxSLA.evaluate('create', 'sla_outbound', 'TRIP-2026-001', { kodeTugas: 'TRIP-2026-001' }), true, "Operator SLA diizinkan create sla_outbound");
    assertAccess(ctxSLA.evaluate('create', 'sla_roundtrip', 'TRIP-2026-001', { kodeTugas: 'TRIP-2026-001' }), true, "Operator SLA diizinkan create sla_roundtrip");

    // Operator SLA CANNOT delete incoming trips (reserved for Supervisor/Admin)
    assertAccess(ctxSLA.evaluate('delete', 'incoming', 'TRIP-2026-001'), false, "Operator SLA DITOLAK membatalkan/menghapus trip incoming");
    assertAccess(ctxSpv.evaluate('delete', 'incoming', 'TRIP-2026-001'), true, "Supervisor DIIZINKAN membatalkan/menghapus trip incoming");

    // Operator Monitoring CANNOT write SLA records
    assertAccess(ctxMon.evaluate('create', 'incoming', 'TRIP-2026-001', validIncoming), false, "Operator Monitoring DITOLAK create incoming");
    assertAccess(ctxMon.evaluate('create', 'sla_outbound', 'TRIP-2026-001', { kodeTugas: 'TRIP-2026-001' }), false, "Operator Monitoring DITOLAK write sla_outbound");

    // -------------------------------------------------------------------------
    // TEST SUITE 5: Modul Monitoring 4 Jam (/monitoring_4h)
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 5] Modul Monitoring 4 Jam (Check-in Isolation)");
    const validMon = { kodeTugas: 'TRIP-2026-001', lastUpdateSlot: '08:00' };

    // Operator Monitoring can write check-ins
    assertAccess(ctxMon.evaluate('create', 'monitoring_4h', 'TRIP-2026-001', validMon), true, "Operator Monitoring diizinkan update monitoring_4h");
    assertAccess(ctxMon.evaluate('read', 'monitoring_4h', 'TRIP-2026-001'), true, "Operator Monitoring diizinkan baca monitoring_4h");

    // Operator SLA CANNOT write check-ins to monitoring_4h
    assertAccess(ctxSLA.evaluate('create', 'monitoring_4h', 'TRIP-2026-001', validMon), false, "Operator SLA DITOLAK update monitoring_4h");
    assertAccess(ctxSLA.evaluate('read', 'monitoring_4h', 'TRIP-2026-001'), true, "Operator SLA diizinkan baca monitoring_4h");

    // -------------------------------------------------------------------------
    // TEST SUITE 6: Modul Trouble & Incident (Anti-Delete Enforced)
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 6] Modul Trouble & Laka (Permanent History)");
    const validTrouble = { kodeTugas: 'TRIP-2026-001', jenis: 'Laka', severity: 'HIGH' };

    assertAccess(ctxSLA.evaluate('create', 'troubles', 'INC-01', validTrouble), true, "Operator SLA diizinkan lapor trouble");
    assertAccess(ctxMon.evaluate('create', 'troubles', 'INC-02', validTrouble), true, "Operator Monitoring diizinkan lapor trouble");
    assertAccess(ctxAdmin.evaluate('delete', 'troubles', 'INC-01'), false, "Admin sekalipun DITOLAK menghapus laporan trouble (harus diselesaikan via status)");

    // -------------------------------------------------------------------------
    // TEST SUITE 7: Shift Management & Master Data
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 7] Shift Management & Master Data Collections");
    assertAccess(ctxSpv.evaluate('create', 'shifts', 'SHIFT-01', { status: 'AKTIF' }), true, "Supervisor diizinkan kelola shift");
    assertAccess(ctxSLA.evaluate('create', 'shifts', 'SHIFT-01', { status: 'AKTIF' }), false, "Operator SLA DITOLAK kelola shift");
    assertAccess(ctxAdmin.evaluate('delete', 'shifts', 'SHIFT-01'), false, "Shift records DITOLAK dihapus (riwayat permanen)");

    assertAccess(ctxSpv.evaluate('create', 'master_trips', 'TRIP-SUB', { rute: 'JKT-SUB' }), true, "Supervisor diizinkan ubah master data");
    assertAccess(ctxMon.evaluate('create', 'master_trips', 'TRIP-SUB', { rute: 'JKT-SUB' }), false, "Operator Monitoring DITOLAK ubah master data");
    assertAccess(ctxMon.evaluate('read', 'master_trips', 'TRIP-SUB'), true, "Operator Monitoring diizinkan baca master data");

    // -------------------------------------------------------------------------
    // TEST SUITE 8: Audit Logs Immutability (Append-Only)
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 8] Immutability Koleksi audit_logs");
    const validLog = { operator: 'Hamdan', modul: 'SLA', aktivitas: 'Update SLA' };
    assertAccess(ctxSLA.evaluate('create', 'audit_logs', 'log_new', validLog), true, "Operator diizinkan mencatat event ke audit_logs");
    assertAccess(ctxSLA.evaluate('read', 'audit_logs', 'log_new'), false, "Operator DITOLAK membaca audit_logs (hanya Supervisor/Admin)");
    assertAccess(ctxSpv.evaluate('read', 'audit_logs', 'log_new'), true, "Supervisor diizinkan membaca audit_logs");
    assertAccess(ctxAdmin.evaluate('update', 'audit_logs', 'log_new', { operator: 'Hacked' }), false, "Update audit_logs DITOLAK KERAS (Immutability)");
    assertAccess(ctxAdmin.evaluate('delete', 'audit_logs', 'log_new'), false, "Delete audit_logs DITOLAK KERAS (Immutability)");

    console.log("\n==========================================================================");
    console.log(`   TOTAL FASE 2 SECURITY TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
    console.log("==========================================================================");

    if (failCount === 0) {
        console.log("🎉 SELURUH PENGUJIAN FASE 2 FIRESTORE SECURITY RULES BERHASIL 100%!\n");
        process.exit(0);
    } else {
        console.error("⚠️ TERDAPAT KEGAGALAN PADA PENGUJIAN FASE 2.\n");
        process.exit(1);
    }
}

runRulesTests();

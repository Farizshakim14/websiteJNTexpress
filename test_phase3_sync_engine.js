/**
 * J&T Express TMS - Automated Test Suite
 * FASE 3: OFFLINE SYNC QUEUE, CONFLICT RESOLUTION (ANTI LAST-WRITE-WINS), AND CASCADE DELETION ENGINE
 * Run with: node test_phase3_sync_engine.js
 */

const fs = require('fs');
const path = require('path');

// 1. Mock Browser Environment (Window, LocalStorage, CustomEvent, BroadcastChannel)
const storage = {};
global.localStorage = {
    getItem: (key) => storage[key] !== undefined ? storage[key] : null,
    setItem: (key, val) => { storage[key] = String(val); },
    removeItem: (key) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

const sessionStorageData = {};
global.sessionStorage = {
    getItem: (key) => sessionStorageData[key] !== undefined ? sessionStorageData[key] : null,
    setItem: (key, val) => { sessionStorageData[key] = String(val); },
    removeItem: (key) => { delete sessionStorageData[key]; },
    clear: () => { Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]); }
};

const eventListeners = {};
global.window = {
    addEventListener: (type, listener) => {
        if (!eventListeners[type]) eventListeners[type] = [];
        eventListeners[type].push(listener);
    },
    removeEventListener: (type, listener) => {
        if (eventListeners[type]) {
            eventListeners[type] = eventListeners[type].filter(l => l !== listener);
        }
    },
    dispatchEvent: (event) => {
        if (eventListeners[event.type]) {
            eventListeners[event.type].forEach(l => l(event));
        }
        return true;
    }
};

global.CustomEvent = class CustomEvent {
    constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail || null;
    }
};

global.BroadcastChannel = class BroadcastChannel {
    constructor(name) { this.name = name; }
    postMessage() {}
    close() {}
};

// Mock Firestore In-Memory Cloud Database
class MockFirestoreCollection {
    constructor(name, database) {
        this.name = name;
        this.db = database;
    }

    doc(docId) {
        return {
            get: async () => {
                const store = this.db.collections[this.name] || {};
                const data = store[docId];
                return {
                    exists: !!data,
                    data: () => data ? JSON.parse(JSON.stringify(data)) : null
                };
            },
            set: async (data, options = {}) => {
                if (!this.db.collections[this.name]) this.db.collections[this.name] = {};
                if (options.merge && this.db.collections[this.name][docId]) {
                    this.db.collections[this.name][docId] = {
                        ...this.db.collections[this.name][docId],
                        ...JSON.parse(JSON.stringify(data))
                    };
                } else {
                    this.db.collections[this.name][docId] = JSON.parse(JSON.stringify(data));
                }
                return true;
            },
            update: async (fields) => {
                if (!this.db.collections[this.name] || !this.db.collections[this.name][docId]) {
                    throw new Error(`Document ${this.name}/${docId} not found`);
                }
                this.db.collections[this.name][docId] = {
                    ...this.db.collections[this.name][docId],
                    ...JSON.parse(JSON.stringify(fields))
                };
                return true;
            },
            delete: async () => {
                if (this.db.collections[this.name]) {
                    delete this.db.collections[this.name][docId];
                }
                return true;
            }
        };
    }

    where(field, op, val) {
        return {
            get: async () => {
                const store = this.db.collections[this.name] || {};
                const matches = [];
                for (const [id, item] of Object.entries(store)) {
                    if (op === '==' && item[field] === val) {
                        matches.push({
                            id,
                            data: () => JSON.parse(JSON.stringify(item))
                        });
                    }
                }
                return {
                    docs: matches,
                    forEach: (cb) => matches.forEach(cb)
                };
            }
        };
    }
}

class MockFirestoreDB {
    constructor() {
        this.collections = {};
    }
    collection(name) {
        return new MockFirestoreCollection(name, this);
    }
}

// Load firebase-service.js
let serviceCode = fs.readFileSync(path.join(__dirname, 'firebase-service.js'), 'utf8');
serviceCode = serviceCode.replace('const JNTFirebaseService =', 'global.JNTFirebaseService =');
eval(serviceCode);

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passCount++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failCount++;
    }
}

async function runPhase3Tests() {
    console.log("==========================================================================");
    console.log("   FASE 3: OFFLINE SYNC QUEUE, CONFLICT RESOLUTION, & CASCADE DELETION    ");
    console.log("==========================================================================\n");

    sessionStorage.setItem('jnt_active_username', 'Hamdan Supervisor');
    sessionStorage.setItem('jnt_user_role', 'SUPERVISOR');

    // -------------------------------------------------------------------------
    // TEST SUITE 1: Offline Queueing & Persistence
    // -------------------------------------------------------------------------
    console.log("▶ [TEST SUITE 1] Offline Queueing & Event Broadcasting");
    window.db = null; // Simulate offline mode
    localStorage.clear();

    let queueUpdatedFired = false;
    let queueEventDetail = null;
    const queueListener = (e) => {
        queueUpdatedFired = true;
        queueEventDetail = e.detail;
    };
    window.addEventListener('jnt_sync_queue_updated', queueListener);

    const testTrip = {
        kodeTugas: 'TRIP-OFFLINE-001',
        trip: 'JKT - SUB',
        platNomor: 'B 1234 JNT',
        driver1: 'Driver Offline'
    };

    const savedOffline = await JNTFirebaseService.saveDoc('incoming', 'TRIP-OFFLINE-001', testTrip);
    assert(savedOffline.syncStatus === 'PENDING', "saveDoc offline menghasilkan syncStatus: PENDING");
    assert(savedOffline.syncedToCloud === false, "saveDoc offline menghasilkan syncedToCloud: false");

    const pendingQueue = JNTFirebaseService.getPendingSyncQueue();
    assert(pendingQueue.length === 1, "Item berhasil masuk ke antrean offline (jnt_sync_queue length == 1)");
    assert(pendingQueue[0].colName === 'incoming' && pendingQueue[0].docId === 'TRIP-OFFLINE-001', "Antrean mencatat colName dan docId yang tepat");
    assert(pendingQueue[0].action === 'set', "Antrean mencatat action: set");
    assert(queueUpdatedFired === true, "Event jnt_sync_queue_updated berhasil dipancarkan ke window");
    assert(queueEventDetail && queueEventDetail.count === 1, "Event detail memuat jumlah antrean terkini");

    window.removeEventListener('jnt_sync_queue_updated', queueListener);

    // -------------------------------------------------------------------------
    // TEST SUITE 2: Retain Local Cache on deleteDoc (Offline)
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 2] Retensi Cache Lokal pada deleteDoc (Offline Retention)");
    // Document exists in local store
    const localStoreBeforeDelete = JNTFirebaseService.getLocalStore('incoming');
    assert(localStoreBeforeDelete.some(i => i.kodeTugas === 'TRIP-OFFLINE-001'), "Dokumen ada di localStore sebelum delete");

    const deleteRes = await JNTFirebaseService.deleteDoc('incoming', 'TRIP-OFFLINE-001');
    assert(deleteRes.confirmed === false, "deleteDoc saat offline mengembalikan confirmed: false");
    assert(deleteRes.pending === true, "deleteDoc saat offline mengembalikan pending: true");

    // CRITICAL: Local cache must NOT be prematurely purged while offline!
    const localStoreAfterOfflineDelete = JNTFirebaseService.getLocalStore('incoming');
    const retainedDoc = localStoreAfterOfflineDelete.find(i => i.kodeTugas === 'TRIP-OFFLINE-001');
    assert(retainedDoc !== undefined, "Dokumen TETAP DIPERTAHANKAN di localStore saat offline delete");
    assert(retainedDoc._pendingDelete === true, "Dokumen ditandai dengan _pendingDelete: true");
    assert(retainedDoc.syncStatus === 'PENDING_DELETE', "Dokumen memiliki syncStatus: PENDING_DELETE");

    const deleteQueue = JNTFirebaseService.getPendingSyncQueue();
    const deleteQueueItem = deleteQueue.find(q => q.colName === 'incoming' && q.docId === 'TRIP-OFFLINE-001');
    assert(deleteQueueItem && deleteQueueItem.action === 'delete', "Antrean mencatat operasi delete untuk eksekusi saat online");

    // -------------------------------------------------------------------------
    // TEST SUITE 3: Online Reconnect & Flush Confirmation on deleteDoc
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 3] Eksekusi & Konfirmasi Penghapusan saat Online Reconnect");
    const mockDb = new MockFirestoreDB();
    // Pre-populate cloud with this document
    mockDb.collections['incoming'] = {
        'TRIP-OFFLINE-001': { kodeTugas: 'TRIP-OFFLINE-001', platNomor: 'B 1234 JNT' }
    };
    window.db = mockDb; // System goes online

    const flushDeleteRes = await JNTFirebaseService.flushPendingSyncQueue();
    assert(flushDeleteRes.success === true, "flushPendingSyncQueue berhasil dieksekusi");
    assert(mockDb.collections['incoming']['TRIP-OFFLINE-001'] === undefined, "Dokumen terhapus dari cloud Firestore");

    // Once confirmed by cloud, now local store should be purged
    const localStoreAfterConfirmedDelete = JNTFirebaseService.getLocalStore('incoming');
    assert(!localStoreAfterConfirmedDelete.some(i => i.kodeTugas === 'TRIP-OFFLINE-001'), "Dokumen dihapus dari LocalStorage setelah konfirmasi cloud");
    assert(JNTFirebaseService.getPendingSyncQueue().length === 0, "Antrean sinkronisasi kosong setelah flush selesai");

    // -------------------------------------------------------------------------
    // TEST SUITE 4: Optimistic Concurrency & Anti-Last-Write-Wins (Conflict Detection)
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 4] Deteksi Konflik & Anti-Last-Write-Wins (Optimistic Concurrency)");
    // Cloud document has updatedAt: 10:00:00
    const serverTimestamp = '2026-10-12T10:00:00.000Z';
    mockDb.collections['incoming']['TRIP-CONFLICT-001'] = {
        kodeTugas: 'TRIP-CONFLICT-001',
        status: 'SUDAH SELESAI',
        driver1: 'Driver Cloud Modern',
        updatedAt: serverTimestamp
    };

    // Client had baseUpdatedAt of 09:30:00 (older than server)
    const clientBaseTimestamp = '2026-10-12T09:30:00.000Z';
    // Offline local edit
    window.db = null; // Go offline
    const conflictingLocalDoc = {
        kodeTugas: 'TRIP-CONFLICT-001',
        status: 'SEDANG DIPROSES', // Conflicting status!
        driver1: 'Driver Offline Lama', // Conflicting driver!
        _baseUpdatedAt: clientBaseTimestamp
    };

    let conflictEventFired = false;
    let conflictDetail = null;
    const conflictListener = (e) => {
        conflictEventFired = true;
        conflictDetail = e.detail;
    };
    window.addEventListener('jnt_sync_conflict', conflictListener);

    await JNTFirebaseService.saveDoc('incoming', 'TRIP-CONFLICT-001', conflictingLocalDoc);

    // Reconnect to cloud
    window.db = mockDb;
    const flushConflictRes = await JNTFirebaseService.flushPendingSyncQueue();

    assert(flushConflictRes.conflicts === 1, "flushPendingSyncQueue mendeteksi 1 konflik konkuren");
    assert(conflictEventFired === true, "Event jnt_sync_conflict berhasil dipancarkan");
    assert(conflictDetail && conflictDetail.conflicts.length >= 2, "Detail konflik mencatat perbedaan field (status & driver1)");

    // Anti-Last-Write-Wins Verification: Server document MUST NOT be overwritten blindly!
    const serverDocStillSafe = mockDb.collections['incoming']['TRIP-CONFLICT-001'];
    assert(serverDocStillSafe.status === 'SUDAH SELESAI', "Server data status TIDAK tertimpa oleh draf offline (Anti-LWW)");
    assert(serverDocStillSafe.driver1 === 'Driver Cloud Modern', "Server data driver1 TIDAK tertimpa oleh draf offline (Anti-LWW)");

    // Conflict recorded in localStorage
    const recordedConflicts = JNTFirebaseService.getSyncConflicts();
    assert(recordedConflicts.length === 1, "Konflik tercatat di localStorage (jnt_conflicts)");
    assert(recordedConflicts[0].docId === 'TRIP-CONFLICT-001', "Catatan konflik memuat docId yang tepat");

    // Local store marked with CONFLICT status
    const localConflictItem = JNTFirebaseService.getLocalStore('incoming').find(i => i.kodeTugas === 'TRIP-CONFLICT-001');
    assert(localConflictItem && localConflictItem.syncStatus === 'CONFLICT', "Dokumen lokal berstatus CONFLICT");

    window.removeEventListener('jnt_sync_conflict', conflictListener);

    // -------------------------------------------------------------------------
    // TEST SUITE 5: Conflict Resolution Strategies
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 5] Strategi Resolusi Konflik (KEEP_CLOUD, OVERWRITE_CLOUD, MERGE)");
    
    // 5A: Strategy KEEP_CLOUD
    await JNTFirebaseService.resolveSyncConflict('incoming', 'TRIP-CONFLICT-001', 'KEEP_CLOUD');
    const localAfterKeepCloud = JNTFirebaseService.getLocalStore('incoming').find(i => i.kodeTugas === 'TRIP-CONFLICT-001');
    assert(localAfterKeepCloud.driver1 === 'Driver Cloud Modern', "KEEP_CLOUD mengadopsi data server ke lokal");
    assert(localAfterKeepCloud.syncStatus === 'SYNCED', "KEEP_CLOUD mengubah status menjadi SYNCED");
    assert(JNTFirebaseService.getSyncConflicts().length === 0, "KEEP_CLOUD membersihkan catatan konflik");

    // 5B: Setup new conflict for OVERWRITE_CLOUD
    mockDb.collections['incoming']['TRIP-CONFLICT-002'] = {
        kodeTugas: 'TRIP-CONFLICT-002',
        trip: 'JKT - BDG',
        driver1: 'Driver Cloud X',
        updatedAt: '2026-10-12T11:00:00.000Z'
    };
    window.db = null;
    await JNTFirebaseService.saveDoc('incoming', 'TRIP-CONFLICT-002', {
        kodeTugas: 'TRIP-CONFLICT-002',
        trip: 'JKT - BDO (KOREKSI LOKAL)',
        _baseUpdatedAt: '2026-10-12T10:00:00.000Z'
    });
    window.db = mockDb;
    await JNTFirebaseService.flushPendingSyncQueue(); // Triggers conflict
    assert(JNTFirebaseService.getSyncConflicts().length === 1, "Konflik kedua terdeteksi");

    // Execute OVERWRITE_CLOUD
    await JNTFirebaseService.resolveSyncConflict('incoming', 'TRIP-CONFLICT-002', 'OVERWRITE_CLOUD');
    assert(mockDb.collections['incoming']['TRIP-CONFLICT-002'].trip === 'JKT - BDO (KOREKSI LOKAL)', "OVERWRITE_CLOUD berhasil memperbarui server secara eksplisit");
    assert(JNTFirebaseService.getSyncConflicts().length === 0, "Konflik kedua dibersihkan");

    // 5C: Setup and test MERGE
    mockDb.collections['incoming']['TRIP-CONFLICT-003'] = {
        kodeTugas: 'TRIP-CONFLICT-003',
        trip: 'JKT - SOC',
        platNomor: 'B 5555 JNT',
        driver1: 'Driver Cloud Lama',
        updatedAt: '2026-10-12T12:00:00.000Z'
    };
    window.db = null;
    await JNTFirebaseService.saveDoc('incoming', 'TRIP-CONFLICT-003', {
        kodeTugas: 'TRIP-CONFLICT-003',
        driver1: 'Driver Offline Baru',
        _baseUpdatedAt: '2026-10-12T11:00:00.000Z'
    });
    window.db = mockDb;
    await JNTFirebaseService.flushPendingSyncQueue(); // Triggers conflict

    // Execute MERGE
    const mergedData = {
        kodeTugas: 'TRIP-CONFLICT-003',
        trip: 'JKT - SOC',
        platNomor: 'B 5555 JNT',
        driver1: 'Driver Offline Baru (Merged)'
    };
    await JNTFirebaseService.resolveSyncConflict('incoming', 'TRIP-CONFLICT-003', 'MERGE', mergedData);
    assert(mockDb.collections['incoming']['TRIP-CONFLICT-003'].driver1 === 'Driver Offline Baru (Merged)', "MERGE berhasil menerapkan data gabungan ke cloud");
    assert(JNTFirebaseService.getSyncConflicts().length === 0, "Catatan konflik MERGE dibersihkan");

    // -------------------------------------------------------------------------
    // TEST SUITE 6: Hardened Cascade Deletion Engine (deleteTripCascade)
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 6] Hardened Cascade Deletion Engine (deleteTripCascade)");
    const targetCascadeTrip = 'TRIP-CASCADE-999';

    // Populate all 5 operational collections + 1 trouble incident
    mockDb.collections['incoming'] = { [targetCascadeTrip]: { kodeTugas: targetCascadeTrip } };
    mockDb.collections['sla_outbound'] = { [targetCascadeTrip]: { kodeTugas: targetCascadeTrip } };
    mockDb.collections['monitoring_4h'] = { [targetCascadeTrip]: { kodeTugas: targetCascadeTrip } };
    mockDb.collections['sla_return'] = { [targetCascadeTrip]: { kodeTugas: targetCascadeTrip } };
    mockDb.collections['sla_roundtrip'] = { [targetCascadeTrip]: { kodeTugas: targetCascadeTrip } };
    mockDb.collections['troubles'] = {
        'INC-CASCADE-01': {
            incidentId: 'INC-CASCADE-01',
            kodeTugas: targetCascadeTrip,
            status: 'DALAM PENANGANAN',
            jenis: 'Trouble'
        }
    };

    // Mirror to local stores
    JNTFirebaseService.saveLocalStore('incoming', [{ kodeTugas: targetCascadeTrip }]);
    JNTFirebaseService.saveLocalStore('sla_outbound', [{ kodeTugas: targetCascadeTrip }]);
    JNTFirebaseService.saveLocalStore('monitoring_4h', [{ kodeTugas: targetCascadeTrip }]);
    JNTFirebaseService.saveLocalStore('sla_return', [{ kodeTugas: targetCascadeTrip }]);
    JNTFirebaseService.saveLocalStore('sla_roundtrip', [{ kodeTugas: targetCascadeTrip }]);
    JNTFirebaseService.saveLocalStore('troubles', [{ incidentId: 'INC-CASCADE-01', kodeTugas: targetCascadeTrip, status: 'DALAM PENANGANAN' }]);

    // Execute Cascade Deletion
    await JNTFirebaseService.deleteTripCascade(targetCascadeTrip);

    // Verify 5 collections deleted in cloud
    assert(mockDb.collections['incoming'][targetCascadeTrip] === undefined, "Cascade: incoming terhapus");
    assert(mockDb.collections['sla_outbound'][targetCascadeTrip] === undefined, "Cascade: sla_outbound terhapus");
    assert(mockDb.collections['monitoring_4h'][targetCascadeTrip] === undefined, "Cascade: monitoring_4h terhapus");
    assert(mockDb.collections['sla_return'][targetCascadeTrip] === undefined, "Cascade: sla_return terhapus");
    assert(mockDb.collections['sla_roundtrip'][targetCascadeTrip] === undefined, "Cascade: sla_roundtrip terhapus");

    // Verify troubles collection: NOT deleted (Rules compliant), but updated to SUDAH SELESAI
    const troubleInCloud = mockDb.collections['troubles']['INC-CASCADE-01'];
    assert(troubleInCloud !== undefined, "Cascade: Koleksi troubles TIDAK dihapus (Sesuai aturan keamanan firestore.rules)");
    assert(troubleInCloud.status === 'SUDAH SELESAI', "Cascade: Status trouble diperbarui menjadi SUDAH SELESAI");

    // Verify audit logs recorded cascade deletion
    const auditLogs = JNTFirebaseService.getLocalStore('audit_logs');
    const cascadeLog = auditLogs.find(l => l.modul === 'Cascade Delete' && l.kodeTugas === targetCascadeTrip);
    assert(cascadeLog !== undefined, "Audit trail mencatat modul: Cascade Delete");

    // -------------------------------------------------------------------------
    // TEST SUITE 7: Network Reconnection Auto-Flush (Online Event)
    // -------------------------------------------------------------------------
    console.log("\n▶ [TEST SUITE 7] Network Reconnection Auto-Flush (Online Event)");
    window.db = null; // Go offline
    await JNTFirebaseService.saveDoc('incoming', 'TRIP-RECONNECT-001', {
        kodeTugas: 'TRIP-RECONNECT-001',
        trip: 'JKT - DPS'
    });
    assert(JNTFirebaseService.getPendingSyncQueue().length === 1, "Item tersimpan di antrean saat offline");

    // Restore database connection & trigger 'online' event on window
    window.db = mockDb;
    window.dispatchEvent(new CustomEvent('online'));

    // Wait a brief moment for async flush triggered by event listener
    await new Promise(r => setTimeout(r, 100));

    assert(JNTFirebaseService.getPendingSyncQueue().length === 0, "Antrean otomatis di-flush saat event 'online' terpicu");
    assert(mockDb.collections['incoming']['TRIP-RECONNECT-001'] !== undefined, "Data berhasil tersinkron ke cloud setelah auto-flush");

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n==========================================================================");
    console.log(`   TOTAL FASE 3 TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
    console.log("==========================================================================");

    if (failCount === 0) {
        console.log("🎉 SELURUH PENGUJIAN FASE 3 SYNC ENGINE & CASCADE DELETION BERHASIL 100%!\n");
        process.exit(0);
    } else {
        console.error("❌ ADA PENGUJIAN FASE 3 YANG GAGAL!\n");
        process.exit(1);
    }
}

runPhase3Tests().catch(err => {
    console.error("Unhandled Error during Phase 3 testing:", err);
    process.exit(1);
});

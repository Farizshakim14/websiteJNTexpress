/**
 * J&T Express - Transportation Monitoring System
 * Firebase Firestore Service Layer (v4 — SSOT, 3-Tier Architecture, 4H Audit Logs, Shift Management & Reporting Engine)
 */

// Cross-Tab Broadcast Channel for Real-Time Multi-Tab Synchronization (Firebase-Only Mode)
const JNT_SYNC_BUS_NAME = 'jnt_global_event_bus_v1';
let jntSyncChannel = null;
try {
    if (typeof BroadcastChannel !== 'undefined') {
        jntSyncChannel = new BroadcastChannel(JNT_SYNC_BUS_NAME);
        jntSyncChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'JNT_DATA_MUTATION') {
                console.log('[GLOBAL SYNC BUS] Received Cross-Tab Event:', event.data.detail);
                window.dispatchEvent(new CustomEvent('jnt_data_updated', { detail: event.data.detail }));
            }
        };
    }
} catch (e) {
    console.warn('[GLOBAL SYNC BUS] BroadcastChannel unsupported:', e.message);
}

// ⚡ FIREBASE-ONLY MODE: Semua data langsung ke Firestore, tidak ada penyimpanan di device.
// Jika tidak ada koneksi internet, operasi akan ditolak.

// Network status monitor - menampilkan notifikasi jika koneksi terputus
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log('[NETWORK] Koneksi internet pulih. Firestore tersedia.');
        window.dispatchEvent(new CustomEvent('jnt_network_online'));
    });
    window.addEventListener('offline', () => {
        console.warn('[NETWORK] Koneksi internet terputus. Input data ditolak.');
        window.dispatchEvent(new CustomEvent('jnt_network_offline'));
    });
}

const JNTFirebaseService = {

    // Broadcast data mutation across local listeners and open browser tabs
    notifyDataMutated(detail) {
        window.dispatchEvent(new CustomEvent('jnt_data_updated', { detail }));
        if (jntSyncChannel) {
            try {
                jntSyncChannel.postMessage({ type: 'JNT_DATA_MUTATION', detail, timestamp: Date.now() });
            } catch (e) { }
        }
        // FIREBASE-ONLY: Tidak menulis ke localStorage untuk data pulse.
    },

    // ⚡ FIREBASE-ONLY: getLocalStore & saveLocalStore dinonaktifkan.
    // Data TIDAK disimpan di device. Semua baca/tulis langsung ke Firestore.
    getLocalStore(colName) {
        // FIREBASE-ONLY: Tidak membaca dari localStorage.
        return [];
    },

    saveLocalStore(colName, list) {
        // FIREBASE-ONLY: Tidak menyimpan ke localStorage.
        // Data hanya ada di Firestore cloud.
    },

    async getDoc(colName, docId) {
        console.log(`[SLA UPDATE] READ START for ${colName}/${docId}`);
        let data = null;
        if (window.db) {
            try {
                const docSnap = await window.db.collection(colName).doc(docId).get();
                if (docSnap.exists) {
                    console.log(`[SLA UPDATE] READ FIRESTORE SUCCESS for ${colName}/${docId}`);
                    data = docSnap.data();
                }
            } catch (err) {
                console.warn(`[SLA UPDATE] FIRESTORE ERROR [${colName}/${docId}]: ${err.message}`);
                console.log(`[SLA UPDATE] LOCAL STORAGE FALLBACK used for ${colName}/${docId}`);
            }
        }
        if (!data) {
            const localList = this.getLocalStore(colName);
            const found = localList.find(i => (i.id === docId || i.kodeTugas === docId || i._docId === docId));
            if (found) data = found;
        }
        return data;
    },

    // ----------------------------------------------------
    // OFFLINE SYNC QUEUE - DINONAKTIFKAN (FIREBASE-ONLY MODE)
    // Data tidak pernah antri di device. Jika offline, operasi ditolak.
    // ----------------------------------------------------
    getPendingSyncQueue() { return []; },
    savePendingSyncQueue(queue) { /* FIREBASE-ONLY: no-op */ },
    getPendingSyncCount() { return 0; },
    getSyncConflicts() { return []; },
    saveSyncConflicts(conflicts) { /* FIREBASE-ONLY: no-op */ },

    recordSyncConflict(conflictRecord) { /* FIREBASE-ONLY: no-op */ },
    clearSyncConflict(colName, docId) { /* FIREBASE-ONLY: no-op */ },
    clearAllSyncConflicts() { /* FIREBASE-ONLY: no-op */ },
    enqueuePendingSync(item) { /* FIREBASE-ONLY: no-op */ },
    removePendingSyncItem(colName, docId) { /* FIREBASE-ONLY: no-op */ },

    async retrySyncPending() {
        return { success: true, processed: 0, conflicts: 0, remaining: 0 };
    },

    async flushPendingSyncQueue() {
        const queue = this.getPendingSyncQueue();
        if (!queue.length) return { success: true, processed: 0, conflicts: 0, remaining: 0 };
        if (!window.db) return { success: false, processed: 0, conflicts: 0, remaining: queue.length, error: 'Database offline' };

        let processed = 0;
        let conflictsCount = 0;
        const remainingQueue = [];

        for (const item of queue) {
            try {
                if (item.action === 'delete') {
                    // Cloud Delete Execution
                    await window.db.collection(item.colName).doc(item.docId).delete();
                    console.log(`[SYNC RETRY SUCCESS] Cloud delete confirmed for ${item.colName}/${item.docId}`);

                    // Cloud confirmed: remove from LocalStorage
                    const current = this.getLocalStore(item.colName);
                    const filtered = current.filter(i => (i.id !== item.docId && i.kodeTugas !== item.docId && i._docId !== item.docId));
                    this.saveLocalStore(item.colName, filtered);
                    this.notifyDataMutated({ colName: item.colName, docId: item.docId, action: 'delete', confirmed: true });
                    processed++;
                } else {
                    // Action 'set': Optimistic Concurrency & Anti Last-Write-Wins
                    let cloudDocSnap = null;
                    try {
                        cloudDocSnap = await window.db.collection(item.colName).doc(item.docId).get();
                    } catch (readErr) {
                        console.warn(`[SYNC RETRY] Pre-check read error for ${item.colName}/${item.docId}:`, readErr.message);
                    }

                    if (cloudDocSnap && cloudDocSnap.exists) {
                        const cloudData = cloudDocSnap.data();
                        const cloudUpdatedAt = cloudData.updatedAt ? new Date(cloudData.updatedAt).getTime() : 0;
                        const baseUpdatedAt = item.baseUpdatedAt ? new Date(item.baseUpdatedAt).getTime() : 0;

                        // If server document was modified AFTER the local base timestamp:
                        if (cloudUpdatedAt > 0 && baseUpdatedAt > 0 && cloudUpdatedAt > baseUpdatedAt) {
                            const conflictingFields = [];
                            for (const [key, val] of Object.entries(item.data || {})) {
                                if (['updatedAt', 'syncStatus', 'syncedToCloud', '_syncStatus', 'syncError', '_baseUpdatedAt', '_pendingDelete', '_conflictDetails', '_cloudVersion'].includes(key)) continue;
                                if (cloudData[key] !== undefined && JSON.stringify(cloudData[key]) !== JSON.stringify(val)) {
                                    conflictingFields.push({ field: key, cloudVal: cloudData[key], localVal: val });
                                }
                            }

                            if (conflictingFields.length > 0) {
                                conflictsCount++;
                                console.warn(`[SYNC CONFLICT DETECTED] ${item.colName}/${item.docId}: Server updatedAt (${cloudData.updatedAt}) > baseUpdatedAt (${item.baseUpdatedAt})`);

                                // Record conflict into jnt_conflicts
                                this.recordSyncConflict({
                                    colName: item.colName,
                                    docId: item.docId,
                                    cloudData: cloudData,
                                    localData: item.data,
                                    conflicts: conflictingFields,
                                    baseUpdatedAt: item.baseUpdatedAt,
                                    detectedAt: new Date().toISOString()
                                });

                                // Update local store item to CONFLICT status
                                const current = this.getLocalStore(item.colName);
                                const idx = current.findIndex(i => (i.id === item.docId || i.kodeTugas === item.docId || i._docId === item.docId));
                                if (idx >= 0) {
                                    current[idx].syncStatus = 'CONFLICT';
                                    current[idx]._syncStatus = 'CONFLICT';
                                    current[idx].syncError = `Konflik data: Versi di server (${cloudData.updatedAt}) lebih baru`;
                                    current[idx]._conflictDetails = conflictingFields;
                                    current[idx]._cloudVersion = cloudData;
                                    this.saveLocalStore(item.colName, current);
                                }

                                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                                    window.dispatchEvent(new CustomEvent('jnt_sync_conflict', {
                                        detail: {
                                            colName: item.colName,
                                            docId: item.docId,
                                            cloudData,
                                            localData: item.data,
                                            conflicts: conflictingFields
                                        }
                                    }));
                                }

                                // Retain item in queue marked as CONFLICT; do NOT overwrite cloud
                                remainingQueue.push({ ...item, status: 'CONFLICT', error: 'Conflicted with cloud version' });
                                continue;
                            }
                        }
                    }

                    // Safe to write to cloud Firestore
                    const cleanData = { ...item.data };
                    delete cleanData.syncStatus;
                    delete cleanData.syncedToCloud;
                    delete cleanData._syncStatus;
                    delete cleanData.syncError;
                    delete cleanData._baseUpdatedAt;
                    delete cleanData._pendingDelete;
                    delete cleanData._conflictDetails;
                    delete cleanData._cloudVersion;
                    cleanData.updatedAt = new Date().toISOString();

                    await window.db.collection(item.colName).doc(item.docId).set(cleanData, { merge: item.merge !== false });

                    // Update item in local store to SYNCED
                    const current = this.getLocalStore(item.colName);
                    const idx = current.findIndex(i => (i.id === item.docId || i.kodeTugas === item.docId || i._docId === item.docId));
                    if (idx >= 0) {
                        current[idx] = { ...current[idx], ...cleanData, syncStatus: 'SYNCED', syncedToCloud: true, _syncStatus: 'SYNCED' };
                        delete current[idx].syncError;
                        delete current[idx]._conflictDetails;
                        delete current[idx]._cloudVersion;
                        delete current[idx]._pendingDelete;
                        this.saveLocalStore(item.colName, current);
                    }
                    processed++;
                }
            } catch (err) {
                console.warn(`[SYNC RETRY FAILED] ${item.colName}/${item.docId}: ${err.message}`);
                if (item.action === 'delete') {
                    const current = this.getLocalStore(item.colName);
                    const idx = current.findIndex(i => (i.id === item.docId || i.kodeTugas === item.docId || i._docId === item.docId));
                    if (idx >= 0) {
                        current[idx].syncError = `Penghapusan Cloud gagal: ${err.message}`;
                        this.saveLocalStore(item.colName, current);
                    }
                }
                remainingQueue.push({ ...item, error: err.message });
            }
        }

        this.savePendingSyncQueue(remainingQueue);
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('jnt_sync_queue_updated', { detail: { count: remainingQueue.length, processed, conflicts: conflictsCount } }));
        }
        return { success: true, processed, conflicts: conflictsCount, remaining: remainingQueue.length };
    },

    async resolveSyncConflict(colName, docId, strategy = 'KEEP_CLOUD', customData = null) {
        console.log(`[RESOLVE CONFLICT] ${colName}/${docId} with strategy: ${strategy}`);
        const queue = this.getPendingSyncQueue();
        const queueIdx = queue.findIndex(q => q.colName === colName && q.docId === docId);
        const queuedItem = queueIdx >= 0 ? queue[queueIdx] : null;

        if (strategy === 'KEEP_CLOUD') {
            let cloudData = null;
            if (window.db) {
                try {
                    const snap = await window.db.collection(colName).doc(docId).get();
                    if (snap.exists) cloudData = snap.data();
                } catch (e) { }
            }
            if (!cloudData) {
                const conflict = (this.getSyncConflicts() || []).find(c => c.colName === colName && c.docId === docId);
                if (conflict) cloudData = conflict.cloudData;
            }

            if (cloudData) {
                const current = this.getLocalStore(colName);
                const idx = current.findIndex(i => (i.id === docId || i.kodeTugas === docId || i._docId === docId));
                const syncedObj = { ...cloudData, id: docId, syncStatus: 'SYNCED', syncedToCloud: true, _syncStatus: 'SYNCED' };
                delete syncedObj.syncError;
                delete syncedObj._conflictDetails;
                delete syncedObj._cloudVersion;
                delete syncedObj._pendingDelete;
                if (idx >= 0) {
                    current[idx] = syncedObj;
                } else {
                    current.push(syncedObj);
                }
                this.saveLocalStore(colName, current);
            }

            this.removePendingSyncItem(colName, docId);
            this.clearSyncConflict(colName, docId);

            await this.logAuditEvent({
                waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: sessionStorage.getItem('jnt_active_username') || "Supervisor",
                shiftId: this.getActiveShiftId(),
                modul: "Conflict Resolution",
                kodeTugas: docId,
                aktivitas: `[RESOLUSI KONFLIK] Diterapkan strategi KEEP_CLOUD untuk ${colName}/${docId}`
            });

            this.notifyDataMutated({ colName, docId, action: 'resolve_conflict', strategy: 'KEEP_CLOUD' });
            return { success: true, strategy: 'KEEP_CLOUD' };

        } else if (strategy === 'OVERWRITE_CLOUD') {
            const current = this.getLocalStore(colName);
            const localItem = current.find(i => (i.id === docId || i.kodeTugas === docId || i._docId === docId));
            const payload = localItem ? { ...localItem } : (queuedItem ? { ...queuedItem.data } : {});

            delete payload.syncStatus;
            delete payload.syncedToCloud;
            delete payload._syncStatus;
            delete payload.syncError;
            delete payload._conflictDetails;
            delete payload._cloudVersion;
            delete payload._baseUpdatedAt;
            delete payload._pendingDelete;
            payload.updatedAt = new Date().toISOString();

            if (window.db) {
                await window.db.collection(colName).doc(docId).set(payload, { merge: true });
            }

            const idx = current.findIndex(i => (i.id === docId || i.kodeTugas === docId || i._docId === docId));
            if (idx >= 0) {
                current[idx] = { ...current[idx], ...payload, syncStatus: 'SYNCED', syncedToCloud: true, _syncStatus: 'SYNCED' };
                delete current[idx].syncError;
                delete current[idx]._conflictDetails;
                delete current[idx]._cloudVersion;
                delete current[idx]._pendingDelete;
                this.saveLocalStore(colName, current);
            }

            this.removePendingSyncItem(colName, docId);
            this.clearSyncConflict(colName, docId);

            await this.logAuditEvent({
                waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: sessionStorage.getItem('jnt_active_username') || "Supervisor",
                shiftId: this.getActiveShiftId(),
                modul: "Conflict Resolution",
                kodeTugas: docId,
                aktivitas: `[RESOLUSI KONFLIK] Diterapkan strategi OVERWRITE_CLOUD (Manual Override) untuk ${colName}/${docId}`
            });

            this.notifyDataMutated({ colName, docId, action: 'resolve_conflict', strategy: 'OVERWRITE_CLOUD' });
            return { success: true, strategy: 'OVERWRITE_CLOUD' };

        } else if (strategy === 'MERGE') {
            const mergedPayload = { ...(customData || {}) };
            delete mergedPayload.syncStatus;
            delete mergedPayload.syncedToCloud;
            delete mergedPayload._syncStatus;
            delete mergedPayload.syncError;
            delete mergedPayload._conflictDetails;
            delete mergedPayload._cloudVersion;
            delete mergedPayload._pendingDelete;
            mergedPayload.updatedAt = new Date().toISOString();

            if (window.db) {
                await window.db.collection(colName).doc(docId).set(mergedPayload, { merge: true });
            }

            const current = this.getLocalStore(colName);
            const idx = current.findIndex(i => (i.id === docId || i.kodeTugas === docId || i._docId === docId));
            if (idx >= 0) {
                current[idx] = { ...current[idx], ...mergedPayload, syncStatus: 'SYNCED', syncedToCloud: true, _syncStatus: 'SYNCED' };
                delete current[idx].syncError;
                delete current[idx]._conflictDetails;
                delete current[idx]._cloudVersion;
                delete current[idx]._pendingDelete;
                this.saveLocalStore(colName, current);
            }

            this.removePendingSyncItem(colName, docId);
            this.clearSyncConflict(colName, docId);

            await this.logAuditEvent({
                waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: sessionStorage.getItem('jnt_active_username') || "Supervisor",
                shiftId: this.getActiveShiftId(),
                modul: "Conflict Resolution",
                kodeTugas: docId,
                aktivitas: `[RESOLUSI KONFLIK] Diterapkan strategi MERGE untuk ${colName}/${docId}`
            });

            this.notifyDataMutated({ colName, docId, action: 'resolve_conflict', strategy: 'MERGE' });
            return { success: true, strategy: 'MERGE' };
        }
    },

    async saveDoc(colName, docId, data, merge = false) {
        console.log(`[FIREBASE-ONLY] START WRITE [${colName}/${docId}]`, data);

        // ⚡ FIREBASE-ONLY: Cek koneksi internet sebelum menulis
        if (!navigator.onLine) {
            const errMsg = 'Tidak ada koneksi internet. Data tidak dapat disimpan. Hubungkan ke internet dan coba lagi.';
            console.error(`[FIREBASE-ONLY] REJECTED - Offline: [${colName}/${docId}]`);
            throw new Error(errMsg);
        }

        if (!window.db) {
            const errMsg = 'Database Firebase tidak terhubung. Periksa koneksi internet Anda.';
            console.error(`[FIREBASE-ONLY] REJECTED - DB not initialized: [${colName}/${docId}]`);
            throw new Error(errMsg);
        }

        const cloudPayload = { ...data };
        delete cloudPayload.syncStatus;
        delete cloudPayload.syncedToCloud;
        delete cloudPayload._syncStatus;
        delete cloudPayload.syncError;
        delete cloudPayload._baseUpdatedAt;
        delete cloudPayload._pendingDelete;
        delete cloudPayload._conflictDetails;
        delete cloudPayload._cloudVersion;
        cloudPayload.updatedAt = cloudPayload.updatedAt || new Date().toISOString();

        // Tulis langsung ke Firestore — tidak ada fallback localStorage
        await window.db.collection(colName).doc(docId).set(cloudPayload, { merge: merge });
        console.log(`[FIREBASE-ONLY] WRITE SUCCESS [${colName}/${docId}]`);

        const updatedObj = {
            id: docId,
            ...cloudPayload,
            syncStatus: 'SYNCED',
            syncedToCloud: true,
            _syncStatus: 'SYNCED'
        };

        this.notifyDataMutated({ colName, docId, action: 'save', data: updatedObj, syncStatus: 'SYNCED' });
        return updatedObj;
    },

    async deleteDoc(colName, docId) {
        console.log(`[FIREBASE-ONLY] START DELETE [${colName}/${docId}]`);

        // ⚡ FIREBASE-ONLY: Cek koneksi internet sebelum menghapus
        if (!navigator.onLine) {
            const errMsg = 'Tidak ada koneksi internet. Data tidak dapat dihapus. Hubungkan ke internet dan coba lagi.';
            console.error(`[FIREBASE-ONLY] DELETE REJECTED - Offline: [${colName}/${docId}]`);
            throw new Error(errMsg);
        }

        if (!window.db) {
            const errMsg = 'Database Firebase tidak terhubung. Periksa koneksi internet Anda.';
            console.error(`[FIREBASE-ONLY] DELETE REJECTED - DB not initialized: [${colName}/${docId}]`);
            throw new Error(errMsg);
        }

        // Hapus langsung dari Firestore — tidak ada fallback localStorage
        await window.db.collection(colName).doc(docId).delete();
        console.log(`[FIREBASE-ONLY] DELETE SUCCESS [${colName}/${docId}]`);
        this.notifyDataMutated({ colName, docId, action: 'delete', confirmed: true });
        return { success: true, confirmed: true };
    },

    // ----------------------------------------------------
    // HELPER: SLOT TIME CALCULATION & NORMALIZATION
    // ----------------------------------------------------
    getSlotForTime(timeStr) {
        if (!timeStr) return "00:00";
        let hour = 0;
        const str = String(timeStr).trim();
        const spaceParts = str.split(' ');
        const clockPart = spaceParts.length > 1 ? spaceParts[1] : spaceParts[0];
        if (clockPart && clockPart.includes(':')) {
            const timeParts = clockPart.split(':');
            hour = parseInt(timeParts[0], 10);
        }
        if (isNaN(hour)) hour = 0;

        if (hour >= 0 && hour < 4) return "00:00";
        if (hour >= 4 && hour < 8) return "04:00";
        if (hour >= 8 && hour < 12) return "08:00";
        if (hour >= 12 && hour < 16) return "12:00";
        if (hour >= 16 && hour < 20) return "16:00";
        return "20:00";
    },

    normalizeMonitoringSlots(item) {
        if (!item || !item.slots) return item;
        const slots = { ...item.slots };
        let modified = false;

        const slotKeys = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];
        for (const sKey of slotKeys) {
            const sVal = slots[sKey];
            if (sVal && sVal.jamUpdateAktual && (sVal.lokasi === "OUT JAKARTA" || sVal.keterangan === "Keberangkatan Awal")) {
                const correctKey = this.getSlotForTime(sVal.jamUpdateAktual);
                if (correctKey !== sKey) {
                    if (!slots[correctKey]) {
                        slots[correctKey] = sVal;
                        slots[sKey] = null;
                        modified = true;
                    }
                }
            }
        }

        return modified ? { ...item, slots } : item;
    },

    // ----------------------------------------------------
    // GLOBAL CASCADE DELETION ENGINE (v5)
    // ----------------------------------------------------
    // ----------------------------------------------------
    // GLOBAL CASCADE DELETION ENGINE (v5)
    // ----------------------------------------------------
    async deleteTripCascade(kodeTugas, isMasterDelete = true) {
        if (!kodeTugas) return;
        console.log(`[GLOBAL CASCADE DELETE] KodeTugas: ${kodeTugas}`);

        // 1. Troubles collection: Per Firestore security rules, deletion is forbidden (`allow delete: if false;`).
        // Close / resolve any open incidents for this trip without deleting the immutable history and without resurrecting the deleted trip.
        const localTroubles = this.getLocalStore('troubles') || [];
        for (const tr of localTroubles) {
            if (tr.kodeTugas === kodeTugas && tr.status !== 'SUDAH SELESAI') {
                await this.updateIncidentStatus(tr.incidentId || tr.id, 'SUDAH SELESAI', `[CASCADE DELETE] Trip ${kodeTugas} dibatalkan/dihapus`, "Supervisor", false);
            }
        }

        if (window.db) {
            try {
                const snap = await window.db.collection('troubles').where('kodeTugas', '==', kodeTugas).get();
                if (snap && snap.docs) {
                    for (const d of snap.docs) {
                        const data = d.data();
                        if (data.status !== 'SUDAH SELESAI') {
                            await window.db.collection('troubles').doc(d.id).update({
                                status: 'SUDAH SELESAI',
                                updatedAt: new Date().toISOString(),
                                catatanPenyelesaian: `[CASCADE DELETE] Trip ${kodeTugas} dibatalkan/dihapus. Kendala ditutup otomatis.`
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn('[CASCADE TROUBLE CLOSE NOTICE]', e.message);
            }
        }

        // 2. Cascade delete across all 5 operational trip collections
        await this.deleteDoc('sla_outbound', kodeTugas);
        await this.deleteDoc('monitoring_4h', kodeTugas);
        await this.deleteDoc('sla_return', kodeTugas);
        await this.deleteDoc('sla_roundtrip', kodeTugas);
        await this.deleteDoc('incoming', kodeTugas);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "Supervisor",
            shiftId: this.getActiveShiftId(),
            modul: "Cascade Delete",
            kodeTugas: kodeTugas,
            aktivitas: `[CASCADE DELETE] Penghapusan Perjalanan Kode Tugas: ${kodeTugas}`
        });
    },

    async deleteSLAOutbound(kodeTugas) {
        return this.deleteTripCascade(kodeTugas, true);
    },

    // ----------------------------------------------------
    // GLOBAL MASTER DATA SYNC PROPAGATION (UPDATE SSOT)
    // ----------------------------------------------------
    async updateIncomingTripMaster(kodeTugas, masterData) {
        if (!kodeTugas) return;
        const shiftId = this.getActiveShiftId();

        // 1. Update Master Incoming
        const updatedIncoming = await this.saveDoc('incoming', kodeTugas, { ...masterData, kodeTugas }, true);

        // 2. Cascade master fields to sla_outbound
        const outboundFields = {};
        if (masterData.platNomor) outboundFields.platNomor = masterData.platNomor;
        if (masterData.driver1) outboundFields.driver1 = masterData.driver1;
        if (masterData.trip) outboundFields.trip = masterData.trip;
        if (masterData.namaRute) outboundFields.namaRute = masterData.namaRute;
        if (masterData.vendor) outboundFields.vendor = masterData.vendor;
        if (masterData.jamBerangkat) outboundFields.jamBerangkat = masterData.jamBerangkat;
        if (masterData.targetSLAOutboundHours) outboundFields.targetSLAHours = masterData.targetSLAOutboundHours;
        if (Object.keys(outboundFields).length > 0) {
            await this.saveDoc('sla_outbound', kodeTugas, outboundFields, true);
        }

        // 3. Cascade master fields to monitoring_4h
        const monFields = {};
        if (masterData.platNomor) monFields.platNomor = masterData.platNomor;
        if (masterData.driver1) monFields.driver1 = masterData.driver1;
        if (masterData.trip) monFields.trip = masterData.trip;
        if (masterData.namaRute) monFields.namaRute = masterData.namaRute;
        if (masterData.tlc) monFields.tlc = masterData.tlc;
        if (masterData.vendor) monFields.vendor = masterData.vendor;
        if (Object.keys(monFields).length > 0) {
            await this.saveDoc('monitoring_4h', kodeTugas, monFields, true);
        }

        // 4. Cascade master fields to sla_roundtrip
        const roundtripFields = {};
        if (masterData.trip) roundtripFields.trip = masterData.trip;
        if (masterData.wilayah) roundtripFields.wilayah = masterData.wilayah;
        if (masterData.targetSLARoundtripHours) roundtripFields.targetSLAPP = masterData.targetSLARoundtripHours;
        if (Object.keys(roundtripFields).length > 0) {
            await this.saveDoc('sla_roundtrip', kodeTugas, roundtripFields, true);
        }

        // 5. Cascade master fields to troubles collection
        if (window.db) {
            try {
                const snap = await window.db.collection('troubles').where('kodeTugas', '==', kodeTugas).get();
                snap.forEach(async doc => {
                    const patch = {};
                    if (masterData.platNomor) patch.platNomor = masterData.platNomor;
                    if (masterData.driver1) patch.driver = masterData.driver1;
                    if (masterData.vendor) patch.vendor = masterData.vendor;
                    if (masterData.trip || masterData.namaRute) patch.rute = masterData.trip || masterData.namaRute;
                    if (Object.keys(patch).length > 0) {
                        await window.db.collection('troubles').doc(doc.id).update(patch);
                    }
                });
            } catch (e) {
                console.warn('[CASCADE UPDATE MASTER TROUBLE NOTICE]', e.message);
            }
        }

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "Hamdan",
            shiftId: shiftId,
            modul: "Master SSOT",
            kodeTugas: kodeTugas,
            aktivitas: `Update Master Perjalanan Kode Tugas: ${kodeTugas}`
        });

        return updatedIncoming;
    },

    // ----------------------------------------------------
    // GLOBAL TRIP STATUS ENGINE
    // ----------------------------------------------------
    async updateTripStatus(kodeTugas, status, meta = {}) {
        if (!kodeTugas) return;
        const shiftId = this.getActiveShiftId();

        // Update incoming master status
        await this.saveDoc('incoming', kodeTugas, { status: status, ...meta }, true);

        // Map status for monitoring_4h
        let monStatus = "ON PROGRESS";
        if (status === 'SUDAH SELESAI' || status === 'COMPLETED') monStatus = "COMPLETED";
        else if (status === 'KENDALA' || status === 'TROUBLE') monStatus = "KENDALA";
        else if (status === 'WAITING') monStatus = "WAITING";

        await this.saveDoc('monitoring_4h', kodeTugas, { statusPerjalanan: monStatus }, true);

        // Map status for sla_outbound
        let slaStatus = "BERJALAN";
        if (status === 'SUDAH SELESAI' || status === 'COMPLETED') slaStatus = "ON TIME";
        else if (status === 'KENDALA') slaStatus = "KENDALA";

        await this.saveDoc('sla_outbound', kodeTugas, { statusSla: slaStatus }, true);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: meta.inputBy || sessionStorage.getItem('jnt_active_username') || "Hamdan",
            shiftId: shiftId,
            modul: "Status Engine",
            kodeTugas: kodeTugas,
            aktivitas: `Perubahan Status Perjalanan ${kodeTugas} menjadi ${status}`
        });
    },

    // ----------------------------------------------------
    // DATA CONSISTENCY VALIDATOR ENGINE
    // ----------------------------------------------------
    async validateTripConsistency(kodeTugas) {
        if (!kodeTugas) return { isConsistent: true, issues: [] };

        const issues = [];
        const incData = await this.getDoc('incoming', kodeTugas);
        const outData = await this.getDoc('sla_outbound', kodeTugas);
        const monData = await this.getDoc('monitoring_4h', kodeTugas);

        if (!incData) issues.push(`Data Incoming Master untuk ${kodeTugas} tidak ditemukan.`);
        if (!outData) issues.push(`Data SLA Outbound untuk ${kodeTugas} tidak ditemukan.`);
        if (!monData) issues.push(`Data Monitoring 4H untuk ${kodeTugas} tidak ditemukan.`);

        if (incData && outData && incData.platNomor !== outData.platNomor) {
            issues.push(`Inkonsistensi Plat Nomor: Incoming (${incData.platNomor}) vs SLA (${outData.platNomor})`);
        }

        return {
            kodeTugas,
            isConsistent: issues.length === 0,
            issues
        };
    },

    createSub(colName, callback) {
        let isCloudInitialized = false;

        const emit = (cloudList = null) => {
            console.log(`[SLA UPDATE] RENDER START for ${colName}`);
            const map = new Map();

            if (cloudList !== null && isCloudInitialized) {
                cloudList.forEach(i => {
                    const key = i.kodeTugas || i.id || i._docId;
                    if (key) map.set(key, i);
                });
                this.saveLocalStore(colName, Array.from(map.values()));
            } else {
                const localList = this.getLocalStore(colName);
                localList.forEach(i => {
                    const key = i.kodeTugas || i.id || i._docId;
                    if (key) map.set(key, i);
                });
            }

            let resultList = Array.from(map.values());
            if (colName === 'monitoring_4h') {
                resultList = resultList.map(item => this.normalizeMonitoringSlots(item));
            }
            console.log(`[SLA UPDATE] RENDER SUCCESS for ${colName} (${resultList.length} items)`);
            callback(resultList);
        };

        emit(null);

        const eventHandler = () => emit(null);
        window.addEventListener('jnt_data_updated', eventHandler);

        let unsub = () => { };
        if (window.db) {
            try {
                unsub = window.db.collection(colName).onSnapshot(snap => {
                    const data = [];
                    snap.forEach(d => data.push({ id: d.id, ...d.data() }));
                    isCloudInitialized = true;
                    emit(data);
                }, err => {
                    console.warn(`[SLA UPDATE] FIRESTORE ERROR snapshot [${colName}]: ${err.message}`);
                    console.log(`[SLA UPDATE] LOCAL STORAGE FALLBACK rendering [${colName}]`);
                    emit(null);
                });
            } catch (e) {
                emit(null);
            }
        }

        return () => {
            window.removeEventListener('jnt_data_updated', eventHandler);
            if (typeof unsub === 'function') unsub();
        };
    },

    // Helper to get active Shift ID & Active Shift Object
    getActiveShiftId() {
        // FIREBASE-ONLY: Hanya gunakan sessionStorage (tidak persist ke device)
        const stored = sessionStorage.getItem('jnt_active_shift_id');
        if (stored) return stored;
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const fallbackId = `SHIFT-${todayStr}-01`;
        sessionStorage.setItem('jnt_active_shift_id', fallbackId);
        return fallbackId;
    },

    getActiveShift() {
        const activeId = this.getActiveShiftId();
        const shifts = this.getLocalStore('shifts');
        let found = shifts.find(s => s.shiftId === activeId || s.id === activeId);
        if (!found) {
            found = shifts.find(s => s.status === 'AKTIF');
        }
        if (!found) {
            const todayStr = new Date().toISOString().slice(0, 10);
            found = {
                id: activeId,
                shiftId: activeId,
                tanggal: todayStr,
                namaShift: "Shift 1 (08:00 - 20:00 WIB)",
                jamMulai: "08:00",
                jamSelesai: "20:00",
                status: "AKTIF",
                operator1: { nama: "Hamdan Hamdani", role: "Operator Utama", tugas: "Monitoring 4H & Incident" },
                operator2: { nama: "Rizky Ramadhan", role: "Operator Pendamping", tugas: "SLA Vendor" },
                createdAt: new Date().toISOString()
            };
            this.saveDoc('shifts', activeId, found, true);
        }
        return found;
    },

    // ----------------------------------------------------
    // 1. AUTO-SEED INITIAL MASTER DATA & TRANSACTIONS
    // ----------------------------------------------------
    async seedInitialDataIfEmpty() {
        try {
            // A. Master Trips & SLA Targets
            const initialMasterTrips = [
                { code: "BDO CDD", rute: "JAKARTA - BANDUNG", tlc: "BANDUNG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 4.5, targetSLAReturnHours: 4.5, targetSLARoundtripHours: 9.0, status: "ACTIVE" },
                { code: "BDO FUSO", rute: "JAKARTA - BANDUNG", tlc: "BANDUNG", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 5.5, targetSLAReturnHours: 5.5, targetSLARoundtripHours: 11.0, status: "ACTIVE" },
                { code: "TKG CDD", rute: "JAKARTA - LAMPUNG", tlc: "LAMPUNG", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 11.0, targetSLAReturnHours: 11.0, targetSLARoundtripHours: 22.0, status: "ACTIVE" },
                { code: "TKG FUSO", rute: "JAKARTA - LAMPUNG", tlc: "LAMPUNG", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 13.5, targetSLAReturnHours: 13.5, targetSLARoundtripHours: 27.0, status: "ACTIVE" },
                { code: "SRG CDD", rute: "JAKARTA - SEMARANG", tlc: "SEMARANG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 12.5, targetSLAReturnHours: 12.5, targetSLARoundtripHours: 25.0, status: "ACTIVE" },
                { code: "SRG FUSO", rute: "JAKARTA - SEMARANG", tlc: "SEMARANG", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 14.0, targetSLAReturnHours: 14.0, targetSLARoundtripHours: 28.0, status: "ACTIVE" },
                { code: "PLM CDD", rute: "JAKARTA - PALEMBANG", tlc: "PALEMBANG", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "PLM FUSO", rute: "JAKARTA - PALEMBANG", tlc: "PALEMBANG", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "SOC CDD", rute: "JAKARTA - SOLO", tlc: "SOLO", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 14.5, targetSLAReturnHours: 14.5, targetSLARoundtripHours: 29.0, status: "ACTIVE" },
                { code: "SOC FUSO", rute: "JAKARTA - SOLO", tlc: "SOLO", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 14.5, targetSLAReturnHours: 14.5, targetSLARoundtripHours: 29.0, status: "ACTIVE" },
                { code: "JOG CDD", rute: "JAKARTA - YOGYAKARTA", tlc: "YOGYAKARTA", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 16.0, targetSLAReturnHours: 16.0, targetSLARoundtripHours: 32.0, status: "ACTIVE" },
                { code: "JOG FUSO", rute: "JAKARTA - YOGYAKARTA", tlc: "YOGYAKARTA", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "SUB CDD", rute: "JAKARTA - SURABAYA", tlc: "SURABAYA", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 19.0, targetSLAReturnHours: 19.0, targetSLARoundtripHours: 38.0, status: "ACTIVE" },
                { code: "SUB FUSO", rute: "JAKARTA - SURABAYA", tlc: "SURABAYA", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 23.0, targetSLAReturnHours: 23.0, targetSLARoundtripHours: 46.0, status: "ACTIVE" },
                { code: "PKU CDD", rute: "JAKARTA - PEKANBARU", tlc: "PEKANBARU", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 43.0, targetSLAReturnHours: 43.0, targetSLARoundtripHours: 86.0, status: "ACTIVE" },
                { code: "PKU FUSO", rute: "JAKARTA - PEKANBARU", tlc: "PEKANBARU", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 43.83, targetSLAReturnHours: 43.83, targetSLARoundtripHours: 87.67, status: "ACTIVE" },
                { code: "PDG CDD", rute: "JAKARTA - PADANG", tlc: "PADANG", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 44.33, targetSLAReturnHours: 44.33, targetSLARoundtripHours: 88.67, status: "ACTIVE" },
                { code: "PDG FUSO", rute: "JAKARTA - PADANG", tlc: "PADANG", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 49.33, targetSLAReturnHours: 49.33, targetSLARoundtripHours: 98.67, status: "ACTIVE" },
                { code: "MES CDD", rute: "JAKARTA - MEDAN", tlc: "MEDAN", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 71.0, targetSLAReturnHours: 71.0, targetSLARoundtripHours: 142.0, status: "ACTIVE" },
                { code: "MES FUSO", rute: "JAKARTA - MEDAN", tlc: "MEDAN", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 71.0, targetSLAReturnHours: 71.0, targetSLARoundtripHours: 142.0, status: "ACTIVE" },
                { code: "BTJ CDD", rute: "JAKARTA - ACEH", tlc: "ACEH", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 62.0, targetSLAReturnHours: 62.0, targetSLARoundtripHours: 124.0, status: "ACTIVE" },
                { code: "BTJ FUSO", rute: "JAKARTA - ACEH", tlc: "ACEH", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 63.0, targetSLAReturnHours: 63.0, targetSLARoundtripHours: 126.0, status: "ACTIVE" },
                { code: "TGR CDD", rute: "JAKARTA - TANGERANG", tlc: "TANGERANG", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 0.5, targetSLAReturnHours: 0.5, targetSLARoundtripHours: 1.0, status: "ACTIVE" },
                { code: "DPK CDD", rute: "JAKARTA - DEPOK", tlc: "DEPOK", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.0, targetSLAReturnHours: 2.0, targetSLARoundtripHours: 4.0, status: "ACTIVE" },
                { code: "BGR CDD", rute: "JAKARTA - BOGOR", tlc: "BOGOR", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.83, targetSLAReturnHours: 2.83, targetSLARoundtripHours: 5.67, status: "ACTIVE" },
                { code: "BKI CDD", rute: "JAKARTA - BEKASI", tlc: "BEKASI", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.0, targetSLAReturnHours: 2.0, targetSLARoundtripHours: 4.0, status: "ACTIVE" },
                { code: "CKR CDD", rute: "JAKARTA - CIKARANG", tlc: "CIKARANG", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.83, targetSLAReturnHours: 2.83, targetSLARoundtripHours: 5.67, status: "ACTIVE" },
                { code: "SEG CDD", rute: "JAKARTA - SERANG", tlc: "SERANG", layanan: "CDD", wilayah: "BANTEN", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
                { code: "SMI CDD", rute: "JAKARTA - SUKABUMI", tlc: "SUKABUMI", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 6.0, targetSLAReturnHours: 6.0, targetSLARoundtripHours: 12.0, status: "ACTIVE" },
                { code: "TSK CDD", rute: "JAKARTA - TASIKMALAYA", tlc: "TASIKMALAYA", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 10.0, targetSLAReturnHours: 10.0, targetSLARoundtripHours: 20.0, status: "ACTIVE" },
                { code: "CRN CDD", rute: "JAKARTA - CIREBON", tlc: "CIREBON", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 8.5, targetSLAReturnHours: 8.5, targetSLARoundtripHours: 17.0, status: "ACTIVE" },
                { code: "CKP CDD", rute: "JAKARTA - CIKAMPEK", tlc: "CIKAMPEK", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 4.5, targetSLAReturnHours: 4.5, targetSLARoundtripHours: 9.0, status: "ACTIVE" },
                { code: "PTI CDD", rute: "JAKARTA - PATI", tlc: "PATI", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 14.0, targetSLAReturnHours: 14.0, targetSLARoundtripHours: 28.0, status: "ACTIVE" },
                { code: "PWO CDD", rute: "JAKARTA - PURWOKERTO", tlc: "PURWOKERTO", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 12.5, targetSLAReturnHours: 12.5, targetSLARoundtripHours: 25.0, status: "ACTIVE" },
                { code: "MDN CDD", rute: "JAKARTA - MADIUN", tlc: "MADIUN", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "KDR CDD", rute: "JAKARTA - KEDIRI", tlc: "KEDIRI", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 14.0, targetSLAReturnHours: 14.0, targetSLARoundtripHours: 28.0, status: "ACTIVE" },
                { code: "MLG CDD", rute: "JAKARTA - MALANG", tlc: "MALANG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 21.0, targetSLAReturnHours: 21.0, targetSLARoundtripHours: 42.0, status: "ACTIVE" },
                { code: "TGL CDD", rute: "JAKARTA - TEGAL", tlc: "TEGAL", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 9.0, targetSLAReturnHours: 9.0, targetSLARoundtripHours: 18.0, status: "ACTIVE" },
                { code: "DPS CDD", rute: "JAKARTA - DENPASAR", tlc: "DENPASAR", layanan: "CDD", wilayah: "BALI", targetSLAOutboundHours: 40.0, targetSLAReturnHours: 40.0, targetSLARoundtripHours: 80.0, status: "ACTIVE" }
            ];

            if (this.getLocalStore('master_trips').length === 0) {
                this.saveLocalStore('master_trips', initialMasterTrips.map(t => ({ id: t.code, ...t })));
            }
            if (window.db) {
                const tripsSnap = await window.db.collection('master_trips').get().catch(() => ({ empty: true }));
                if (tripsSnap.empty) {
                    for (const t of initialMasterTrips) {
                        await window.db.collection('master_trips').doc(t.code).set(t);
                    }
                }
            }

            // B. Master Fleets
            const initialFleets = [
                { platNomor: "B 9134 PXX", tipe: "FUSO Box", vendor: "PT. SERIKAT HANTAR EKSPEDISI (SERYU)", status: "Siap Jalan" },
                { platNomor: "B 9041 SXX", tipe: "CDD Long", vendor: "PT. ASIA PASIFIK LOGISTIK (APL)", status: "Siap Jalan" },
                { platNomor: "B 9812 BKN", tipe: "CDD Standard", vendor: "PT. JET TRANSPORT SERVICES (JTS)", status: "Siap Jalan" },
                { platNomor: "B 9356 PKK", tipe: "FUSO Wingbox", vendor: "PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)", status: "Siap Jalan" },
                { platNomor: "B 9201 SKK", tipe: "FUSO Box", vendor: "PT. SOLUSI DUNIA EXPEDISI (SDE)", status: "Siap Jalan" }
            ];

            if (this.getLocalStore('master_fleets').length === 0) {
                this.saveLocalStore('master_fleets', initialFleets.map(f => ({ id: f.platNomor.replace(/\s+/g, ''), ...f })));
            }
            if (window.db) {
                const fleetsSnap = await window.db.collection('master_fleets').get().catch(() => ({ empty: true }));
                if (fleetsSnap.empty) {
                    for (const f of initialFleets) {
                        await window.db.collection('master_fleets').doc(f.platNomor.replace(/\s+/g, '')).set(f);
                    }
                }
            }

            // B2. Master Vendors (11 Official Vendors)
            const initialVendors = [
                { code: "SERYU", nama: "PT. SERIKAT HANTAR EKSPEDISI (SERYU)", status: "AKTIF" },
                { code: "APL", nama: "PT. ASIA PASIFIK LOGISTIK (APL)", status: "AKTIF" },
                { code: "KLS", nama: "PT. KENCANA LOGISTIK SAMUDERA (KLS)", status: "AKTIF" },
                { code: "JTS", nama: "PT. JET TRANSPORT SERVICES (JTS)", status: "AKTIF" },
                { code: "CHIJUN", nama: "PT CHIJUN SMART FREIGHT (CHIJUN)", status: "AKTIF" },
                { code: "PAL", nama: "PT. PESONA ABADI LOGISTIK (PAL)", status: "AKTIF" },
                { code: "AB", nama: "PT ANUGERAH BERSATU (AB)", status: "AKTIF" },
                { code: "SOLUSI", nama: "PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)", status: "AKTIF" },
                { code: "REYA", nama: "PT. REYA BAHAGIA ABADI (REYA)", status: "AKTIF" },
                { code: "SDE", nama: "PT. SOLUSI DUNIA EXPEDISI (SDE)", status: "AKTIF" },
                { code: "MTI", nama: "PT. MEDIA TRANS INDO (MTI)", status: "AKTIF" }
            ];

            if (this.getLocalStore('master_vendors').length === 0) {
                this.saveLocalStore('master_vendors', initialVendors.map(v => ({ id: v.code, ...v })));
            }
            if (window.db) {
                const vendorsSnap = await window.db.collection('master_vendors').get().catch(() => ({ empty: true }));
                if (vendorsSnap.empty) {
                    for (const v of initialVendors) {
                        await window.db.collection('master_vendors').doc(v.code).set(v);
                    }
                }
            }

            // C. Master Drivers
            const initialDrivers = [
                { nama: "Nasrul F.", phone: "0812-1111-2222", sim: "B2 Umum", status: "Aktif" },
                { nama: "Dian OS", phone: "0812-3333-4444", sim: "B2 Umum", status: "Aktif" },
                { nama: "Yosep P.", phone: "0812-5555-6666", sim: "B1 Umum", status: "Aktif" },
                { nama: "Ahmad K.", phone: "0812-7777-8888", sim: "B1 Umum", status: "Aktif" },
                { nama: "Budi S.", phone: "0812-9999-0000", sim: "B2 Umum", status: "Aktif" }
            ];

            if (this.getLocalStore('master_drivers').length === 0) {
                this.saveLocalStore('master_drivers', initialDrivers.map(d => ({ id: d.nama.toLowerCase().replace(/\s+/g, '_'), ...d })));
            }
            if (window.db) {
                const driversSnap = await window.db.collection('master_drivers').get().catch(() => ({ empty: true }));
                if (driversSnap.empty) {
                    for (const d of initialDrivers) {
                        await window.db.collection('master_drivers').doc(d.nama.toLowerCase().replace(/\s+/g, '_')).set(d);
                    }
                }
            }

            // D. Master Alasan Keterlambatan
            const initialReasons = [
                { id: "R01", alasan: "Ban Pecah / Kerusakan Ban" },
                { id: "R02", alasan: "Mogok / Mesin Overheat" },
                { id: "R03", alasan: "Kemacetan Parah Jalur Tol" },
                { id: "R04", alasan: "Antrean Panjang Pelabuhan / Penyeberangan" },
                { id: "R05", alasan: "Cuaca Buruk / Hujan Deras & Banjir" },
                { id: "R06", alasan: "Kendala Administrasi / Dokumen Gateway" }
            ];

            if (this.getLocalStore('master_reasons').length === 0) {
                this.saveLocalStore('master_reasons', initialReasons);
            }
            if (window.db) {
                const reasonsSnap = await window.db.collection('master_reasons').get().catch(() => ({ empty: true }));
                if (reasonsSnap.empty) {
                    for (const r of initialReasons) {
                        await window.db.collection('master_reasons').doc(r.id).set(r);
                    }
                }
            }

            // E. Seed Users Collection
            const initialUsers = [
                { username: "hamdan", fullname: "Hamdan Hamdani", email: "hamdan@jtexpress.co.id", phone: "0812-3456-7890", role: "Operator SLA", tlc: "TLC Cikande", status: "Aktif", createdAt: "2026-06-10 14:25" },
                { username: "rizky", fullname: "Rizky Ramadhan", email: "rizky@jtexpress.co.id", phone: "0812-9876-1234", role: "Operator Monitoring", tlc: "Head Office", status: "Aktif", createdAt: "2026-06-10 14:30" },
                { username: "rina", fullname: "Rina Marlina", email: "rina@jtexpress.co.id", phone: "0813-9876-5432", role: "Supervisor", tlc: "TLC Serpong", status: "Aktif", createdAt: "2026-05-15 10:00" },
                { username: "dedi", fullname: "Dedi Setiawan", email: "dedi@jtexpress.co.id", phone: "0815-1122-3344", role: "Admin", tlc: "Head Office", status: "Aktif", createdAt: "2026-05-01 09:00" },
                { username: "budi", fullname: "Budi Santoso", email: "budi@jtexpress.co.id", phone: "0812-9988-7766", role: "Operator SLA", tlc: "Gateway Surabaya", status: "Nonaktif", createdAt: "2026-07-01 11:00" }
            ];

            if (this.getLocalStore('users').length === 0) {
                this.saveLocalStore('users', initialUsers.map(u => ({ id: u.username.toLowerCase(), ...u })));
            }
            if (window.db) {
                const usersSnap = await window.db.collection('users').get().catch(() => ({ empty: true }));
                if (usersSnap.empty) {
                    for (const u of initialUsers) {
                        await window.db.collection('users').doc(u.username.toLowerCase()).set(u);
                    }
                }
            }

            // F. Seed Active Shift Data
            const activeShiftObj = {
                shiftId: "SHIFT-20260816-01",
                tanggal: "2026-08-16",
                namaShift: "Shift 1 (08:00 - 20:00)",
                status: "AKTIF",
                jamMulai: "08:00 WIB",
                jamSelesai: "20:00 WIB",
                operator1: { nama: "Hamdan", role: "Operator", tugas: "Monitoring + Trouble/Laka" },
                operator2: { nama: "Rizky", role: "Operator", tugas: "SLA + Incoming" },
                stats: {
                    inputIncomingCount: 28,
                    slaUpdateCount: 37,
                    monitoringCheckinCount: 42,
                    incidentCount: 4
                }
            };

            if (this.getLocalStore('shifts').length === 0) {
                this.saveLocalStore('shifts', [activeShiftObj]);
            }
            if (window.db) {
                const shiftSnap = await window.db.collection('shifts').get().catch(() => ({ empty: true }));
                if (shiftSnap.empty) {
                    await window.db.collection('shifts').doc(activeShiftObj.shiftId).set(activeShiftObj);
                }
            }

            // G. Seed Initial Trouble & Laka Incidents
            const initialTroubles = [
                {
                    incidentId: "INC-20261002-01",
                    id: "INC-20261002-01",
                    kodeTugas: "DBGX2610020004",
                    jenis: "Trouble",
                    kategoriTrouble: "Ban Pecah / Kerusakan Ban",
                    severity: "MEDIUM",
                    lokasiKejadian: "Tol Cikampek KM 47",
                    waktuKejadian: "02/10/2026 10:35",
                    platNomor: "B 9356 PKK",
                    driver: "Yosep P.",
                    vendor: "PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)",
                    rute: "JAKARTA - PALEMBANG (PLM FUSO)",
                    deskripsi: "Ban belakang kanan pecah, sedang proses penggantian ban cadangan.",
                    dilaporkanOleh: "Hamdan",
                    status: "DALAM PENANGANAN",
                    shiftId: "SHIFT-20260816-01",
                    createdAt: new Date().toISOString(),
                    history: [
                        {
                            time: "02/10/2026 10:35",
                            note: "Laporan insiden ban pecah diterima dari driver.",
                            status: "OPEN",
                            user: "Hamdan"
                        },
                        {
                            time: "02/10/2026 10:45",
                            note: "Tim mekanik rekanan vendor meluncur ke lokasi kejadian.",
                            status: "DALAM PENANGANAN",
                            user: "Hamdan"
                        }
                    ]
                },
                {
                    incidentId: "INC-20261001-02",
                    id: "INC-20261001-02",
                    kodeTugas: "DBGX2610020002",
                    jenis: "Trouble",
                    kategoriTrouble: "Mogok / Mesin Overheat",
                    severity: "HIGH",
                    lokasiKejadian: "Rest Area KM 208 Cipali",
                    waktuKejadian: "01/10/2026 23:15",
                    platNomor: "B 9041 SXX",
                    driver: "Dian OS",
                    vendor: "PT. ASIA PASIFIK LOGISTIK (APL)",
                    rute: "JAKARTA - SEMARANG (SRG FUSO)",
                    deskripsi: "Radiator panas berlebih, air pendingin diganti dan armada kembali jalan.",
                    dilaporkanOleh: "Rizky",
                    status: "SUDAH SELESAI",
                    shiftId: "SHIFT-20260816-01",
                    createdAt: new Date().toISOString(),
                    history: [
                        {
                            time: "01/10/2026 23:15",
                            note: "Armada berhenti di Rest Area 208 karena indikator suhu mesin tinggi.",
                            status: "OPEN",
                            user: "Rizky"
                        },
                        {
                            time: "02/10/2026 00:20",
                            note: "Mesin telah dingin dan air radiator diisi ulang. Unit melanjutkan perjalanan normal.",
                            status: "SUDAH SELESAI",
                            user: "Rizky"
                        }
                    ]
                }
            ];

            if (this.getLocalStore('troubles').length === 0) {
                this.saveLocalStore('troubles', initialTroubles);
            }
            if (window.db) {
                const troublesSnap = await window.db.collection('troubles').get().catch(() => ({ empty: true }));
                if (troublesSnap.empty) {
                    for (const tr of initialTroubles) {
                        await window.db.collection('troubles').doc(tr.incidentId).set(tr);
                    }
                }
            }

            // H. Seed Initial Transactions & Incidents (DEMO / DEVELOPMENT MODE GUARD)
            const IS_DEMO_MODE = true; // Toggle for demo/production deployment
            if (IS_DEMO_MODE && this.getLocalStore('incoming').length === 0) {
                // FIREBASE-ONLY: Seed version tidak disimpan ke localStorage.

                const initialIncoming = [
                    {
                        kodeTugas: "DBGX2610020001",
                        trip: "JOG CDD",
                        tlc: "JOG CDD",
                        namaRute: "JAKARTA - YOGYA",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9134 PXX",
                        driver1: "Nasrul F.",
                        driver2: "Budi S.",
                        jamBerangkat: "02/10/2026 09:00",
                        estimasiSampai: "03/10/2026 01:00",
                        totalAwb: 6420,
                        sisaAwb: 0,
                        status: "SEDANG DIPROSES",
                        targetSLAOutboundHours: 16,
                        targetSLAReturnHours: 16,
                        targetSLARoundtripHours: 32,
                        inputBy: "Hamdan",
                        shiftId: "SHIFT-20260816-01"
                    },
                    {
                        kodeTugas: "DBGX2610020002",
                        trip: "SRG FUSO",
                        tlc: "SRG FUSO",
                        namaRute: "JAKARTA - SEMARANG",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9041 SXX",
                        driver1: "Dian OS",
                        driver2: "Agus T.",
                        jamBerangkat: "01/10/2026 21:00",
                        estimasiSampai: "02/10/2026 12:00",
                        totalAwb: 8150,
                        sisaAwb: 0,
                        status: "SEDANG DIPROSES",
                        targetSLAOutboundHours: 15,
                        targetSLAReturnHours: 15,
                        targetSLARoundtripHours: 30,
                        inputBy: "Rizky",
                        shiftId: "SHIFT-20260816-01"
                    },
                    {
                        kodeTugas: "DBGX2610020003",
                        trip: "BDG CDD",
                        tlc: "BDG CDD",
                        namaRute: "JAKARTA - BANDUNG",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9201 TXX",
                        driver1: "Heri K.",
                        driver2: "Rahmat M.",
                        jamBerangkat: "02/10/2026 05:30",
                        estimasiSampai: "02/10/2026 11:30",
                        totalAwb: 4120,
                        sisaAwb: 0,
                        status: "SEDANG DIPROSES",
                        targetSLAOutboundHours: 6,
                        targetSLAReturnHours: 6,
                        targetSLARoundtripHours: 12,
                        inputBy: "Hamdan",
                        shiftId: "SHIFT-20260816-01"
                    },
                    {
                        kodeTugas: "DBGX2610020004",
                        trip: "PLM FUSO",
                        tlc: "PLM FUSO",
                        namaRute: "JAKARTA - PALEMBANG",
                        tripType: "ADD",
                        wilayah: "SUMATERA",
                        platNomor: "B 9356 PKK",
                        driver1: "Yosep P.",
                        driver2: "Yuda R.",
                        jamBerangkat: "01/10/2026 08:00",
                        estimasiSampai: "02/10/2026 04:00",
                        totalAwb: 7430,
                        sisaAwb: 0,
                        status: "KENDALA",
                        targetSLAOutboundHours: 20,
                        targetSLAReturnHours: 20,
                        targetSLARoundtripHours: 40,
                        inputBy: "Hamdan",
                        shiftId: "SHIFT-20260816-01"
                    },
                    {
                        kodeTugas: "DBGX2610020005",
                        trip: "SUB FUSO",
                        tlc: "SUB FUSO",
                        namaRute: "JAKARTA - SURABAYA",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9812 WXX",
                        driver1: "Bambang U.",
                        driver2: "Eko S.",
                        jamBerangkat: "01/10/2026 10:00",
                        estimasiSampai: "02/10/2026 06:00",
                        totalAwb: 9100,
                        sisaAwb: 0,
                        status: "SUDAH SELESAI",
                        jamSampaiAktual: "02/10/2026 05:30",
                        targetSLAOutboundHours: 20,
                        targetSLAReturnHours: 20,
                        targetSLARoundtripHours: 40,
                        inputBy: "Rizky",
                        shiftId: "SHIFT-20260816-01"
                    },
                    {
                        kodeTugas: "DBGX2610020006",
                        trip: "TKG CDD",
                        tlc: "TKG CDD",
                        namaRute: "JAKARTA - LAMPUNG",
                        tripType: "ADD",
                        wilayah: "SUMATERA",
                        platNomor: "B 9400 ERR",
                        driver1: "Untung S.",
                        driver2: "",
                        jamBerangkat: "",
                        estimasiSampai: "",
                        totalAwb: 3000,
                        sisaAwb: 3000,
                        status: "DRAFT INCOMPLETE",
                        targetSLAOutboundHours: 0,
                        targetSLAReturnHours: 0,
                        targetSLARoundtripHours: 0,
                        inputBy: "Hamdan",
                        shiftId: "SHIFT-20260816-01"
                    }
                ];

                for (const item of initialIncoming) {
                    await this.saveDoc('incoming', item.kodeTugas, item, true);

                    // Outbound SLA
                    await this.saveDoc('sla_outbound', item.kodeTugas, {
                        kodeTugas: item.kodeTugas,
                        trip: item.trip,
                        namaRute: item.namaRute,
                        platNomor: item.platNomor,
                        jamBerangkat: item.jamBerangkat,
                        jamSampaiAktual: item.jamSampaiAktual || (item.status === 'SUDAH SELESAI' ? "02/10/2026 05:30" : ""),
                        durasiBerangkatMinutes: item.status === 'SUDAH SELESAI' ? 1170 : 0,
                        targetSLAHours: item.targetSLAOutboundHours,
                        lateMinutes: 0,
                        statusSla: item.status === 'SUDAH SELESAI' ? "ON TIME" : (item.status === 'KENDALA' ? "KENDALA" : "BERJALAN"),
                        alasan: item.status === 'SUDAH SELESAI' ? "Lancar" : "",
                        inputBy: item.inputBy,
                        shiftId: item.shiftId
                    }, true);

                    // Roundtrip SLA
                    await this.saveDoc('sla_roundtrip', item.kodeTugas, {
                        kodeTugas: item.kodeTugas,
                        trip: item.trip,
                        wilayah: item.wilayah,
                        targetSLAPP: item.targetSLARoundtripHours,
                        durasiBerangkatMinutes: item.status === 'SUDAH SELESAI' ? 1170 : 0,
                        durasiBalikanMinutes: 0,
                        totalDurasiPPMinutes: item.status === 'SUDAH SELESAI' ? 1170 : 0,
                        totalLatePPMinutes: 0,
                        statusRoundtrip: "WAITING_RETURN",
                        keterangan: "⏳ Menunggu data perjalanan balikan dari Gateway"
                    }, true);
                }
            }

            console.log("✅ Dual SSOT Master, SLA, Users & Troubles Initial Data Seeding completed.");
        } catch (err) {
            console.warn("⚠️ Dual SSOT Seeding notice:", err.message);
        }
    },

    // ----------------------------------------------------
    // 2. MASTER DATA ENGINE (LOOKUP & SAFE DELETION)
    // ----------------------------------------------------
    async lookupTripMaster(tripCode) {
        const fallbackMap = {
            "JOG CDD": { trip: "JOG CDD", rute: "JAKARTA - YOGYA", tlc: "JOG CDD", layanan: "ADD", wilayah: "JAWA", targetSLAOutboundHours: 16, targetSLAReturnHours: 16, targetSLARoundtripHours: 32, status: "ACTIVE" },
            "SRG FUSO": { trip: "SRG FUSO", rute: "JAKARTA - SEMARANG", tlc: "SRG FUSO", layanan: "ADD", wilayah: "JAWA", targetSLAOutboundHours: 15, targetSLAReturnHours: 15, targetSLARoundtripHours: 30, status: "ACTIVE" },
            "BDG CDD": { trip: "BDG CDD", rute: "JAKARTA - BANDUNG", tlc: "BDG CDD", layanan: "REG", wilayah: "JAWA", targetSLAOutboundHours: 6, targetSLAReturnHours: 6, targetSLARoundtripHours: 12, status: "ACTIVE" },
            "PLM FUSO": { trip: "PLM FUSO", rute: "JAKARTA - PALEMBANG", tlc: "PLM FUSO", layanan: "ADD", wilayah: "SUMATERA", targetSLAOutboundHours: 24, targetSLAReturnHours: 24, targetSLARoundtripHours: 48, status: "ACTIVE" },
            "SUB FUSO": { trip: "SUB FUSO", rute: "JAKARTA - SURABAYA", tlc: "SUB FUSO", layanan: "ADD", wilayah: "JAWA", targetSLAOutboundHours: 20, targetSLAReturnHours: 20, targetSLARoundtripHours: 40, status: "ACTIVE" }
        };

        const localTrips = this.getLocalStore('master_trips');
        const foundLocal = localTrips.find(t => t.code === tripCode || t.id === tripCode);
        if (foundLocal) return foundLocal;

        if (window.db) {
            try {
                const doc = await window.db.collection('master_trips').doc(tripCode).get();
                if (doc.exists) return doc.data();
            } catch (err) {
                console.warn("Lookup Master Trip from Firestore warning:", err);
            }
        }

        return fallbackMap[tripCode] || {
            trip: tripCode,
            rute: "JAKARTA - " + tripCode,
            tlc: tripCode,
            layanan: "ADD",
            wilayah: "JAWA",
            targetSLAOutboundHours: 16,
            targetSLAReturnHours: 16,
            targetSLARoundtripHours: 32,
            status: "ACTIVE"
        };
    },

    subscribeMasterTrips(callback) {
        return this.createSub('master_trips', callback);
    },

    async saveMasterTrip(tripData) {
        return this.saveDoc('master_trips', tripData.code, { ...tripData, id: tripData.code, status: tripData.status || 'ACTIVE' }, true);
    },

    async deleteMasterTrip(tripCode) {
        const incomingCheck = (this.getLocalStore('incoming') || []).some(i => i.trip === tripCode);
        if (incomingCheck) {
            return this.saveDoc('master_trips', tripCode, { status: 'INACTIVE' }, true);
        }
        return this.deleteDoc('master_trips', tripCode);
    },

    subscribeMasterFleets(callback) {
        return this.createSub('master_fleets', callback);
    },

    async saveMasterFleet(fleetData) {
        const docId = fleetData.platNomor.replace(/\s+/g, '');
        return this.saveDoc('master_fleets', docId, { ...fleetData, id: docId }, true);
    },

    async deleteMasterFleet(platNomor) {
        const docId = platNomor.replace(/\s+/g, '');
        return this.deleteDoc('master_fleets', docId);
    },

    subscribeMasterDrivers(callback) {
        return this.createSub('master_drivers', callback);
    },

    async saveMasterDriver(driverData) {
        const docId = driverData.nama.toLowerCase().replace(/\s+/g, '_');
        return this.saveDoc('master_drivers', docId, { ...driverData, id: docId }, true);
    },

    async deleteMasterDriver(nama) {
        const docId = nama.toLowerCase().replace(/\s+/g, '_');
        return this.deleteDoc('master_drivers', docId);
    },

    subscribeMasterReasons(callback) {
        return this.createSub('master_reasons', callback);
    },

    async saveMasterReason(reasonData) {
        return this.saveDoc('master_reasons', reasonData.id, reasonData, true);
    },

    // ----------------------------------------------------
    // 3. INCOMING TRIPS (SINGLE SOURCE OF TRUTH)
    // ----------------------------------------------------
    async checkDuplicateKodeTugas(kodeTugas) {
        if (!kodeTugas) return false;
        const targetClean = kodeTugas.trim().toLowerCase();
        let items = this.getLocalStore('incoming') || [];
        if (window.db) {
            try {
                const snap = await window.db.collection('incoming').get();
                snap.forEach(d => items.push({ id: d.id, ...d.data() }));
            } catch (err) {
                console.warn("checkDuplicateKodeTugas Firestore query notice:", err.message);
            }
        }
        return items.some(d =>
            (d.id && String(d.id).toLowerCase() === targetClean) ||
            (d.kodeTugas && String(d.kodeTugas).toLowerCase() === targetClean)
        );
    },

    subscribeIncoming(callback) {
        return this.createSub('incoming', callback);
    },

    async addIncomingTrip(tripData) {
        const isDuplicate = await this.checkDuplicateKodeTugas(tripData.kodeTugas);
        if (isDuplicate) {
            throw new Error(`⚠️ Kode Tugas "${tripData.kodeTugas}" sudah terdaftar di sistem! Silakan gunakan Kode Tugas unik.`);
        }

        const masterInfo = await this.lookupTripMaster(tripData.trip || tripData.tlc);
        const shiftId = this.getActiveShiftId();

        const fullTripData = {
            ...tripData,
            namaRute: tripData.namaRute || masterInfo.rute,
            tlc: tripData.tlc || masterInfo.tlc,
            tripType: tripData.tripType || masterInfo.layanan,
            wilayah: masterInfo.wilayah,
            targetSLAOutboundHours: masterInfo.targetSLAOutboundHours,
            targetSLAReturnHours: masterInfo.targetSLAReturnHours,
            targetSLARoundtripHours: masterInfo.targetSLARoundtripHours,
            shiftId: shiftId,
            createdAt: new Date().toISOString()
        };

        await this.saveDoc('incoming', tripData.kodeTugas, fullTripData, true);

        // Outbound SLA
        await this.saveDoc('sla_outbound', tripData.kodeTugas, {
            kodeTugas: tripData.kodeTugas,
            trip: fullTripData.trip,
            namaRute: fullTripData.namaRute,
            platNomor: fullTripData.platNomor,
            jamBerangkat: fullTripData.jamBerangkat,
            jamSampaiAktual: "",
            durasiBerangkatMinutes: 0,
            targetSLAHours: masterInfo.targetSLAOutboundHours,
            lateMinutes: 0,
            statusSla: "BERJALAN",
            alasan: "",
            inputBy: tripData.inputBy || "Hamdan",
            shiftId: shiftId
        }, true);

        // Roundtrip SLA
        await this.saveDoc('sla_roundtrip', tripData.kodeTugas, {
            kodeTugas: tripData.kodeTugas,
            trip: fullTripData.trip,
            wilayah: masterInfo.wilayah,
            targetSLAPP: masterInfo.targetSLARoundtripHours,
            totalDurasiPPMinutes: 0,
            totalLatePPMinutes: 0,
            statusRoundtrip: "WAITING_RETURN",
            keterangan: "Menunggu data perjalanan balikan dari Gateway"
        }, true);

        // Monitoring 4H Record
        const todayStr = new Date().toISOString().split('T')[0];
        const departureSlotKey = this.getSlotForTime(fullTripData.jamBerangkat);
        const initialSlots = {
            "00:00": null,
            "04:00": null,
            "08:00": null,
            "12:00": null,
            "16:00": null,
            "20:00": null
        };
        initialSlots[departureSlotKey] = {
            lokasi: "OUT JAKARTA",
            keterangan: "Keberangkatan Awal",
            jenisUpdate: "Lokasi Normal",
            jamUpdateAktual: fullTripData.jamBerangkat,
            inputBy: fullTripData.inputBy,
            shiftId: shiftId,
            statusUpdate: "SUDAH UPDATE"
        };

        await this.saveDoc('monitoring_4h', tripData.kodeTugas, {
            kodeTugas: tripData.kodeTugas,
            tanggalMonitoring: todayStr,
            trip: fullTripData.trip,
            namaRute: fullTripData.namaRute,
            platNomor: fullTripData.platNomor,
            driver1: fullTripData.driver1,
            slots: initialSlots,
            lastUpdateSlot: departureSlotKey,
            lastUpdateLokasi: "OUT JAKARTA",
            lastUpdateTime: fullTripData.jamBerangkat,
            lastUpdateBy: fullTripData.inputBy,
            statusPerjalanan: "ON PROGRESS"
        }, true);

        // Log Audit Event
        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: tripData.inputBy || "Hamdan",
            shiftId: shiftId,
            modul: "Incoming SSOT",
            kodeTugas: tripData.kodeTugas,
            aktivitas: `Input Transaksi Incoming Trip Baru (${fullTripData.trip} - ${fullTripData.platNomor})`
        });

        return fullTripData;
    },

    async updateIncomingTrip(kodeTugas, updateObj) {
        return this.saveDoc('incoming', kodeTugas, updateObj, true);
    },

    // ----------------------------------------------------
    // 4. SLA MONITORING 3-TAB ENGINE
    // ----------------------------------------------------
    subscribeSLAOutbound(callback) {
        return this.createSub('sla_outbound', callback);
    },

    async saveSLAOutbound(kodeTugas, updateObj) {
        const shiftId = this.getActiveShiftId();
        await this.saveDoc('sla_outbound', kodeTugas, { ...updateObj, shiftId: shiftId }, true);
        await this.recalculateSLARoundtrip(kodeTugas);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: updateObj.inputBy || "Hamdan",
            shiftId: shiftId,
            modul: "SLA Vendor",
            kodeTugas: kodeTugas,
            aktivitas: `Update Jam Sampai Gateway (${updateObj.jamSampaiAktual || '-'}) Status: ${updateObj.statusSla}`
        });
    },

    async deleteSLAOutbound(kodeTugas) {
        if (!kodeTugas) throw new Error('kodeTugas tidak boleh kosong');
        const shiftId = this.getActiveShiftId();
        // Cascade delete dari semua 5 collection trip
        await this.deleteTripCascade(kodeTugas, true);
        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || 'Operator',
            shiftId: shiftId,
            modul: 'SLA Vendor',
            kodeTugas: kodeTugas,
            aktivitas: `Hapus Data Keberangkatan & SLA (Cascade Delete)`
        });
    },

    subscribeSLAReturn(callback) {
        return this.createSub('sla_return', callback);
    },

    async saveSLAReturn(kodeTugas, returnObj) {
        const shiftId = this.getActiveShiftId();
        await this.saveDoc('sla_return', kodeTugas, { ...returnObj, shiftId: shiftId }, true);
        await this.recalculateSLARoundtrip(kodeTugas);
    },

    subscribeSLARoundtrip(callback) {
        return this.createSub('sla_roundtrip', callback);
    },

    async recalculateSLARoundtrip(kodeTugas) {
        console.log(`[SLA UPDATE] RECALCULATING ROUNDTRIP for ${kodeTugas}`);
        try {
            const incData = await this.getDoc('incoming', kodeTugas) || {};
            const outData = await this.getDoc('sla_outbound', kodeTugas) || {};
            const retData = await this.getDoc('sla_return', kodeTugas) || {};

            const targetSLAPP = incData.targetSLARoundtripHours || 32;

            if (!retData || !retData.jamSampaiJKT999) {
                await this.saveDoc('sla_roundtrip', kodeTugas, {
                    kodeTugas: kodeTugas,
                    trip: incData.trip || "-",
                    wilayah: incData.wilayah || "JAWA",
                    targetSLAPP: targetSLAPP,
                    durasiBerangkatMinutes: outData.durasiBerangkatMinutes || 0,
                    durasiBalikanMinutes: 0,
                    totalDurasiPPMinutes: outData.durasiBerangkatMinutes || 0,
                    totalLatePPMinutes: 0,
                    statusRoundtrip: "WAITING_RETURN",
                    keterangan: "⏳ Menunggu data perjalanan balikan dari Gateway"
                }, true);
                console.log(`[SLA UPDATE] RECALCULATE ROUNDTRIP WAITING for ${kodeTugas}`);
                return;
            }

            const durasiBerangkatMin = outData.durasiBerangkatMinutes || 0;
            const durasiBalikanMin = retData.durasiBalikanMinutes || 0;
            const totalPPMinutes = durasiBerangkatMin + durasiBalikanMin;

            const targetSLAPPMinutes = targetSLAPP * 60;
            const totalLatePPMinutes = Math.max(0, totalPPMinutes - targetSLAPPMinutes);

            const statusRoundtrip = totalLatePPMinutes > 0 ? "LATE PP" : "ON TIME";
            const keteranganPP = totalLatePPMinutes > 0 ?
                `Terlambat ${Math.floor(totalLatePPMinutes / 60)} jam ${totalLatePPMinutes % 60} menit` :
                "Tiba Tepat Waktu PP";

            await this.saveDoc('sla_roundtrip', kodeTugas, {
                kodeTugas: kodeTugas,
                trip: incData.trip || "-",
                wilayah: incData.wilayah || "JAWA",
                targetSLAPP: targetSLAPP,
                durasiBerangkatMinutes: durasiBerangkatMin,
                durasiBalikanMinutes: durasiBalikanMin,
                totalDurasiPPMinutes: totalPPMinutes,
                totalLatePPMinutes: totalLatePPMinutes,
                statusRoundtrip: statusRoundtrip,
                keterangan: keteranganPP
            }, true);

            console.log(`[SLA UPDATE] RECALCULATE ROUNDTRIP SUCCESS for ${kodeTugas}`);
        } catch (err) {
            console.error("Error recalculating SLA Roundtrip:", err);
        }
    },

    // ----------------------------------------------------
    // 5. MONITORING 4 JAM (DATE-AWARE, AUDIT LOGS, & SHIFT TRACKING)
    // ----------------------------------------------------
    determineActiveSlot(dateObj = new Date()) {
        const hour = dateObj.getHours();
        if (hour >= 0 && hour < 4) return "00:00";
        if (hour >= 4 && hour < 8) return "04:00";
        if (hour >= 8 && hour < 12) return "08:00";
        if (hour >= 12 && hour < 16) return "12:00";
        if (hour >= 16 && hour < 20) return "16:00";
        return "20:00";
    },

    getSlotTimeWindowLabel(slotKey) {
        const windows = {
            "00:00": "00:00 - 03:59 WIB",
            "04:00": "04:00 - 07:59 WIB",
            "08:00": "08:00 - 11:59 WIB",
            "12:00": "12:00 - 15:59 WIB",
            "16:00": "16:00 - 19:59 WIB",
            "20:00": "20:00 - 23:59 WIB"
        };
        return windows[slotKey] || "08:00 - 11:59 WIB";
    },

    subscribeActiveIncomingForMonitoring(callback) {
        if (!window.db) return () => { };
        return window.db.collection('incoming').onSnapshot(snap => {
            const activeList = [];
            snap.forEach(d => {
                const item = { id: d.id, ...d.data() };
                if (item.status !== 'SUDAH SELESAI') {
                    activeList.push(item);
                }
            });
            callback(activeList);
        });
    },

    subscribeMonitoring4H(callback) {
        return this.createSub('monitoring_4h', callback);
    },

    async saveMonitoringSlotUpdate(kodeTugas, slotKey, lokasi, keterangan = "", jenisUpdate = "Lokasi Normal", jamUpdateAktual = "", inputBy = "Hamdan", statusPerjalanan = "ON PROGRESS") {
        const shiftId = this.getActiveShiftId();
        let existing = {};
        const localList = this.getLocalStore('monitoring_4h');
        const foundLocal = localList.find(i => (i.id === kodeTugas || i.kodeTugas === kodeTugas));
        if (foundLocal) existing = foundLocal;

        if (window.db) {
            try {
                const docSnap = await window.db.collection('monitoring_4h').doc(kodeTugas).get();
                if (docSnap.exists) existing = { ...existing, ...docSnap.data() };
            } catch (e) {
                console.warn("saveMonitoringSlotUpdate get notice:", e.message);
            }
        }
        if (!existing.slots) existing.slots = {};

        const oldSlotData = existing.slots[slotKey];
        const newSlotData = {
            lokasi: lokasi,
            keterangan: keterangan,
            jenisUpdate: jenisUpdate,
            jamUpdateAktual: jamUpdateAktual || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            inputBy: inputBy,
            shiftId: shiftId,
            statusUpdate: "SUDAH UPDATE"
        };

        // Audit Trail Log if Overwriting an existing slot
        if (oldSlotData && oldSlotData.lokasi && oldSlotData.lokasi !== lokasi) {
            await this.logAuditEvent({
                waktu: newSlotData.jamUpdateAktual,
                operator: inputBy,
                shiftId: shiftId,
                modul: "Monitoring 4H",
                kodeTugas: kodeTugas,
                aktivitas: `Revisi Posisi Slot ${slotKey} (${oldSlotData.lokasi} ➔ ${lokasi})`
            });
        } else {
            await this.logAuditEvent({
                waktu: newSlotData.jamUpdateAktual,
                operator: inputBy,
                shiftId: shiftId,
                modul: "Monitoring 4H",
                kodeTugas: kodeTugas,
                aktivitas: `Check-in Posisi Slot ${slotKey} (${lokasi})`
            });
        }

        existing.slots[slotKey] = newSlotData;

        const updateObj = {
            ...existing,
            kodeTugas: kodeTugas,
            slots: existing.slots,
            lastUpdateSlot: slotKey,
            lastUpdateLokasi: lokasi,
            lastUpdateTime: newSlotData.jamUpdateAktual,
            lastUpdateBy: inputBy,
            statusPerjalanan: statusPerjalanan
        };

        const result = await this.saveDoc('monitoring_4h', kodeTugas, updateObj, true);

        // Auto-sync status to Incoming & SLA Outbound
        if (statusPerjalanan === 'COMPLETED' || statusPerjalanan === 'SUDAH SELESAI') {
            await this.saveDoc('incoming', kodeTugas, { status: 'SUDAH SELESAI' }, true);
            await this.saveDoc('sla_outbound', kodeTugas, { jamSampaiAktual: newSlotData.jamUpdateAktual, statusSla: 'ON TIME' }, true);
        } else if (jenisUpdate === 'Trouble' || jenisUpdate === 'Laka' || statusPerjalanan === 'KENDALA') {
            await this.saveDoc('incoming', kodeTugas, { status: 'KENDALA' }, true);
            await this.saveDoc('sla_outbound', kodeTugas, { statusSla: 'KENDALA' }, true);
        }

        return result;
    },

    // ----------------------------------------------------
    // 6. INCIDENT MANAGEMENT (TROUBLE & LAKA)
    // ----------------------------------------------------
    subscribeTroubles(callback) {
        return this.createSub('troubles', callback);
    },

    async addTroubleIncident(incidentData) {
        const shiftId = this.getActiveShiftId();

        // Prevent duplicate open incident for the same vehicle/kodeTugas
        if (incidentData.kodeTugas && incidentData.kodeTugas !== "-") {
            const existingIncidents = this.getLocalStore('troubles') || [];
            const hasOpen = existingIncidents.some(i => 
                i.kodeTugas === incidentData.kodeTugas && 
                i.status !== 'SUDAH SELESAI' && 
                i.status !== 'RESOLVED' && 
                i.status !== 'SELESAI'
            );
            if (hasOpen) {
                throw new Error(`⚠️ Kendala/Incident untuk Kode Tugas "${incidentData.kodeTugas}" masih berstatus aktif! Harap selesaikan atau perbarui kejadian yang sudah ada.`);
            }
        }

        // Auto-fill master details if available from Incoming SSOT
        let incMaster = {};
        if (incidentData.kodeTugas) {
            incMaster = await this.getDoc('incoming', incidentData.kodeTugas) || {};
        }

        const fullIncident = {
            incidentId: incidentData.incidentId || `INC-${Date.now()}`,
            id: incidentData.incidentId || `INC-${Date.now()}`,
            kodeTugas: incidentData.kodeTugas || "-",
            jenis: incidentData.jenis || "Trouble Armada",
            kategoriTrouble: incidentData.kategoriTrouble || "Kendala Operasional",
            severity: incidentData.severity || "MEDIUM",
            lokasiKejadian: incidentData.lokasiKejadian || "Rest Area / Jalur Rute",
            waktuKejadian: incidentData.waktuKejadian || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            platNomor: incidentData.platNomor || incMaster.platNomor || "-",
            driver: incidentData.driver || incMaster.driver1 || "-",
            vendor: incidentData.vendor || incMaster.vendor || "J&T Logistics",
            rute: incidentData.rute || incMaster.trip || incMaster.namaRute || "-",
            deskripsi: incidentData.deskripsi || "Kejadian terdeteksi pada operasional.",
            dilaporkanOleh: incidentData.dilaporkanOleh || sessionStorage.getItem('jnt_active_username') || "Hamdan",
            status: incidentData.status || "DALAM PENANGANAN",
            shiftId: shiftId,
            createdAt: new Date().toISOString(),
            history: [
                {
                    time: incidentData.waktuKejadian || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                    note: `Laporan incident ${incidentData.jenis || 'Trouble'} dikirim oleh ${incidentData.dilaporkanOleh || sessionStorage.getItem('jnt_active_username') || 'Operator'}`,
                    status: incidentData.status || "OPEN",
                    user: incidentData.dilaporkanOleh || sessionStorage.getItem('jnt_active_username') || "Operator"
                }
            ]
        };

        await this.saveDoc('troubles', fullIncident.incidentId, fullIncident, true);

        // Update status armada di Incoming, Monitoring 4H & SLA Outbound menjadi KENDALA jika insiden aktif
        if (incidentData.kodeTugas && fullIncident.status !== 'SUDAH SELESAI') {
            await this.updateTripStatus(incidentData.kodeTugas, 'KENDALA', { inputBy: fullIncident.dilaporkanOleh });
        }

        await this.logAuditEvent({
            waktu: fullIncident.waktuKejadian,
            operator: fullIncident.dilaporkanOleh,
            shiftId: shiftId,
            modul: "Trouble & Laka",
            kodeTugas: fullIncident.kodeTugas,
            aktivitas: `Melaporkan Incident ${fullIncident.jenis} (${fullIncident.kategoriTrouble} - Severity ${fullIncident.severity})`
        });

        return fullIncident;
    },

    async updateIncidentStatus(incidentId, newStatus, note = "", user = "Hamdan", restoreTripStatus = true) {
        const data = await this.getDoc('troubles', incidentId);
        if (!data) {
            console.warn(`[TROUBLE] Incident with ID ${incidentId} not found.`);
            return null;
        }

        const history = Array.isArray(data.history) ? [...data.history] : [];
        const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        history.push({
            time: nowStr,
            note: note || `Status diperbarui menjadi ${newStatus}`,
            status: newStatus,
            user: user
        });

        const updatedData = {
            ...data,
            status: newStatus,
            history: history,
            updatedAt: new Date().toISOString()
        };

        await this.saveDoc('troubles', incidentId, updatedData, true);

        // If completed/closed, restore monitoring and SLA trip status ONLY if trip exists and restoreTripStatus is true
        if (restoreTripStatus && newStatus === 'SUDAH SELESAI' && data.kodeTugas && data.kodeTugas !== "-") {
            const incDoc = await this.getDoc('incoming', data.kodeTugas);
            if (incDoc && !incDoc._pendingDelete) {
                const slaDoc = await this.getDoc('sla_outbound', data.kodeTugas);
                const isCompletedTrip = incDoc.status === 'SUDAH SELESAI' || incDoc.status === 'COMPLETED';

                if (!isCompletedTrip) {
                    await this.saveDoc('monitoring_4h', data.kodeTugas, { statusPerjalanan: "ON PROGRESS" }, true);
                    await this.saveDoc('incoming', data.kodeTugas, { status: "SEDANG DIPROSES" }, true);
                    await this.saveDoc('sla_outbound', data.kodeTugas, { statusSla: "BERJALAN" }, true);
                } else {
                    await this.saveDoc('monitoring_4h', data.kodeTugas, { statusPerjalanan: "COMPLETED" }, true);
                    await this.saveDoc('incoming', data.kodeTugas, { status: "SUDAH SELESAI" }, true);
                    await this.saveDoc('sla_outbound', data.kodeTugas, { statusSla: slaDoc && slaDoc.lateMinutes > 0 ? "LATE" : "ON TIME" }, true);
                }
            }
        }

        await this.logAuditEvent({
            waktu: nowStr,
            operator: user,
            shiftId: this.getActiveShiftId(),
            modul: "Trouble & Laka",
            kodeTugas: data.kodeTugas || "-",
            aktivitas: `Update Status Incident ${incidentId} (${data.jenis || 'Incident'}) menjadi ${newStatus}`
        });

        return updatedData;
    },

    // ----------------------------------------------------
    // 7. SHIFT MANAGEMENT & AUDIT LOGS ENGINE
    // ----------------------------------------------------
    subscribeShifts(callback) {
        return this.createSub('shifts', (list) => {
            const sorted = [...list];
            sorted.sort((a, b) => (b.createdAt || b.shiftId || b.id || '').localeCompare(a.createdAt || a.shiftId || a.id || ''));
            callback(sorted);
        });
    },

    async saveActiveShift(shiftData) {
        const docId = shiftData.shiftId || shiftData.id;
        if (!docId) return;
        return this.saveDoc('shifts', docId, shiftData, true);
    },

    async startNewShift(shiftData) {
        const shifts = this.getLocalStore('shifts');
        
        if (!shiftData.operator1 || !shiftData.operator1.nama) {
            throw new Error("Operator 1 wajib diisi!");
        }
        if (!shiftData.operator2 || !shiftData.operator2.nama) {
            throw new Error("Operator 2 wajib diisi!");
        }
        if (shiftData.operator1.nama.trim().toLowerCase() === shiftData.operator2.nama.trim().toLowerCase()) {
            throw new Error("Operator 1 dan Operator 2 tidak boleh sama!");
        }

        // Deactivate existing active shifts
        for (const s of shifts) {
            if (s.status === 'AKTIF') {
                await this.saveDoc('shifts', s.shiftId || s.id, { status: 'COMPLETED', endedAt: new Date().toISOString() }, true);
            }
        }

        const dateStr = shiftData.tanggal ? shiftData.tanggal.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayShifts = shifts.filter(s => (s.shiftId || s.id || '').includes(dateStr));
        const nextSeq = String(todayShifts.length + 1).padStart(2, '0');
        const newShiftId = shiftData.shiftId || `SHIFT-${dateStr}-${nextSeq}`;

        const newShiftObj = {
            id: newShiftId,
            shiftId: newShiftId,
            tanggal: shiftData.tanggal || new Date().toISOString().slice(0, 10),
            namaShift: shiftData.namaShift || `Shift (${shiftData.jamMulai || '08:00'} - ${shiftData.jamSelesai || '20:00'})`,
            jamMulai: shiftData.jamMulai || "08:00",
            jamSelesai: shiftData.jamSelesai || "20:00",
            status: "AKTIF",
            operator1: {
                nama: shiftData.operator1.nama,
                role: shiftData.operator1.role || "Operator Utama",
                tugas: shiftData.operator1.tugas || "Monitoring 4H & Incident"
            },
            operator2: {
                nama: shiftData.operator2.nama,
                role: shiftData.operator2.role || "Operator Pendamping",
                tugas: shiftData.operator2.tugas || "SLA Vendor"
            },
            createdAt: new Date().toISOString()
        };

        sessionStorage.setItem('jnt_active_shift_id', newShiftId);
        // FIREBASE-ONLY: Tidak menyimpan shift ID ke localStorage.

        await this.saveDoc('shifts', newShiftId, newShiftObj, true);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: shiftData.operator1.nama,
            shiftId: newShiftId,
            modul: "Shift Management",
            kodeTugas: "-",
            aktivitas: `Mulai Shift Baru (${newShiftId} - ${newShiftObj.operator1.nama} & ${newShiftObj.operator2.nama})`
        });

        return newShiftObj;
    },

    async switchShift(shiftId, newOp1, newOp2, op1Tugas, op2Tugas, reason = "Pergantian Shift Operasional") {
        const shifts = this.getLocalStore('shifts');
        const currentShift = shifts.find(s => (s.shiftId === shiftId || s.id === shiftId));

        if (currentShift) {
            await this.saveDoc('shifts', shiftId, { status: 'COMPLETED', endedAt: new Date().toISOString() }, true);
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const nextShift = await this.startNewShift({
            tanggal: todayStr,
            jamMulai: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            jamSelesai: "20:00",
            operator1: { nama: newOp1, role: "Operator Utama", tugas: op1Tugas || "Monitoring 4H & Incident" },
            operator2: { nama: newOp2, role: "Operator Pendamping", tugas: op2Tugas || "SLA Vendor" }
        });

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: newOp1,
            shiftId: nextShift.shiftId,
            modul: "Shift Management",
            kodeTugas: "-",
            aktivitas: `Pergantian Shift Operasional (${reason}): ${newOp1} & ${newOp2}`
        });

        return nextShift;
    },

    async endActiveShift(shiftId) {
        const id = shiftId || this.getActiveShiftId();
        const updated = await this.saveDoc('shifts', id, {
            status: 'COMPLETED',
            endedAt: new Date().toISOString()
        }, true);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "System",
            shiftId: id,
            modul: "Shift Management",
            kodeTugas: "-",
            aktivitas: `Shift Operasional (${id}) Telah Diakhiri (Status: COMPLETED)`
        });

        return updated;
    },

    calculateShiftMetrics(shiftId) {
        const targetShiftId = shiftId || this.getActiveShiftId();
        const logs = this.getLocalStore('audit_logs') || [];
        const monList = this.getLocalStore('monitoring_4h') || [];
        const slaList = this.getLocalStore('sla_outbound') || [];
        const troubleList = this.getLocalStore('troubles') || [];
        const shiftList = this.getLocalStore('shifts') || [];

        const currentShift = shiftList.find(s => s.shiftId === targetShiftId || s.id === targetShiftId);
        const op1Nama = currentShift && currentShift.operator1 ? currentShift.operator1.nama.toLowerCase() : '';
        const op2Nama = currentShift && currentShift.operator2 ? currentShift.operator2.nama.toLowerCase() : '';

        const shiftLogs = logs.filter(l => l.shiftId === targetShiftId);

        let monCheckins = 0;
        let slaUpdates = 0;
        let incidents = 0;

        let op1Actions = 0;
        let op2Actions = 0;

        shiftLogs.forEach(l => {
            const opName = (l.operator || '').toLowerCase();
            if (op1Nama && opName.includes(op1Nama)) op1Actions++;
            else if (op2Nama && opName.includes(op2Nama)) op2Actions++;

            if (l.modul === 'Monitoring 4H') monCheckins++;
            else if (l.modul === 'SLA Vendor') slaUpdates++;
            else if (l.modul === 'Trouble & Laka') incidents++;
        });

        const monShiftCount = monList.filter(m => m.shiftId === targetShiftId || (m.slots && Object.values(m.slots).some(s => s && s.shiftId === targetShiftId))).length;
        const slaShiftCount = slaList.filter(s => s.shiftId === targetShiftId).length;
        const troubleShiftCount = troubleList.filter(t => t.shiftId === targetShiftId).length;

        const totalMon = Math.max(monCheckins, monShiftCount);
        const totalSla = Math.max(slaUpdates, slaShiftCount);
        const totalTrouble = Math.max(incidents, troubleShiftCount);

        return {
            shiftId: targetShiftId,
            totalTransactions: totalMon + totalSla + totalTrouble,
            monCheckins: totalMon,
            slaUpdates: totalSla,
            incidents: totalTrouble,
            op1Actions: op1Actions || Math.ceil((totalMon + totalSla + totalTrouble) / 2),
            op2Actions: op2Actions || Math.floor((totalMon + totalSla + totalTrouble) / 2),
            shiftLogs: shiftLogs
        };
    },

    subscribeAuditLogs(callback) {
        return this.createSub('audit_logs', (list) => {
            const sorted = [...list];
            sorted.sort((a, b) => (b.waktu || '').localeCompare(a.waktu || ''));
            callback(sorted);
        });
    },

    async logAuditEvent(auditObj) {
        console.log('[AUDIT] START', auditObj);
        const entry = {
            id: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            waktu: auditObj.waktu || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: auditObj.operator || "System",
            shiftId: auditObj.shiftId || this.getActiveShiftId(),
            modul: auditObj.modul || "General",
            kodeTugas: auditObj.kodeTugas || "-",
            aktivitas: auditObj.aktivitas || ""
        };

        // 1. Fallback Local Storage first
        try {
            const localList = this.getLocalStore('audit_logs');
            localList.unshift(entry);
            this.saveLocalStore('audit_logs', localList);
            console.log('[AUDIT] FALLBACK SUCCESS');
            window.dispatchEvent(new CustomEvent('jnt_data_updated', { detail: { colName: 'audit_logs', docId: entry.id, data: entry } }));
        } catch (e) {
            console.warn('[AUDIT] LOCAL STORAGE FAILED:', e.message);
        }

        // 2. Try Firestore Cloud write safely without throwing errors
        if (window.db) {
            try {
                await window.db.collection('audit_logs').add({
                    waktu: entry.waktu,
                    operator: entry.operator,
                    shiftId: entry.shiftId,
                    modul: entry.modul,
                    kodeTugas: entry.kodeTugas,
                    aktivitas: entry.aktivitas
                });
                console.log('[AUDIT] FIRESTORE SUCCESS');
            } catch (err) {
                console.warn('[AUDIT] FIRESTORE FAILED - FALLBACK LOCAL:', err.message);
            }
        }

        return entry;
    },

    // ----------------------------------------------------
    // 8. USERS CRUD & FIREBASE AUTHENTICATION IDENTITY ENGINE
    // ----------------------------------------------------
    subscribeUsers(callback) {
        return this.createSub('users', callback);
    },

    normalizeRole(roleStr) {
        if (!roleStr) return 'OPERATOR_SLA';
        const r = String(roleStr).toUpperCase().trim();
        if (r === 'ADMIN' || r === 'ADMINISTRATOR') return 'ADMIN';
        if (r === 'SUPERVISOR' || r === 'SPV') return 'SUPERVISOR';
        if (r.includes('MONITORING')) return 'OPERATOR_MONITORING';
        if (r.includes('SLA') || r.includes('OPERATOR')) return 'OPERATOR_SLA';
        return 'OPERATOR_SLA';
    },

    async resolveEmailFromIdentifier(identifier) {
        if (!identifier) return '';
        const idTrim = String(identifier).trim();
        if (idTrim.includes('@')) return idTrim.toLowerCase();

        const uname = idTrim.toLowerCase();
        const localUsers = this.getLocalStore('users') || [];
        const found = localUsers.find(u => (u.username || '').toLowerCase() === uname);
        if (found && found.email) return found.email.toLowerCase();

        if (window.db) {
            try {
                const docSnap = await window.db.collection('users').doc(uname).get();
                if (docSnap.exists && docSnap.data().email) {
                    return docSnap.data().email.toLowerCase();
                }
                const qSnap = await window.db.collection('users').where('username', '==', uname).limit(1).get();
                if (!qSnap.empty && qSnap.docs[0].data().email) {
                    return qSnap.docs[0].data().email.toLowerCase();
                }
            } catch (e) { }
        }

        return `${uname}@jtexpress.co.id`;
    },

    async getUserProfileByUid(uid) {
        if (!uid) return null;
        let profile = null;
        if (window.db) {
            try {
                const snap = await window.db.collection('users').doc(uid).get();
                if (snap.exists) profile = snap.data();
            } catch (e) { }
        }
        if (!profile) {
            const localUsers = this.getLocalStore('users') || [];
            profile = localUsers.find(u => u.uid === uid || u.id === uid);
        }
        return profile;
    },

    async getUserProfileByUsername(username) {
        if (!username) return null;
        const uname = username.toLowerCase().trim();
        const localUsers = this.getLocalStore('users') || [];
        let profile = localUsers.find(u => (u.username || '').toLowerCase() === uname || (u.id || '').toLowerCase() === uname);

        if (!profile && window.db) {
            try {
                const docSnap = await window.db.collection('users').doc(uname).get();
                if (docSnap.exists) {
                    profile = docSnap.data();
                } else {
                    const qSnap = await window.db.collection('users').where('username', '==', uname).limit(1).get();
                    if (!qSnap.empty) profile = qSnap.docs[0].data();
                }
            } catch (e) { }
        }
        return profile;
    },

    async loginWithFirebaseAuth(identifier, password) {
        if (!identifier || !password) {
            throw new Error("Username/Email dan Password wajib diisi!");
        }
        if (!window.auth) {
            throw new Error("Firebase Auth SDK belum diinisialisasi.");
        }

        const email = await this.resolveEmailFromIdentifier(identifier);

        try {
            const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;

            let profile = await this.getUserProfileByUid(user.uid);

            if (!profile) {
                const uname = identifier.includes('@') ? identifier.split('@')[0].toLowerCase() : identifier.toLowerCase();
                const legacyProfile = await this.getUserProfileByUsername(uname);

                if (legacyProfile) {
                    profile = {
                        ...legacyProfile,
                        uid: user.uid,
                        id: user.uid,
                        email: user.email || legacyProfile.email || email,
                        migratedToFirebaseAuth: true,
                        migratedAt: new Date().toISOString()
                    };
                    await this.saveDoc('users', user.uid, profile, true);
                    console.log(`[AUTH] Migrated legacy profile to UID: ${user.uid}`);
                } else {
                    profile = {
                        uid: user.uid,
                        id: user.uid,
                        username: uname,
                        fullname: user.displayName || uname,
                        email: user.email || email,
                        role: 'OPERATOR_SLA',
                        status: 'Aktif',
                        createdAt: new Date().toISOString()
                    };
                    await this.saveDoc('users', user.uid, profile, true);
                }
            }

            if ((profile.status || 'Aktif').toLowerCase() === 'nonaktif' || (profile.status || '').toLowerCase() === 'inactive') {
                await window.auth.signOut();
                throw new Error("Akun Anda berstatus Nonaktif. Silakan hubungi Administrator.");
            }

            profile.role = this.normalizeRole(profile.role);

            await this.logAuditEvent({
                waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: profile.fullname || profile.username,
                shiftId: this.getActiveShiftId(),
                modul: "Autentikasi",
                kodeTugas: "-",
                aktivitas: `User Login Berhasil via Firebase Auth (${profile.username} - ${profile.role})`
            });

            return { user, profile };
        } catch (err) {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                const uname = identifier.includes('@') ? identifier.split('@')[0].toLowerCase() : identifier.toLowerCase();
                const legacy = await this.getUserProfileByUsername(uname);
                if (legacy) {
                    const activationErr = new Error(`Akun "${uname}" terdaftar pada sistem lama, namun belum diaktifkan di Firebase Authentication.`);
                    activationErr.code = 'LEGACY_ACCOUNT_NEEDS_ACTIVATION';
                    activationErr.legacyUser = legacy;
                    activationErr.email = email;
                    throw activationErr;
                }
            }
            throw err;
        }
    },

    async createUserAccount(profileData, password) {
        if (!window.auth) throw new Error("Firebase Auth SDK belum aktif.");
        if (!profileData.email) throw new Error("Email wajib diisi!");
        if (!profileData.username) throw new Error("Username wajib diisi!");
        if (!password || password.length < 6) throw new Error("Password minimal 6 karakter.");

        const cred = await window.auth.createUserWithEmailAndPassword(profileData.email, password);
        const uid = cred.user.uid;

        const newProfile = {
            uid: uid,
            id: uid,
            username: profileData.username.toLowerCase().trim(),
            fullname: profileData.fullname || profileData.username,
            email: profileData.email.toLowerCase().trim(),
            phone: profileData.phone || '',
            role: this.normalizeRole(profileData.role),
            tlc: profileData.tlc || 'Head Office',
            status: profileData.status || 'Aktif',
            createdAt: new Date().toISOString()
        };

        await this.saveDoc('users', uid, newProfile, true);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "Admin",
            shiftId: this.getActiveShiftId(),
            modul: "User Management",
            kodeTugas: "-",
            aktivitas: `Pendaftaran User Baru via Firebase Auth: ${newProfile.username} (${newProfile.role})`
        });

        return newProfile;
    },

    async activateLegacyUser(usernameOrEmail, password) {
        if (!window.auth) throw new Error("Firebase Auth SDK belum aktif.");
        if (!password || password.length < 6) throw new Error("Password minimal 6 karakter.");

        const email = await this.resolveEmailFromIdentifier(usernameOrEmail);
        const uname = usernameOrEmail.includes('@') ? usernameOrEmail.split('@')[0].toLowerCase() : usernameOrEmail.toLowerCase();

        const legacy = await this.getUserProfileByUsername(uname);
        if (!legacy) {
            throw new Error(`Data profil lama untuk "${usernameOrEmail}" tidak ditemukan.`);
        }

        const cred = await window.auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;

        const migratedProfile = {
            ...legacy,
            uid: uid,
            id: uid,
            username: legacy.username || uname,
            email: email,
            role: this.normalizeRole(legacy.role),
            status: legacy.status || 'Aktif',
            migratedToFirebaseAuth: true,
            migratedAt: new Date().toISOString()
        };

        await this.saveDoc('users', uid, migratedProfile, true);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: migratedProfile.fullname || uname,
            shiftId: this.getActiveShiftId(),
            modul: "Autentikasi",
            kodeTugas: "-",
            aktivitas: `Aktivasi Migrasi Akun Lama ke Firebase Auth: ${uname}`
        });

        return { user: cred.user, profile: migratedProfile };
    },

    async sendPasswordReset(identifier) {
        if (!window.auth) throw new Error("Firebase Auth SDK belum aktif.");
        const email = await this.resolveEmailFromIdentifier(identifier);
        await window.auth.sendPasswordResetEmail(email);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "System",
            shiftId: this.getActiveShiftId(),
            modul: "User Management",
            kodeTugas: "-",
            aktivitas: `Kirim Tautan Reset Password Firebase Auth ke ${email}`
        });
        return email;
    },

    async logoutFirebaseAuth() {
        if (window.auth) {
            try {
                await window.auth.signOut();
            } catch (e) {
                console.warn("[AUTH LOGOUT]", e.message);
            }
        }
        sessionStorage.clear();
        if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
            localStorage.removeItem('jnt_auth_user');
        }
        console.log("[AUTH LOGOUT] Firebase Auth & Session cleared.");
    },

    async saveUserProfile(username, profileData) {
        if (!username) throw new Error("Username wajib diisi!");
        const shiftId = this.getActiveShiftId();
        const docId = profileData.uid || username.toLowerCase().trim();
        const existing = await this.getDoc('users', docId) || await this.getUserProfileByUsername(username) || {};
        const updated = await this.saveDoc('users', docId, {
            ...existing,
            ...profileData,
            id: docId,
            username: profileData.username || existing.username || username,
            role: this.normalizeRole(profileData.role || existing.role),
            updatedAt: new Date().toISOString()
        }, true);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "Admin",
            shiftId: shiftId,
            modul: "User Management",
            kodeTugas: "-",
            aktivitas: `Simpan/Update Profil User: ${username} (Role: ${updated.role})`
        });

        return updated;
    },

    async deleteUser(username) {
        if (!username) return;
        const shiftId = this.getActiveShiftId();
        const docId = username.toLowerCase().trim();
        await this.deleteDoc('users', docId);

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "Admin",
            shiftId: shiftId,
            modul: "User Management",
            kodeTugas: "-",
            aktivitas: `Hapus User: ${username}`
        });

        return true;
    },

    // ----------------------------------------------------
    // 9. DATABASE BACKUP & ADMIN RESTORE ENGINE
    // ----------------------------------------------------
    async exportDatabaseSnapshot() {
        const collections = ['incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h', 'troubles', 'shifts', 'master_trips', 'master_fleets', 'master_vendors', 'master_drivers', 'master_reasons', 'users', 'audit_logs'];
        const backupData = {
            exportDate: new Date().toISOString(),
            version: "5.0.0",
            schemaVersion: "5.0.0",
            system: "J&T Express Transportation Monitoring System v5",
            collections: {}
        };

        for (const colName of collections) {
            let list = [];
            if (window.db) {
                try {
                    const snap = await window.db.collection(colName).get();
                    snap.forEach(doc => list.push({ _docId: doc.id, ...doc.data() }));
                } catch (e) {
                    console.warn(`Export Firestore warning for ${colName}:`, e.message);
                }
            }
            if (list.length === 0) {
                list = this.getLocalStore(colName).map(item => ({ _docId: item.id || item.kodeTugas || item.shiftId || item.incidentId, ...item }));
            }
            backupData.collections[colName] = list;
        }

        return backupData;
    },

    async restoreDatabaseFromJSON(jsonObj) {
        if (!jsonObj || typeof jsonObj !== 'object') {
            throw new Error("File backup tidak valid (harus objek JSON)!");
        }
        if (!jsonObj.schemaVersion && !jsonObj.version) {
            throw new Error("Skema backup tidak valid: atribut version / schemaVersion tidak ditemukan!");
        }
        if (!jsonObj.collections || typeof jsonObj.collections !== 'object') {
            throw new Error("Skema backup tidak valid: atribut collections tidak ditemukan!");
        }

        const validCollections = ['incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h', 'troubles', 'shifts', 'master_trips', 'master_fleets', 'master_vendors', 'master_drivers', 'master_reasons', 'users', 'audit_logs'];
        
        let restoredCount = 0;
        for (const colName of Object.keys(jsonObj.collections)) {
            if (!validCollections.includes(colName)) continue;
            const docsList = jsonObj.collections[colName];
            if (!Array.isArray(docsList)) continue;

            const localItems = [];
            for (const item of docsList) {
                const docId = item._docId || item.id || item.kodeTugas || item.shiftId || item.incidentId;
                const cleanItem = { ...item };
                delete cleanItem._docId;
                if (docId) {
                    cleanItem.id = docId;
                    localItems.push(cleanItem);
                    if (window.db) {
                        try {
                            await window.db.collection(colName).doc(docId).set(cleanItem, { merge: true });
                        } catch (e) {
                            console.warn(`Restore Firestore warning for ${colName}/${docId}:`, e.message);
                        }
                    }
                    restoredCount++;
                }
            }
            this.saveLocalStore(colName, localItems);
        }

        this.notifyDataMutated({ action: 'restore', colName: 'all' });

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "Admin",
            shiftId: this.getActiveShiftId(),
            modul: "Backup & Restore",
            kodeTugas: "-",
            aktivitas: `Restore Database Berhasil (${restoredCount} dokumen dipulihkan)`
        });

        return { success: true, restoredCount };
    },

    // ----------------------------------------------------
    // 9B. CONTROLLED LOCALSTORAGE -> FIRESTORE MIGRATION ENGINE
    // ----------------------------------------------------
    async getLocalStorageMigrationPreview() {
        const collections = ['incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h', 'troubles', 'shifts', 'master_trips', 'master_fleets', 'master_vendors', 'master_drivers', 'master_reasons', 'users', 'audit_logs'];
        const preview = {
            totalLocalRecords: 0,
            collections: {},
            pendingSyncCount: this.getPendingSyncQueue().length,
            cloudConnected: !!window.db
        };

        for (const col of collections) {
            const localItems = this.getLocalStore(col) || [];
            preview.totalLocalRecords += localItems.length;
            preview.collections[col] = {
                localCount: localItems.length,
                pendingCount: localItems.filter(i => i.syncStatus === 'PENDING' || i._syncStatus === 'PENDING').length
            };
        }
        return preview;
    },

    async executeLocalStorageToFirestoreMigration(options = { dryRun: false }) {
        if (!window.db) {
            throw new Error("Koneksi Firestore Cloud belum terinisialisasi. Pastikan koneksi internet dan API key valid.");
        }

        const collections = ['master_trips', 'master_fleets', 'master_vendors', 'master_drivers', 'master_reasons', 'users', 'shifts', 'incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h', 'troubles', 'audit_logs'];
        const report = {
            startedAt: new Date().toISOString(),
            migratedTotal: 0,
            failedTotal: 0,
            details: {}
        };

        for (const colName of collections) {
            const localList = this.getLocalStore(colName) || [];
            let colSuccess = 0;
            let colFailed = 0;

            for (const item of localList) {
                const docId = item.id || item.kodeTugas || item.incidentId || item.shiftId || item.code;
                if (!docId) continue;

                if (!options.dryRun) {
                    try {
                        const cleanItem = { ...item };
                        cleanItem.syncStatus = 'SYNCED';
                        cleanItem.syncedToCloud = true;
                        cleanItem._syncStatus = 'SYNCED';
                        cleanItem._migratedAt = new Date().toISOString();
                        delete cleanItem.syncError;

                        await window.db.collection(colName).doc(docId).set(cleanItem, { merge: true });
                        colSuccess++;
                    } catch (err) {
                        colFailed++;
                        console.warn(`[MIGRATION ERROR] ${colName}/${docId}: ${err.message}`);
                    }
                } else {
                    colSuccess++;
                }
            }

            report.migratedTotal += colSuccess;
            report.failedTotal += colFailed;
            report.details[colName] = { success: colSuccess, failed: colFailed, total: localList.length };
        }

        report.completedAt = new Date().toISOString();
        if (!options.dryRun) {
            await this.logAuditEvent({
                waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: sessionStorage.getItem('jnt_active_username') || "Admin",
                shiftId: this.getActiveShiftId(),
                modul: "Database Migration",
                kodeTugas: "-",
                aktivitas: `Migrasi LocalStorage ke Firestore Selesai (${report.migratedTotal} berhasil, ${report.failedTotal} gagal)`
            });
        }
        return report;
    },

    // ----------------------------------------------------
    // 10. REAL-TIME NOTIFICATION CENTER ENGINE
    // ----------------------------------------------------
    subscribeNotifications(callback) {
        return this.createSub('troubles', (troubleList) => {
            const alerts = [];
            (troubleList || []).forEach(item => {
                if (item.status !== 'SUDAH SELESAI' && (item.severity === 'CRITICAL' || item.severity === 'HIGH' || item.jenis === 'Laka')) {
                    alerts.push({
                        id: item.incidentId || item.id,
                        type: "CRITICAL_INCIDENT",
                        title: `🚨 INCIDENT ${(item.jenis || 'Trouble').toUpperCase()} (${item.severity || 'HIGH'})`,
                        message: `${item.platNomor || '-'} - ${item.kategoriTrouble || item.deskripsi || '-'} di ${item.lokasiKejadian || '-'}`,
                        link: `trouble.html?kodeTugas=${item.kodeTugas || ''}`
                    });
                }
            });

            // SLA Outbound warnings
            const slaList = this.getLocalStore('sla_outbound') || [];
            slaList.forEach(s => {
                if (s.statusSla === 'BERJALAN' && s.targetSLAHours) {
                    alerts.push({
                        id: `SLA-ALERT-${s.kodeTugas}`,
                        type: "SLA_ALERT",
                        title: "⏰ SLA PERJALANAN AKTIF",
                        message: `${s.kodeTugas} (${s.trip || s.namaRute || '-'}) target ${s.targetSLAHours} Jam`,
                        link: "sla-vendor.html"
                    });
                }
            });

            callback(alerts);
        });
    }
};

// Explicit Global Attachment to Window Object
window.JNTFirebaseService = JNTFirebaseService;

// Network State & Auto-Retry Listeners
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
        console.log('🌐 [NETWORK ONLINE] Connection restored. Retrying pending sync queue...');
        JNTFirebaseService.retrySyncPending();
        window.dispatchEvent(new CustomEvent('jnt_network_status_changed', { detail: { isOnline: true } }));
    });
    window.addEventListener('offline', () => {
        console.warn('⚠️ [NETWORK OFFLINE] Working in offline draft mode.');
        window.dispatchEvent(new CustomEvent('jnt_network_status_changed', { detail: { isOnline: false } }));
    });
}

// Initialize seeding when DOM is loaded
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            JNTFirebaseService.seedInitialDataIfEmpty();
            JNTFirebaseService.retrySyncPending();
        }, 500);
    });
}

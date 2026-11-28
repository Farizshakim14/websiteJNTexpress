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
        // 1. Trigger local browser window event
        window.dispatchEvent(new CustomEvent('jnt_data_updated', { detail }));

        // 2. Broadcast cross-tab jika multi-tab terbuka
        if (jntSyncChannel) {
            try {
                jntSyncChannel.postMessage({ type: 'JNT_DATA_MUTATION', detail, timestamp: Date.now() });
            } catch (e) { }
        }

        // 3. Paksa refresh data subscriber seketika di memori lokal tanpa menunggu network roundtrip
        if (detail && detail.colName && this.forceRefreshSub) {
            try {
                this.forceRefreshSub(detail.colName);
            } catch (e) { }
        }
    },

    // ⚡ DUAL CACHE LAYER: Memory Cache + LocalStorage Persistence Fallback
    // Memastikan saat halaman direfresh atau berpindah menu, data tidak blank (0ms render),
    // lalu otomatis tersinkronisasi dengan Firestore secara real-time.
    _stripPhotosForLocalStorage(value, keyName = '') {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.startsWith('data:image/') || keyName === 'fotoSampai' || keyName === 'fotoBukti') {
                return '';
            }
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(item => this._stripPhotosForLocalStorage(item));
        }
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            const clone = {};
            for (const [k, v] of Object.entries(value)) {
                if (k === 'fotoSampai' || k === 'fotoBukti') {
                    if (typeof v === 'string' && v.trim()) {
                        clone.hasFotoSampai = true;
                    }
                    clone[k] = '';
                } else if (typeof v === 'string' && v.trim().startsWith('data:image/')) {
                    clone[k] = '';
                    if (k === 'foto') clone.hasFoto = true;
                } else {
                    clone[k] = this._stripPhotosForLocalStorage(v, k);
                }
            }
            return clone;
        }
        return value;
    },

    _purgeLegacyPhotosFromLocalStorage() {
        if (this._didPurgeLocalPhotos || typeof localStorage === 'undefined') return;
        this._didPurgeLocalPhotos = true;
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('jnt_cache_') || k.startsWith('jnt_store_'))) keys.push(k);
            }
            for (const k of keys) {
                const raw = localStorage.getItem(k);
                if (!raw) continue;
                if (raw.includes('data:image/') || raw.includes('"fotoSampai"')) {
                    try {
                        const parsed = JSON.parse(raw);
                        const cleaned = this._stripPhotosForLocalStorage(parsed);
                        localStorage.setItem(k, JSON.stringify(cleaned));
                    } catch (_) {
                        if (raw.includes('data:image/')) localStorage.removeItem(k);
                    }
                }
            }
        } catch (_) { }
    },

    _buildReturnMonitoringDoc({ ret, origin = {}, retKey, asalKey = '', vendor, tripName, jamBerangkat, jamSampai, isFinished }) {
        return {
            id: retKey,
            kodeTugas: retKey,
            kodeTugasBalikan: retKey,
            kodeTugasAsal: asalKey,
            tripType: 'RETURN',
            isBalikan: true,
            vendor: vendor,
            platNomor: ret.platNomor || origin.platNomor || '-',
            driver1: ret.driver1 || origin.driver1 || '-',
            driver2: ret.driver2 || origin.driver2 || '',
            driverPhone: ret.driverPhone || origin.driverPhone || '',
            driver2Phone: ret.driver2Phone || origin.driver2Phone || '',
            totalAwb: ret.totalAwb || '',
            trip: tripName,
            namaRute: tripName,
            tlc: ret.tlc || origin.tlc || 'JKT999 FUSO',
            jenisMobil: ret.jenisMobil || origin.jenisMobil || 'FUSO',
            jamBerangkat: jamBerangkat,
            jamBerangkatGateway: jamBerangkat,
            jamSampaiAktual: jamSampai,
            jamSampaiJKT999: jamSampai,
            targetSLAHours: ret.targetSLABalikanHours || ret.targetSLAHours || origin.targetSLAReturnHours || 16,
            targetSLABalikanHours: ret.targetSLABalikanHours || 16,
            statusPerjalanan: isFinished ? 'COMPLETED' : (ret.statusPerjalanan || 'ON PROGRESS'),
            alasan: ret.alasan || '',
            lokasiSampai: ret.lokasiSampai || '',
            catatanSampai: ret.catatanSampai || ret.catatan || '',
            catatan: ret.catatan || ret.catatanSampai || '',
            fotoSampai: ret.fotoSampai || '',
            hasFotoSampai: Boolean(ret.hasFotoSampai || ret.fotoSampai),
            durasiBalikanMinutes: ret.durasiBalikanMinutes ?? null,
            totalTelatMinutes: ret.totalTelatMinutes ?? null,
            inputBy: ret.inputBy || '',
            slots: {}
        };
    },

    getLocalStore(colName) {
        this._purgeLegacyPhotosFromLocalStorage();
        this._cachedSubData = this._cachedSubData || {};
        let baseList = [];
        if (this._cachedSubData[colName] && this._cachedSubData[colName].length > 0) {
            baseList = this._cachedSubData[colName];
        } else {
            try {
                if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem('jnt_cache_' + colName);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            this._cachedSubData[colName] = parsed;
                            baseList = parsed;
                        }
                    }
                }
            } catch (_) { }
        }
        // STRICT FIRESTORE SSOT: Jangan menggabungkan kembali cache arsip lama (_mergeWithHostingArchive) ke dalam getLocalStore
        // agar dokumen yang sudah dihapus dari Cloud Firestore tidak pernah hidup kembali dari cache arsip.
        const isTripCol = ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'].includes(colName);
        if (isTripCol && Array.isArray(baseList) && baseList.length > 0) {
            const deletedSet = this._getDeletedTripIdsSet();
            if (deletedSet && deletedSet.size > 0) {
                baseList = baseList.filter(doc => {
                    if (!doc) return false;
                    const k = String(doc.kodeTugas || doc.kodeTugasBalikan || doc.id || doc._docId || '').trim();
                    const asal = String(doc.kodeTugasAsal || '').trim();
                    return !deletedSet.has(k) && (!asal || !deletedSet.has(asal));
                });
            }
        }
        return this.filterListByActiveVendorScope(colName, baseList);
    },

    // ----------------------------------------------------
    // 🏢 VENDOR DATA ISOLATION & ANTI-PRIVILEGE-ESCALATION ENGINE
    // Memastikan role dan identitas vendor selalu mengacu pada profil
    // terverifikasi dari Firebase Auth / Firestore (_verifiedAuthProfile)
    // dan tidak dapat dimanipulasi melalui DevTools Console (sessionStorage/localStorage).
    // ----------------------------------------------------
    _verifiedAuthProfile: null,

    setVerifiedAuthProfile(profile) {
        if (!profile || typeof profile !== 'object') {
            this._verifiedAuthProfile = null;
            return;
        }
        const normRole = this.normalizeRole ? this.normalizeRole(profile.role) : String(profile.role || 'STAFF_VEHICLE_DISPATCH').toUpperCase();
        const rawVendor = profile.vendorName || profile.vendorShort || profile.vendor || '';
        const normVendorName = (normRole === 'VENDOR' && rawVendor)
            ? (this.normalizeVendorName ? this.normalizeVendorName(rawVendor) : rawVendor)
            : '';
        const normVendorShort = (normRole === 'VENDOR' && normVendorName)
            ? (this.formatVendorShort ? this.formatVendorShort(normVendorName) : rawVendor.toUpperCase())
            : '';

        this._verifiedAuthProfile = Object.freeze({
            uid: String(profile.uid || profile.id || '').trim(),
            username: String(profile.username || '').toLowerCase().trim(),
            fullname: String(profile.fullname || profile.username || '').trim(),
            role: normRole,
            vendorName: normVendorName,
            vendorShort: normVendorShort,
            status: String(profile.status || 'Aktif').trim()
        });

        // Pulihkan sessionStorage jika sempat diubah dari console
        this.enforceVerifiedSessionIntegrity();

        // Jika role yang terverifikasi adalah VENDOR, muat ulang listener onSnapshot
        // agar menggunakan query terfilter .where('vendor', '==', ...) yang selaras dengan Firestore Security Rules
        if (normRole === 'VENDOR' && typeof this.refreshVendorScopedListeners === 'function') {
            this.refreshVendorScopedListeners();
        }
    },

    enforceVerifiedSessionIntegrity() {
        if (!this._verifiedAuthProfile || typeof sessionStorage === 'undefined') return this._verifiedAuthProfile;
        const v = this._verifiedAuthProfile;
        if (sessionStorage.getItem('jnt_user_role') !== v.role) {
            console.warn(`[SECURITY] Manipulasi role terdeteksi di sessionStorage! Mengembalikan ke role resmi: ${v.role}`);
            try { sessionStorage.setItem('jnt_user_role', v.role); } catch (_) { }
        }
        if (v.role === 'VENDOR') {
            const currentVendor = sessionStorage.getItem('jnt_user_vendor') || '';
            const currentShort = this.formatVendorShort ? this.formatVendorShort(currentVendor) : currentVendor;
            if (currentShort.toUpperCase() !== v.vendorShort.toUpperCase()) {
                console.warn(`[SECURITY] Manipulasi identitas vendor terdeteksi di sessionStorage! Mengembalikan ke vendor resmi: ${v.vendorName}`);
                try { sessionStorage.setItem('jnt_user_vendor', v.vendorName); } catch (_) { }
            }
        }
        return v;
    },

    getVerifiedRole() {
        if (this._verifiedAuthProfile && this._verifiedAuthProfile.role) {
            this.enforceVerifiedSessionIntegrity();
            return this._verifiedAuthProfile.role;
        }
        const rawRole = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('jnt_user_role') : '') || '';
        return this.normalizeRole ? this.normalizeRole(rawRole) : String(rawRole).toUpperCase();
    },

    assertWritePermission(colName, action = 'write', payload = null, existingDoc = null) {
        const role = this.getVerifiedRole();
        const isMasterCol = String(colName || '').startsWith('master_');
        const isOperationalCol = ['incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h', 'troubles', 'shifts'].includes(colName);

        // 1. FINANCE: Strictly Read-Only across all operational, master, and user collections
        if (role === 'FINANCE' && (isOperationalCol || isMasterCol || colName === 'users')) {
            throw new Error(`Akses Ditolak (RBAC): Role FINANCE hanya memiliki akses Baca & Export (Read-Only), tidak diizinkan melakukan ${action} pada [${colName}].`);
        }

        // Hierarchical User Management Guard (selaras dengan firestore.rules isTargetRoleManageable)
        if (colName === 'users') {
            const targetRoleRaw = (payload && payload.role) || (existingDoc && existingDoc.role) || '';
            const targetRole = targetRoleRaw ? this.normalizeRole(targetRoleRaw) : '';
            const actorUid = (this._verifiedAuthProfile && this._verifiedAuthProfile.uid) || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('jnt_user_uid') : '') || '';
            const actorUname = (this._verifiedAuthProfile && this._verifiedAuthProfile.username) || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('jnt_username_login') : '') || '';
            const targetUid = (payload && (payload.uid || payload.id)) || (existingDoc && (existingDoc.uid || existingDoc.id)) || '';
            const targetUname = String((payload && payload.username) || (existingDoc && existingDoc.username) || '').toLowerCase().trim();
            const isSelfProfileUpdate = action === 'write'
                && ((actorUid && targetUid && actorUid === targetUid) || (actorUname && targetUname && actorUname === targetUname));

            if (isSelfProfileUpdate) {
                if (existingDoc && existingDoc.role && targetRole && this.normalizeRole(existingDoc.role) !== targetRole) {
                    throw new Error(`Akses Ditolak (Anti-Escalation): Pengguna tidak diizinkan mengubah role akunnya sendiri (${existingDoc.role} ➔ ${targetRole}).`);
                }
                if (role === 'VENDOR' && existingDoc && payload && payload.vendorName && existingDoc.vendorName && payload.vendorName !== existingDoc.vendorName) {
                    throw new Error(`Akses Ditolak (Anti-Escalation): Pengguna VENDOR tidak diizinkan mengganti identitas perusahaan vendornya sendiri.`);
                }
                return true;
            }

            if (['STAFF_VEHICLE_DISPATCH', 'FINANCE', 'VENDOR'].includes(role)) {
                throw new Error(`Akses Ditolak (RBAC): Role ${role} tidak memiliki hak mengakses Manajemen User.`);
            }
            if ((role === 'OWNER' || role === 'ADMIN') && targetRole === 'DEVELOPER') {
                throw new Error(`Akses Ditolak (RBAC): Role ${role} tidak dapat membuat, memodifikasi, atau menghapus akun ber-role DEVELOPER.`);
            }
            if ((role === 'MANAGER' || role === 'ASISTEN_MANAGER') && targetRole && !['SUPERVISOR', 'STAFF_VEHICLE_DISPATCH', 'FINANCE', 'VENDOR'].includes(targetRole)) {
                throw new Error(`Akses Ditolak (RBAC): Role ${role} hanya dapat mengelola akun level SUPERVISOR, STAFF_VEHICLE_DISPATCH, FINANCE, atau VENDOR (tidak dapat mengelola ${targetRole}).`);
            }
            if (role === 'SUPERVISOR' && targetRole && !['STAFF_VEHICLE_DISPATCH', 'VENDOR'].includes(targetRole)) {
                throw new Error(`Akses Ditolak (RBAC): Role SUPERVISOR hanya dapat mengelola akun level STAFF_VEHICLE_DISPATCH atau VENDOR (tidak dapat mengelola ${targetRole}).`);
            }
        }

        // 2. STAFF_VEHICLE_DISPATCH: No delete on operational, no write on master data or users
        if (role === 'STAFF_VEHICLE_DISPATCH') {
            if (action === 'delete' && (isOperationalCol || isMasterCol || colName === 'users')) {
                throw new Error(`Akses Ditolak (RBAC): Role STAFF_VEHICLE_DISPATCH tidak memiliki hak menghapus data pada [${colName}].`);
            }
            if (isMasterCol || colName === 'users') {
                throw new Error(`Akses Ditolak (RBAC): Role STAFF_VEHICLE_DISPATCH tidak memiliki akses mengubah [${colName}].`);
            }
        }

        // 3. VENDOR: Strict ownership & collection restrictions
        if (role === 'VENDOR') {
            if (action === 'delete') {
                throw new Error(`Akses Ditolak (RBAC): Role VENDOR tidak diizinkan menghapus data operasional.`);
            }
            if (isMasterCol || colName === 'users' || colName === 'shifts' || colName === 'incoming' || colName === 'sla_outbound' || colName === 'sla_return' || colName === 'sla_roundtrip') {
                throw new Error(`Akses Ditolak (RBAC): Role VENDOR tidak diizinkan mengubah koleksi [${colName}].`);
            }
            const scope = this.getActiveVendorScope();
            if (!scope) {
                throw new Error(`Akses Ditolak (RBAC): Identitas vendor tidak terverifikasi.`);
            }
            if (colName === 'monitoring_4h' || colName === 'troubles') {
                const targetDoc = existingDoc || payload;
                if (targetDoc && !this.isItemMatchingVendorScope(targetDoc, scope)) {
                    throw new Error(`Akses Ditolak (Ownership): Role VENDOR (${scope.shortCode}) tidak diizinkan mengakses/mengubah data milik vendor lain.`);
                }
                if (payload && payload.vendor && !this.isItemMatchingVendorScope(payload, scope)) {
                    throw new Error(`Akses Ditolak (Ownership): Role VENDOR (${scope.shortCode}) tidak dapat membuat/mengubah data atas nama vendor lain (${payload.vendor}).`);
                }
            }
        }
        return true;
    },

    getActiveVendorScope() {
        const normRole = this.getVerifiedRole();
        if (normRole !== 'VENDOR') return null;

        // Prioritas 1: Gunakan identitas vendor yang sudah terverifikasi dari profil Firestore (_verifiedAuthProfile)
        if (this._verifiedAuthProfile && this._verifiedAuthProfile.role === 'VENDOR' && this._verifiedAuthProfile.vendorName) {
            return {
                raw: this._verifiedAuthProfile.vendorName,
                fullName: this._verifiedAuthProfile.vendorName,
                shortCode: this._verifiedAuthProfile.vendorShort.toUpperCase()
            };
        }

        if (typeof sessionStorage === 'undefined') return null;
        let rawVendor = sessionStorage.getItem('jnt_user_vendor') || '';
        const loginUname = (sessionStorage.getItem('jnt_username_login') || '').toLowerCase().trim();

        // Cek dari cache koleksi users terlebih dahulu agar tidak mudah dimanipulasi via sessionStorage
        const usersList = (this._cachedSubData && this._cachedSubData['users']) || [];
        const foundUser = usersList.find(u => u && String(u.username || u.id || '').toLowerCase().trim() === loginUname);
        if (foundUser && (foundUser.vendorName || foundUser.vendorShort || foundUser.vendor)) {
            rawVendor = foundUser.vendorName || foundUser.vendorShort || foundUser.vendor;
        }

        if (!rawVendor) {
            const fullName = (sessionStorage.getItem('jnt_active_username') || '').trim();
            const tlc = (sessionStorage.getItem('jnt_user_tlc') || '').trim();
            const combinedText = `${fullName} ${loginUname} ${tlc}`.toUpperCase();
            const knownCodes = ['SERYU', 'APL', 'KLS', 'JTS', 'CHIJUN', 'PAL', 'SOLUSI', 'REYA', 'SDE', 'MTI', 'LNP', 'FASTRANS', 'ANUGERAH', 'AB'];
            for (const code of knownCodes) {
                const regex = new RegExp(`(^|[^A-Z0-9])${code}([^A-Z0-9]|$)`, 'i');
                if (regex.test(combinedText) || (code.length >= 4 && combinedText.includes(code))) {
                    rawVendor = code;
                    break;
                }
            }
            if (rawVendor) {
                try { sessionStorage.setItem('jnt_user_vendor', rawVendor); } catch (_) { }
            }
        }

        if (!rawVendor) return null;
        const fullNameNorm = this.normalizeVendorName ? this.normalizeVendorName(rawVendor) : rawVendor;
        const shortCode = this.formatVendorShort ? this.formatVendorShort(fullNameNorm) : rawVendor.toUpperCase();
        return {
            raw: rawVendor,
            fullName: fullNameNorm,
            shortCode: shortCode.toUpperCase()
        };
    },

    isItemMatchingVendorScope(item, scope = null) {
        const activeScope = scope || this.getActiveVendorScope();
        if (!activeScope || !item) return true;

        const itemVendorFull = this.resolveTripVendor
            ? this.resolveTripVendor(item)
            : this.normalizeVendorName(item.vendor || item.namaVendor || '', item.platNomor || '');
        const itemShort = (this.formatVendorShort ? this.formatVendorShort(itemVendorFull) : itemVendorFull).toUpperCase();

        return itemShort === activeScope.shortCode ||
            String(itemVendorFull).toUpperCase() === String(activeScope.fullName).toUpperCase() ||
            String(item.vendor || '').toUpperCase().includes(activeScope.shortCode);
    },

    filterListByActiveVendorScope(colName, list) {
        if (!Array.isArray(list) || list.length === 0) return list || [];
        const scope = this.getActiveVendorScope();
        if (!scope) return list;

        const vendorScopedCols = new Set([
            'incoming',
            'sla_outbound',
            'monitoring_4h',
            'sla_return',
            'sla_roundtrip',
            'troubles',
            'master_fleets'
        ]);
        if (!vendorScopedCols.has(colName)) return list;

        if (colName === 'sla_roundtrip') {
            // Untuk roundtrip yang mungkin tidak menyimpan field vendor langsung, cek juga dari cache incoming/sla_outbound
            const incList = (this._cachedSubData && this._cachedSubData['incoming']) || [];
            const slaList = (this._cachedSubData && this._cachedSubData['sla_outbound']) || [];
            const allowedKode = new Set();
            incList.forEach(i => { if (this.isItemMatchingVendorScope(i, scope)) allowedKode.add(i.kodeTugas || i.id); });
            slaList.forEach(s => { if (this.isItemMatchingVendorScope(s, scope)) allowedKode.add(s.kodeTugas || s.id); });
            return list.filter(rt => rt && (rt.vendor ? this.isItemMatchingVendorScope(rt, scope) : allowedKode.has(rt.kodeTugas || rt.id)));
        }

        return list.filter(item => this.isItemMatchingVendorScope(item, scope));
    },

    saveLocalStore(colName, list) {
        this._cachedSubData = this._cachedSubData || {};
        const cleanList = Array.isArray(list) ? list : [];
        // Simpan data penuh (termasuk URL/data foto) HANYA di RAM memory agar UI reaktif tanpa membebani localStorage
        this._cachedSubData[colName] = cleanList;
        if (colName === 'master_fleets') this._fleetVendorMapCache = null;
        if (colName === 'master_drivers') this._driverPhoneMapCache = null;
        this._lsWriteTimers = this._lsWriteTimers || {};
        if (this._lsWriteTimers[colName]) clearTimeout(this._lsWriteTimers[colName]);
        this._lsWriteTimers[colName] = setTimeout(() => {
            try {
                if (typeof localStorage !== 'undefined') {
                    // Bersihkan seluruh foto / base64 sebelum menulis ke localStorage di idle frame
                    const storageSafeList = this._stripPhotosForLocalStorage(this._cachedSubData[colName] || cleanList);
                    localStorage.setItem('jnt_cache_' + colName, JSON.stringify(storageSafeList));
                }
            } catch (_) { }
        }, 180);
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
                waktu: this.formatStandardDateTime(),
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
                waktu: this.formatStandardDateTime(),
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
                waktu: this.formatStandardDateTime(),
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

    // Helper: Batas waktu tunggu konfirmasi Server Firestore (Server ACK Timeout)
    // Mencegah proses menggantung selamanya saat perangkat terhubung ke Wi-Fi tanpa internet (zombie connection)
    _withFirestoreTimeout(promise, opLabel = 'Operasi Firestore', timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error(`${opLabel} gagal: Server Cloud Firestore tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik. Periksa koneksi internet Anda dan coba lagi.`));
                }
            }, timeoutMs);

            promise.then(res => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(res);
                }
            }).catch(err => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(err);
                }
            });
        });
    },

    _sanitizeCloudPayload(data) {
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
        return cloudPayload;
    },

    /**
     * ⚡ ATOMIC WRITEBATCH ENGINE (Prioritas 2)
     * Menjalankan sekumpulan operasi set/delete lintas koleksi secara ATOMIK ke Cloud Firestore.
     * Menunggu konfirmasi Server ACK sebelum memperbarui cache lokal (RAM & localStorage).
     * @param {Array<{type: 'set'|'delete', colName: string, docId: string, data?: object, merge?: boolean}>} operations
     */
    async commitAtomicBatch(operations = [], timeoutMs = 20000) {
        if (!Array.isArray(operations) || operations.length === 0) return { committed: 0 };

        if (!navigator.onLine) {
            throw new Error('Tidak ada koneksi internet. Data tidak dapat disimpan ke Cloud Firestore. Hubungkan ke internet dan coba lagi.');
        }
        if (!window.db) {
            throw new Error('Database Cloud Firestore belum terhubung. Periksa koneksi internet Anda.');
        }

        const MAX_OPS_PER_BATCH = 450; // Batas resmi Firestore adalah 500 operasi per WriteBatch
        let totalCommitted = 0;

        for (const op of operations) {
            if (!op || !op.colName || !op.docId) continue;
            this.assertWritePermission(op.colName, op.type === 'delete' ? 'delete' : 'write', op.data || null);
        }

        for (let i = 0; i < operations.length; i += MAX_OPS_PER_BATCH) {
            const chunk = operations.slice(i, i + MAX_OPS_PER_BATCH);
            const batch = window.db.batch();

            chunk.forEach(op => {
                if (!op || !op.colName || !op.docId) return;
                const ref = window.db.collection(op.colName).doc(String(op.docId).trim());
                if (op.type === 'delete') {
                    batch.delete(ref);
                } else {
                    const cleanPayload = this._sanitizeCloudPayload(op.data || {});
                    batch.set(ref, cleanPayload, { merge: op.merge !== false });
                    op._cleanPayload = cleanPayload;
                }
            });

            // Tunggu konfirmasi ACK resmi dari server Cloud Firestore
            await this._withFirestoreTimeout(
                batch.commit(),
                `Batch Write Firestore (${chunk.length} dokumen)`,
                timeoutMs
            );

            // Hanya update cache lokal SETELAH server Firestore mengonfirmasi batch.commit() berhasil!
            const mutatedCols = new Map();
            chunk.forEach(op => {
                if (!op || !op.colName || !op.docId) return;
                const colName = op.colName;
                const docId = String(op.docId).trim();
                if (!mutatedCols.has(colName)) {
                    mutatedCols.set(colName, [...(this.getLocalStore(colName) || [])]);
                }
                const list = mutatedCols.get(colName);

                if (op.type === 'delete') {
                    const filtered = list.filter(item => (item.id !== docId && item.kodeTugas !== docId && item._docId !== docId));
                    mutatedCols.set(colName, filtered);
                } else {
                    const updatedObj = {
                        id: docId,
                        ...(op._cleanPayload || op.data || {}),
                        syncStatus: 'SYNCED',
                        syncedToCloud: true,
                        _syncStatus: 'SYNCED'
                    };
                    const idx = list.findIndex(item => (item.id === docId || item.kodeTugas === docId || item._docId === docId));
                    if (idx >= 0) {
                        list[idx] = (op.merge !== false) ? { ...list[idx], ...updatedObj } : updatedObj;
                    } else {
                        list.unshift(updatedObj);
                    }
                }
            });

            mutatedCols.forEach((updatedList, colName) => {
                this.saveLocalStore(colName, updatedList);
                this.notifyDataMutated({ colName, action: 'batch_commit', syncStatus: 'SYNCED' });
            });

            totalCommitted += chunk.length;
        }

        return { committed: totalCommitted };
    },

    async saveDoc(colName, docId, data, merge = false) {
        console.log(`[FIREBASE-ONLY] START WRITE [${colName}/${docId}]`, data);

        // Validasi RBAC & Ownership sebelum menulis ke Firestore
        const existingLocal = ((this._cachedSubData && this._cachedSubData[colName]) || []).find(i => (i.id === docId || i.kodeTugas === docId || i._docId === docId)) || null;
        this.assertWritePermission(colName, 'write', data, existingLocal);

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

        const cloudPayload = this._sanitizeCloudPayload(data);

        // Tulis langsung ke Firestore dan tunggu konfirmasi Server ACK (dengan proteksi timeout koneksi menggantung)
        await this._withFirestoreTimeout(
            window.db.collection(colName).doc(docId).set(cloudPayload, { merge: merge }),
            `Simpan Data [${colName}/${docId}]`,
            15000
        );
        console.log(`[FIREBASE] WRITE SUCCESS [${colName}/${docId}]`);

        const updatedObj = {
            id: docId,
            ...cloudPayload,
            syncStatus: 'SYNCED',
            syncedToCloud: true,
            _syncStatus: 'SYNCED'
        };

        // Update in-memory & persistent cache HANYA SETELAH server Firestore mengonfirmasi penyimpanan
        const currentList = this.getLocalStore(colName) || [];
        const idx = currentList.findIndex(i => (i.id === docId || i.kodeTugas === docId || i._docId === docId));
        if (idx >= 0) {
            if (merge) {
                const prevItem = currentList[idx] || {};
                const mergedSlots = (prevItem.slots || updatedObj.slots)
                    ? { ...(prevItem.slots || {}), ...(updatedObj.slots || {}) }
                    : undefined;
                currentList[idx] = {
                    ...prevItem,
                    ...updatedObj,
                    ...(mergedSlots ? { slots: mergedSlots } : {})
                };
            } else {
                currentList[idx] = updatedObj;
            }
        } else {
            currentList.unshift(updatedObj);
        }
        this.saveLocalStore(colName, currentList);

        this.notifyDataMutated({ colName, docId, action: 'save', data: updatedObj, syncStatus: 'SYNCED' });
        return updatedObj;
    },

    async deleteDoc(colName, docId) {
        console.log(`[FIREBASE] START DELETE [${colName}/${docId}]`);

        // Validasi RBAC sebelum menghapus dari Firestore
        this.assertWritePermission(colName, 'delete', null, null);

        if (!navigator.onLine) {
            const errMsg = 'Tidak ada koneksi internet. Data tidak dapat dihapus. Hubungkan ke internet dan coba lagi.';
            console.error(`[FIREBASE] DELETE REJECTED - Offline: [${colName}/${docId}]`);
            throw new Error(errMsg);
        }

        if (!window.db) {
            const errMsg = 'Database Firebase tidak terhubung. Periksa koneksi internet Anda.';
            console.error(`[FIREBASE] DELETE REJECTED - DB not initialized: [${colName}/${docId}]`);
            throw new Error(errMsg);
        }

        await this._withFirestoreTimeout(
            window.db.collection(colName).doc(docId).delete(),
            `Hapus Data [${colName}/${docId}]`,
            15000
        );
        console.log(`[FIREBASE] DELETE SUCCESS [${colName}/${docId}]`);

        // Hapus dari in-memory & persistent cache setelah server mengonfirmasi
        const currentList = this.getLocalStore(colName) || [];
        const filtered = currentList.filter(i => (i.id !== docId && i.kodeTugas !== docId && i._docId !== docId));
        this.saveLocalStore(colName, filtered);

        this.notifyDataMutated({ colName, docId, action: 'delete', confirmed: true });
        return { success: true, confirmed: true };
    },

    // ----------------------------------------------------
    // HELPER: SLOT TIME CALCULATION & NORMALIZATION
    // ----------------------------------------------------
    /** Urutan 42 slot monitoring (7 hari x 6 slot @4 jam) */
    getMonitoringSlotKeys() {
        return [
            '00:00', '04:00', '08:00', '12:00', '16:00', '20:00',
            'D2_00:00', 'D2_04:00', 'D2_08:00', 'D2_12:00', 'D2_16:00', 'D2_20:00',
            'D3_00:00', 'D3_04:00', 'D3_08:00', 'D3_12:00', 'D3_16:00', 'D3_20:00',
            'D4_00:00', 'D4_04:00', 'D4_08:00', 'D4_12:00', 'D4_16:00', 'D4_20:00',
            'D5_00:00', 'D5_04:00', 'D5_08:00', 'D5_12:00', 'D5_16:00', 'D5_20:00',
            'D6_00:00', 'D6_04:00', 'D6_08:00', 'D6_12:00', 'D6_16:00', 'D6_20:00',
            'D7_00:00', 'D7_04:00', 'D7_08:00', 'D7_12:00', 'D7_16:00', 'D7_20:00'
        ];
    },

    /**
     * Parser tanggal operasional standar yang mendukung:
     *  - "MM/DD/YYYY HH:mm" (format standar baru, misal: "10/29/2026 17:20")
     *  - "DD/MM/YYYY HH:mm" (format legacy, misal: "29/10/2026 17:20 WIB")
     *  - "DD/MM/YY, HH.mm"  (format toLocaleString id-ID)
     *  - ISO "YYYY-MM-DDTHH:mm" / "YYYY-MM-DD HH:mm"
     */
    parseStandardDate(value) {
        if (!value) return null;
        if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
        if (typeof value === 'number') {
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
        const s = String(value).trim();
        if (!s || /^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(s)) return null;

        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        }

        const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:[,\s]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/);
        if (m) {
            const p1 = parseInt(m[1], 10);
            const p2 = parseInt(m[2], 10);
            let y = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
            if (y < 100) y += 2000;
            const hh = m[4] !== undefined ? parseInt(m[4], 10) : 0;
            const mm = m[5] !== undefined ? parseInt(m[5], 10) : 0;
            const ss = m[6] !== undefined ? parseInt(m[6], 10) : 0;

            let monthIdx, day;
            if (p1 > 12) {
                day = p1;
                monthIdx = p2 - 1;
            } else if (p2 > 12) {
                monthIdx = p1 - 1;
                day = p2;
            } else {
                monthIdx = p1 - 1;
                day = p2;
            }

            const d = new Date(y, monthIdx, day, hh, mm, ss);
            return isNaN(d.getTime()) ? null : d;
        }

        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    },

    /**
     * Format waktu standar operasional J&T TMS: "MM/DD/YYYY HH:mm" (contoh: "10/29/2026 17:20")
     */
    formatStandardDateTime(input = new Date()) {
        if (input === null || input === undefined || input === '') return '';
        if (typeof input === 'string') {
            const trimmed = input.trim();
            if (!trimmed || /^(-|—|kosong|belum|nihil|null|undefined|n\/a)$/i.test(trimmed)) return trimmed === '-' ? '-' : '';
        }
        const d = this.parseStandardDate(input);
        if (!d) return typeof input === 'string' ? input.replace(/\s*WIB$/i, '').trim() : '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    parseMonitoringDate(value) {
        return this.parseStandardDate(value);
    },

    /** Ambil jam (0-23) dari string waktu apa pun; fallback ke parsing "HH:MM" sederhana */
    _extractHour(timeStr) {
        const d = this.parseMonitoringDate(timeStr);
        if (d) return d.getHours();
        let hour = 0;
        const str = String(timeStr || '').trim();
        const spaceParts = str.split(' ');
        const clockPart = spaceParts.length > 1 ? spaceParts[1] : spaceParts[0];
        if (clockPart && /[:.]/.test(clockPart)) {
            hour = parseInt(clockPart.split(/[:.]/)[0], 10);
        }
        return isNaN(hour) ? 0 : hour;
    },

    getSlotForTime(timeStr) {
        if (!timeStr) return "00:00";
        const hour = this._extractHour(timeStr);

        if (hour >= 0 && hour < 4) return "00:00";
        if (hour >= 4 && hour < 8) return "04:00";
        if (hour >= 8 && hour < 12) return "08:00";
        if (hour >= 12 && hour < 16) return "12:00";
        if (hour >= 16 && hour < 20) return "16:00";
        return "20:00";
    },

    getDepartureSlotIndex(jamBerangkatStr) {
        if (!jamBerangkatStr) return 0;
        const hour = this._extractHour(jamBerangkatStr);

        if (hour >= 4 && hour < 8) return 1;
        if (hour >= 8 && hour < 12) return 2;
        if (hour >= 12 && hour < 16) return 3;
        if (hour >= 16 && hour < 20) return 4;
        if (hour >= 20) return 5;
        return 0;
    },

    isOutJakartaSlot(sVal) {
        if (!sVal || typeof sVal !== 'object') return false;
        const loc = String(sVal.lokasi || '').toUpperCase().trim();
        const ket = String(sVal.keterangan || '').toUpperCase().trim();
        return loc === "OUT JKT999" || loc === "OUT JAKARTA" || loc === "OUT GATEWAY" ||
            loc.includes("OUT JKT") || loc.includes("OUT JAKARTA") || loc.includes("OUT GATEWAY") ||
            loc.startsWith("OUT ") ||
            ket === "KEBERANGKATAN AWAL" || ket === "KEBERANGKATAN BALIKAN";
    },

    /** Index slot tempat OUT JAKARTA tercatat (-1 jika tidak ada) */
    getOutJakartaSlotIndex(item) {
        const slots = (item && item.slots && typeof item.slots === 'object') ? item.slots : {};
        const keys = this.getMonitoringSlotKeys();
        for (let i = 0; i < keys.length; i++) {
            if (this.isOutJakartaSlot(slots[keys[i]])) return i;
        }
        return -1;
    },

    /**
     * Index slot paling awal yang BOLEH diisi update posisi 4 jam.
     * Aturan: update posisi harus SETELAH OUT JAKARTA (slot OUT JAKARTA & sebelumnya terkunci).
     */
    getMinCheckinSlotIndex(item) {
        const outIdx = this.getOutJakartaSlotIndex(item);
        if (outIdx >= 0) return outIdx + 1;
        return this.getDepartureSlotIndex(item && item.jamBerangkat);
    },

    /**
     * Hitung index slot (0-23) dari waktu check-in relatif terhadap tanggal berangkat.
     * Hari 1 = tanggal berangkat. Return null jika tanggal tidak terbaca, -1 jika sebelum hari berangkat.
     */
    getCheckinSlotIndexByTime(jamBerangkatStr, checkinTime) {
        const dep = this.parseMonitoringDate(jamBerangkatStr);
        const t = this.parseMonitoringDate(checkinTime);
        if (!dep || !t) return null;
        const d0 = new Date(dep.getFullYear(), dep.getMonth(), dep.getDate());
        const d1 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        const dayDiff = Math.round((d1 - d0) / 86400000);
        if (dayDiff < 0) return -1;
        return dayDiff * 6 + Math.floor(t.getHours() / 4);
    },

    normalizeMonitoringSlots(item) {
        if (!item || !item.slots) return item;
        const slots = { ...item.slots };
        let modified = false;

        const slotKeys = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];
        for (const sKey of slotKeys) {
            const sVal = slots[sKey];
            if (sVal && sVal.jamUpdateAktual && (sVal.lokasi === "OUT JKT999" || sVal.lokasi === "OUT JAKARTA" || sVal.keterangan === "Keberangkatan Awal" || String(sVal.lokasi || '').toUpperCase().includes('OUT JKT'))) {
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

        // Pindahkan update posisi yang (salah) tercatat SEBELUM OUT JAKARTA ke slot setelahnya.
        // Armada tidak mungkin sudah di tol sebelum OUT JAKARTA.
        const keys24 = this.getMonitoringSlotKeys();
        const outIdx = keys24.findIndex(k => this.isOutJakartaSlot(slots[k]));
        if (outIdx > 0) {
            const depStr = (slots[keys24[outIdx]] && slots[keys24[outIdx]].jamUpdateAktual) || item.jamBerangkat;
            const isFilled = (k) => !!(slots[k] && typeof slots[k] === 'object' && slots[k].lokasi);
            for (let i = 0; i < outIdx; i++) {
                const origKey = keys24[i];
                const v = slots[origKey];
                if (!(v && typeof v === 'object' && v.lokasi)) continue;

                let start = this.getCheckinSlotIndexByTime(depStr, v.jamUpdateAktual);
                if (start === null || start <= outIdx) start = outIdx + 1;
                let target = -1;
                for (let j = start; j < keys24.length; j++) {
                    if (!isFilled(keys24[j])) { target = j; break; }
                }
                if (target === -1) {
                    for (let j = outIdx + 1; j < Math.min(start, keys24.length); j++) {
                        if (!isFilled(keys24[j])) { target = j; break; }
                    }
                }
                if (target >= 0) {
                    slots[keys24[target]] = v;
                    slots[origKey] = null;
                    modified = true;
                }
            }
        }

        return modified ? { ...item, slots } : item;
    },

    // ----------------------------------------------------
    // GLOBAL CASCADE DELETION ENGINE (v5) + TOMBSTONE ANTI-RESURRECTION
    // ----------------------------------------------------
    _deletedTripIds: null,

    _getDeletedTripIdsSet() {
        if (!this._deletedTripIds) {
            this._deletedTripIds = new Set();
            try {
                if (typeof localStorage !== 'undefined') {
                    const raw = localStorage.getItem('jnt_deleted_trip_ids');
                    if (raw) {
                        const arr = JSON.parse(raw);
                        if (Array.isArray(arr)) {
                            arr.forEach(id => { if (id) this._deletedTripIds.add(String(id).trim()); });
                        }
                    }
                }
            } catch (_) { }
        }
        return this._deletedTripIds;
    },

    _markTripAsDeleted(kodeTugas, kodeBalikan = '') {
        if (!kodeTugas) return;
        const set = this._getDeletedTripIdsSet();
        const k = String(kodeTugas).trim();
        set.add(k);
        set.add(`${k}-RET`);
        if (kodeBalikan) set.add(String(kodeBalikan).trim());
        try {
            if (typeof localStorage !== 'undefined') {
                const arr = Array.from(set).slice(-3000);
                localStorage.setItem('jnt_deleted_trip_ids', JSON.stringify(arr));
            }
        } catch (_) { }
    },

    _unmarkTripAsDeleted(kodeTugas) {
        if (!kodeTugas) return;
        const set = this._getDeletedTripIdsSet();
        const k = String(kodeTugas).trim();
        if (set.has(k) || set.has(`${k}-RET`)) {
            set.delete(k);
            set.delete(`${k}-RET`);
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('jnt_deleted_trip_ids', JSON.stringify(Array.from(set)));
                }
            } catch (_) { }
        }
    },

    isTripDeleted(kodeTugas) {
        if (!kodeTugas) return false;
        return this._getDeletedTripIdsSet().has(String(kodeTugas).trim());
    },

    _purgeTripFromAllLocalCachesImmediate(kodeTugas, kodeBalikan = '') {
        if (!kodeTugas) return;
        const targets = new Set([String(kodeTugas).trim(), `${String(kodeTugas).trim()}-RET`]);
        if (kodeBalikan) targets.add(String(kodeBalikan).trim());

        const tripCols = ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'];
        this._cachedSubData = this._cachedSubData || {};
        this._lsWriteTimers = this._lsWriteTimers || {};
        this._hostArchTimers = this._hostArchTimers || {};

        tripCols.forEach(col => {
            if (this._lsWriteTimers[col]) {
                clearTimeout(this._lsWriteTimers[col]);
                delete this._lsWriteTimers[col];
            }
            if (this._hostArchTimers[col]) {
                clearTimeout(this._hostArchTimers[col]);
                delete this._hostArchTimers[col];
            }

            // 1. Bersihkan dari _cachedSubData
            if (Array.isArray(this._cachedSubData[col])) {
                this._cachedSubData[col] = this._cachedSubData[col].filter(i => {
                    if (!i) return false;
                    const id = String(i.kodeTugas || i.kodeTugasBalikan || i.id || i._docId || '').trim();
                    const asal = String(i.kodeTugasAsal || '').trim();
                    return !targets.has(id) && !targets.has(asal);
                });
            }

            // 2. Bersihkan dari _sharedListeners (rawFirestoreDocs & lastDocs)
            if (this._sharedListeners && this._sharedListeners[col]) {
                const entry = this._sharedListeners[col];
                if (Array.isArray(entry.rawFirestoreDocs)) {
                    entry.rawFirestoreDocs = entry.rawFirestoreDocs.filter(i => {
                        if (!i) return false;
                        const id = String(i.kodeTugas || i.kodeTugasBalikan || i.id || '').trim();
                        const asal = String(i.kodeTugasAsal || '').trim();
                        return !targets.has(id) && !targets.has(asal);
                    });
                }
                if (Array.isArray(entry.lastDocs)) {
                    entry.lastDocs = entry.lastDocs.filter(i => {
                        if (!i) return false;
                        const id = String(i.kodeTugas || i.kodeTugasBalikan || i.id || '').trim();
                        const asal = String(i.kodeTugasAsal || '').trim();
                        return !targets.has(id) && !targets.has(asal);
                    });
                }
            }

            // 3. Bersihkan dari _hostingArchiveStore
            if (this._hostingArchiveStore && this._hostingArchiveStore[col]) {
                targets.forEach(t => this._hostingArchiveStore[col].delete(t));
            }

            // 4. Tulis langsung ke localStorage secara sinkron agar tidak pernah hidup kembali
            try {
                if (typeof localStorage !== 'undefined') {
                    const rawCache = localStorage.getItem('jnt_cache_' + col);
                    if (rawCache) {
                        const parsed = JSON.parse(rawCache);
                        if (Array.isArray(parsed)) {
                            const filtered = parsed.filter(i => {
                                if (!i) return false;
                                const id = String(i.kodeTugas || i.kodeTugasBalikan || i.id || i._docId || '').trim();
                                const asal = String(i.kodeTugasAsal || '').trim();
                                return !targets.has(id) && !targets.has(asal);
                            });
                            localStorage.setItem('jnt_cache_' + col, JSON.stringify(filtered));
                        }
                    }
                    const rawArch = localStorage.getItem('jnt_host_arch_' + col);
                    if (rawArch) {
                        const parsedArch = JSON.parse(rawArch);
                        if (Array.isArray(parsedArch)) {
                            const filteredArch = parsedArch.filter(i => {
                                if (!i) return false;
                                const id = String(i.kodeTugas || i.kodeTugasBalikan || i.id || i._docId || '').trim();
                                const asal = String(i.kodeTugasAsal || '').trim();
                                return !targets.has(id) && !targets.has(asal);
                            });
                            localStorage.setItem('jnt_host_arch_' + col, JSON.stringify(filteredArch));
                        }
                    }
                }
            } catch (_) { }
        });
    },

    async deleteTripCascade(kodeTugas, isMasterDelete = true) {
        if (!kodeTugas) return;
        const activeRole = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('jnt_user_role') : '') || '';
        if (this.normalizeRole && this.normalizeRole(activeRole) === 'VENDOR') {
            throw new Error('⚠️ Akses Dibatasi: Akun Role Vendor tidak diizinkan menghapus data perjalanan operasional.');
        }
        console.log(`[GLOBAL CASCADE DELETE] KodeTugas: ${kodeTugas}`);

        // Cari dokumen return terlebih dahulu sebelum cache dibersihkan
        let returnDoc = null;
        try {
            const allReturns = this.getLocalStore('sla_return') || [];
            returnDoc = allReturns.find(r =>
                r.kodeTugasAsal === kodeTugas ||
                r.kodeTugasBalikan === kodeTugas ||
                r.kodeBalikan === kodeTugas ||
                r.id === kodeTugas
            ) || null;
        } catch (e) { }

        const linkedBalikan = (returnDoc && (returnDoc.kodeTugasBalikan || returnDoc.kodeBalikan)) || `${kodeTugas}-RET`;
        const linkedAsal = (returnDoc && returnDoc.kodeTugasAsal) || kodeTugas;

        // 0. LANGKAH PERTAMA (0ms): Catat ke Tombstone _deletedTripIds & bersihkan seluruh cache memori/localStorage/hosting SEBELUM delete Firestore
        // Ini mencegah race-condition di mana onSnapshot salah satu koleksi me-restore kembali trip dari koleksi lain yang belum selesai dihapus!
        this._markTripAsDeleted(kodeTugas, linkedBalikan);
        if (linkedAsal && linkedAsal !== kodeTugas) {
            this._markTripAsDeleted(linkedAsal, linkedBalikan);
        }
        this._purgeTripFromAllLocalCachesImmediate(kodeTugas, linkedBalikan);
        if (linkedAsal && linkedAsal !== kodeTugas) {
            this._purgeTripFromAllLocalCachesImmediate(linkedAsal, linkedBalikan);
        }

        // Batalkan timer auto-archive yang mungkin sedang berjalan agar tidak menulis ulang trip yang sedang dihapus
        if (this._autoArchiveTimer) {
            clearTimeout(this._autoArchiveTimer);
            this._autoArchiveTimer = null;
        }

        // Beritahu seluruh subscriber di halaman saat ini seketika
        ['sla_outbound', 'monitoring_4h', 'incoming', 'sla_return', 'sla_roundtrip'].forEach(col => {
            this.notifyDataMutated({ colName: col, docId: kodeTugas, action: 'delete', confirmed: true });
        });

        // 1. Troubles collection: tutup kendala terkait tanpa membangkitkan trip kembali
        const localTroubles = this.getLocalStore('troubles') || [];
        for (const tr of localTroubles) {
            if (tr.kodeTugas === kodeTugas && tr.status !== 'SUDAH SELESAI') {
                await this.updateIncidentStatus(tr.incidentId || tr.id, 'SUDAH SELESAI', `[CASCADE DELETE] Trip ${kodeTugas} dibatalkan/dihapus`, "Supervisor", false).catch(() => { });
            }
        }

        // 2. Hapus dari semua 5 koleksi Cloud Firestore secara ATOMIK menggunakan WriteBatch (Prioritas 2)
        const batchDeleteOps = [
            { type: 'delete', colName: 'sla_outbound', docId: kodeTugas },
            { type: 'delete', colName: 'monitoring_4h', docId: kodeTugas },
            { type: 'delete', colName: 'sla_return', docId: kodeTugas },
            { type: 'delete', colName: 'sla_roundtrip', docId: kodeTugas },
            { type: 'delete', colName: 'incoming', docId: kodeTugas }
        ];

        if (linkedBalikan && linkedBalikan !== kodeTugas) {
            batchDeleteOps.push({ type: 'delete', colName: 'monitoring_4h', docId: linkedBalikan });
        }
        if (linkedAsal && linkedAsal !== kodeTugas) {
            batchDeleteOps.push({ type: 'delete', colName: 'sla_return', docId: linkedAsal });
            batchDeleteOps.push({ type: 'delete', colName: 'sla_roundtrip', docId: linkedAsal });
        }

        await Promise.all([
            this.commitAtomicBatch(batchDeleteOps),
            this.deleteTripFromHostingArchive(kodeTugas, linkedBalikan).catch(() => { })
        ]);

        // Pastikan sekali lagi cache bersih setelah konfirmasi Server ACK selesai
        this._purgeTripFromAllLocalCachesImmediate(kodeTugas, linkedBalikan);

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

    async deleteSLAReturn(kodeBalikanOrAsal) {
        if (!kodeBalikanOrAsal) return;
        const shiftId = this.getActiveShiftId();
        let targetAsal = kodeBalikanOrAsal;
        let targetBalik = kodeBalikanOrAsal;

        try {
            let retDoc = await this.getDoc('sla_return', kodeBalikanOrAsal);
            if (retDoc) {
                targetAsal = kodeBalikanOrAsal;
                targetBalik = retDoc.kodeTugasBalikan || retDoc.kodeBalikan || '';
            } else {
                const allRet = this.getLocalStore('sla_return') || [];
                const found = allRet.find(r => r.kodeTugasBalikan === kodeBalikanOrAsal || r.kodeBalikan === kodeBalikanOrAsal || r.id === kodeBalikanOrAsal);
                if (found) {
                    targetAsal = found.kodeTugasAsal || found.id;
                    targetBalik = found.kodeTugasBalikan || kodeBalikanOrAsal;
                }
            }

            if (targetBalik) {
                this._markTripAsDeleted(targetBalik);
                this._purgeTripFromAllLocalCachesImmediate(targetBalik);
                await this.deleteDoc('monitoring_4h', targetBalik).catch(() => { });
            }
            if (targetAsal) {
                await this.deleteDoc('sla_return', targetAsal).catch(() => { });
                await this.deleteDoc('sla_roundtrip', targetAsal).catch(() => { });
            }

            await this.logAuditEvent({
                waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: sessionStorage.getItem('jnt_active_username') || "Supervisor",
                shiftId: shiftId,
                modul: "SLA Vendor",
                kodeTugas: targetBalik || targetAsal,
                aktivitas: `Hapus Data Perjalanan Balikan (${targetBalik || targetAsal})`
            });

            window.dispatchEvent(new CustomEvent('jnt_data_updated', {
                detail: { collection: 'sla_return', id: targetAsal }
            }));
            window.dispatchEvent(new CustomEvent('jnt_data_updated', {
                detail: { collection: 'monitoring_4h', id: targetBalik }
            }));
        } catch (err) {
            console.error('deleteSLAReturn error:', err);
            throw err;
        }
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
            operator: sessionStorage.getItem('jnt_active_username') || "Operator",
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

        // Check if this is a return trip (so we don't create ghost entries in incoming / sla_outbound)
        const retList = this.getLocalStore('sla_return') || [];
        const monList = this.getLocalStore('monitoring_4h') || [];
        const retMatch = retList.find(r => (r.kodeTugasBalikan === kodeTugas) || (r.kodeTugas === kodeTugas) || (r.id === kodeTugas));
        const monMatch = monList.find(m => (m.kodeTugas === kodeTugas) || (m.id === kodeTugas));
        const isReturn = Boolean(
            retMatch ||
            (monMatch && (monMatch.tripType === 'RETURN' || monMatch.isBalikan)) ||
            String(kodeTugas).toUpperCase().includes('-RET')
        );

        // Map status for monitoring_4h
        let monStatus = "ON PROGRESS";
        if (status === 'SUDAH SELESAI' || status === 'COMPLETED') monStatus = "COMPLETED";
        else if (status === 'KENDALA' || status === 'TROUBLE') monStatus = "KENDALA";
        else if (status === 'WAITING') monStatus = "WAITING";

        await this.saveDoc('monitoring_4h', kodeTugas, { statusPerjalanan: monStatus }, true);

        if (isReturn) {
            const retKey = (retMatch && (retMatch.id || retMatch.kodeTugasAsal)) || kodeTugas;
            await this.saveDoc('sla_return', retKey, {
                statusPerjalanan: monStatus,
                statusBalikan: status,
                ...meta
            }, true);
        } else {
            // Update incoming master status
            await this.saveDoc('incoming', kodeTugas, { status: status, ...meta }, true);

            // Map status for sla_outbound
            let slaStatus = "BERJALAN";
            if (status === 'SUDAH SELESAI' || status === 'COMPLETED') slaStatus = "ON TIME";
            else if (status === 'KENDALA') slaStatus = "KENDALA";

            await this.saveDoc('sla_outbound', kodeTugas, { statusSla: slaStatus }, true);
        }

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: meta.inputBy || sessionStorage.getItem('jnt_active_username') || "Operator",
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

    // ----------------------------------------------------
    // ⚡ CPANEL HOSTING ARCHIVE & CACHE ENGINE (trip_archive.php & shift_history.php)
    // Menyimpan & menggabungkan (Auto-Merge) seluruh riwayat trip yang sudah COMPLETED / hasil Import Excel
    // serta riwayat Shift Handover dari hosting cPanel agar 100% riwayat tetap tampil di UI dengan 0 Read/Write Firestore.
    // ----------------------------------------------------
    _hostingArchiveStore: {
        incoming: new Map(),
        sla_outbound: new Map(),
        monitoring_4h: new Map(),
        sla_return: new Map(),
        sla_roundtrip: new Map(),
        shifts: new Map(),
        troubles: new Map(),
        master_trips: new Map(),
        master_vendors: new Map(),
        master_fleets: new Map(),
        master_drivers: new Map(),
        master_reasons: new Map()
    },
    _hostingArchiveLoaded: false,
    _hostingEndpointAvailable: null,
    _hostingBatchQueue: [],
    _hostingBatchTimer: null,

    async _getHostingAuthHeaders(isJson = true) {
        const headers = isJson ? { 'Content-Type': 'application/json' } : {};
        if (typeof window !== 'undefined' && window.auth && window.auth.currentUser && !window.auth.currentUser.isAnonymous) {
            try {
                const tok = await window.auth.currentUser.getIdToken();
                if (tok) headers['Authorization'] = `Bearer ${tok}`;
            } catch (_) { }
        }
        return headers;
    },

    _hydrateHostingArchiveFromLocalCache() {
        if (this._didHydrateHostingLocal || typeof localStorage === 'undefined') return;
        this._didHydrateHostingLocal = true;
        const cols = ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip', 'shifts', 'troubles', 'master_trips', 'master_vendors', 'master_fleets', 'master_drivers', 'master_reasons'];
        cols.forEach(col => {
            try {
                const raw = localStorage.getItem('jnt_host_arch_' + col);
                if (raw) {
                    const arr = JSON.parse(raw);
                    if (Array.isArray(arr)) {
                        const map = this._hostingArchiveStore[col] || new Map();
                        arr.forEach(doc => {
                            if (!doc) return;
                            const k = doc.kodeTugas || doc.shiftId || doc.incidentId || doc.code || doc.id;
                            if (k) map.set(k, doc);
                        });
                        this._hostingArchiveStore[col] = map;
                    }
                }
            } catch (_) { }
        });
    },

    _persistHostingArchiveToLocalCache(col) {
        if (typeof localStorage === 'undefined' || !this._hostingArchiveStore[col]) return;
        this._hostArchTimers = this._hostArchTimers || {};
        if (this._hostArchTimers[col]) clearTimeout(this._hostArchTimers[col]);
        this._hostArchTimers[col] = setTimeout(() => {
            try {
                const arr = Array.from(this._hostingArchiveStore[col].values());
                const safeArr = this._stripPhotosForLocalStorage(arr);
                localStorage.setItem('jnt_host_arch_' + col, JSON.stringify(safeArr));
            } catch (_) { }
        }, 250);
    },

    /**
     * ⚡ STRICT FIRESTORE SSOT FILTER (Prioritas 1)
     * Tidak lagi menyuntikkan dokumen dari _hostingArchiveStore (jnt_host_arch_*) ke dalam liveList Firestore!
     * Saat snapshot Firestore diterima, data yang ditampilkan 100% adalah data dari Cloud Firestore,
     * dan dokumen yang sudah tidak ada di Firestore otomatis dibersihkan dari _hostingArchiveStore lokal.
     */
    _mergeWithHostingArchive(colName, liveList) {
        const rawArr = Array.isArray(liveList) ? liveList : [];
        const isTripCol = ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'].includes(colName);
        const deletedSet = isTripCol ? this._getDeletedTripIdsSet() : null;

        const cleanList = (!deletedSet || deletedSet.size === 0)
            ? rawArr
            : rawArr.filter(doc => {
                if (!doc) return false;
                const k = String(doc.kodeTugas || doc.kodeTugasBalikan || doc.id || doc._docId || '').trim();
                const asal = String(doc.kodeTugasAsal || '').trim();
                return !deletedSet.has(k) && (!asal || !deletedSet.has(asal));
            });

        // Sinkronkan _hostingArchiveStore di memori lokal agar tidak menyimpan zombie data yang sudah dihapus dari Firestore
        const entry = this._sharedListeners && this._sharedListeners[colName];
        if (entry && entry.rawFirestoreDocs !== null && this._hostingArchiveStore && this._hostingArchiveStore[colName]) {
            const activeKeys = new Set(cleanList.map(d => String(d.kodeTugas || d.shiftId || d.incidentId || d.code || d.id || '').trim()).filter(Boolean));
            const archMap = this._hostingArchiveStore[colName];
            let archChanged = false;
            archMap.forEach((_, key) => {
                if (!activeKeys.has(String(key).trim())) {
                    archMap.delete(key);
                    archChanged = true;
                }
            });
            if (archChanged) {
                this._persistHostingArchiveToLocalCache(colName);
            }
        }

        return cleanList;
    },

    async loadHostingArchiveData(force = false) {
        this._hydrateHostingArchiveFromLocalCache();
        if (this._hostingArchiveLoaded && !force) return true;
        if (typeof window === 'undefined' || !window.location || !window.location.protocol.startsWith('http')) {
            return false;
        }
        if (this._hostingArchiveLoadingPromise && !force) {
            return this._hostingArchiveLoadingPromise;
        }

        this._hostingArchiveLoadingPromise = (async () => {
            try {
                let headers = await this._getHostingAuthHeaders(false);
                if (!headers['Authorization'] && typeof window !== 'undefined' && window.auth) {
                    // Tunggu hingga Firebase Auth selesai memulihkan sesi user (maks 3.5 detik)
                    await new Promise((resolve) => {
                        let settled = false;
                        const timer = setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 3500);
                        const unsub = window.auth.onAuthStateChanged((u) => {
                            if (u && !u.isAnonymous && !settled) {
                                settled = true;
                                clearTimeout(timer);
                                if (typeof unsub === 'function') unsub();
                                resolve();
                            }
                        });
                    });
                    headers = await this._getHostingAuthHeaders(false);
                }
                if (!headers['Authorization']) {
                    return false;
                }

                const [tripRes, shiftRes, troubleRes, masterRes] = await Promise.all([
                    fetch('trip_archive.php', { method: 'GET', headers }).catch(() => null),
                    fetch('shift_history.php', { method: 'GET', headers }).catch(() => null),
                    fetch('trouble_archive.php', { method: 'GET', headers }).catch(() => null),
                    fetch('master_data.php', { method: 'GET', headers }).catch(() => null)
                ]);

                let anyUpdated = false;
                if (tripRes && tripRes.ok && (tripRes.headers.get('content-type') || '').includes('application/json')) {
                    const data = await tripRes.json();
                    if (data && data.success) {
                        this._hostingEndpointAvailable = true;
                        this._hostingArchiveLoaded = true;
                        ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'].forEach(col => {
                            if (Array.isArray(data[col])) {
                                const map = this._hostingArchiveStore[col] || new Map();
                                data[col].forEach(doc => {
                                    if (!doc) return;
                                    const k = doc.kodeTugas || doc.id;
                                    if (k) map.set(k, doc);
                                });
                                this._hostingArchiveStore[col] = map;
                                this._persistHostingArchiveToLocalCache(col);
                                anyUpdated = true;
                            }
                        });
                    }
                }

                if (shiftRes && shiftRes.ok && (shiftRes.headers.get('content-type') || '').includes('application/json')) {
                    const sData = await shiftRes.json();
                    if (sData && sData.success && Array.isArray(sData.shifts)) {
                        const sMap = this._hostingArchiveStore.shifts || new Map();
                        sData.shifts.forEach(sh => {
                            if (!sh) return;
                            const sid = sh.shiftId || sh.id;
                            if (sid) sMap.set(sid, sh);
                        });
                        this._hostingArchiveStore.shifts = sMap;
                        this._persistHostingArchiveToLocalCache('shifts');
                        anyUpdated = true;
                    }
                }

                if (troubleRes && troubleRes.ok && (troubleRes.headers.get('content-type') || '').includes('application/json')) {
                    const tData = await troubleRes.json();
                    if (tData && tData.success && Array.isArray(tData.troubles)) {
                        const tMap = this._hostingArchiveStore.troubles || new Map();
                        tData.troubles.forEach(tr => {
                            if (!tr) return;
                            const tid = tr.incidentId || tr.id;
                            if (tid) tMap.set(tid, tr);
                        });
                        this._hostingArchiveStore.troubles = tMap;
                        this._persistHostingArchiveToLocalCache('troubles');
                        anyUpdated = true;
                    }
                }

                if (masterRes && masterRes.ok && (masterRes.headers.get('content-type') || '').includes('application/json')) {
                    const mData = await masterRes.json();
                    if (mData && mData.success) {
                        ['master_trips', 'master_vendors', 'master_fleets', 'master_drivers', 'master_reasons'].forEach(mCol => {
                            if (Array.isArray(mData[mCol]) && mData[mCol].length > 0) {
                                const mMap = this._hostingArchiveStore[mCol] || new Map();
                                mData[mCol].forEach(doc => {
                                    if (!doc) return;
                                    const mid = doc.id || doc.code || doc.platNomor || doc.nama;
                                    if (mid) mMap.set(mid, doc);
                                });
                                this._hostingArchiveStore[mCol] = mMap;
                                this._persistHostingArchiveToLocalCache(mCol);
                                anyUpdated = true;
                            }
                        });
                    }
                }

                // STRICT FIRESTORE SSOT: Pembuatan cache arsip cPanel di latar belakang TIDAK BOLEH menimpa
                // atau menyuntikkan data lama ke dalam listener onSnapshot Firestore yang sedang aktif.
                return this._hostingArchiveLoaded;
            } catch (err) {
                console.debug('[HOSTING ARCHIVE] load notice:', err.message);
                return false;
            } finally {
                this._hostingArchiveLoadingPromise = null;
            }
        })();

        return this._hostingArchiveLoadingPromise;
    },

    async saveTripsBatchToHostingArchive(bundles = [], deleteFromFirestoreAfterSave = false) {
        if (!Array.isArray(bundles) || bundles.length === 0) return false;
        this._hydrateHostingArchiveFromLocalCache();

        // 1. Update in-memory hosting archive immediately for 0ms UI response
        const affectedCols = new Set();
        bundles.forEach(b => {
            if (!b || !b.kodeTugas) return;
            const kode = b.kodeTugas;
            ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'].forEach(col => {
                if (b[col] && typeof b[col] === 'object') {
                    const docKey = b[col].kodeTugas || b[col].id || kode;
                    const map = this._hostingArchiveStore[col] || new Map();
                    const prev = map.get(docKey) || {};
                    map.set(docKey, { ...prev, ...b[col], id: docKey, kodeTugas: docKey, _archivedInHosting: true });
                    this._hostingArchiveStore[col] = map;
                    affectedCols.add(col);
                }
            });
        });

        affectedCols.forEach(col => {
            this._persistHostingArchiveToLocalCache(col);
            const cur = this.getLocalStore(col) || [];
            this.saveLocalStore(col, this._mergeWithHostingArchive(col, cur));
        });

        // 2. Kirim ke trip_archive.php di hosting cPanel dalam chunk @250 trip agar tidak pernah melebihi batas post_max_size PHP (8MB)
        try {
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                const headers = await this._getHostingAuthHeaders(true);
                const CHUNK_SIZE = 250;
                let allChunksOk = true;
                for (let i = 0; i < bundles.length; i += CHUNK_SIZE) {
                    const chunk = bundles.slice(i, i + CHUNK_SIZE);
                    const res = await fetch('trip_archive.php', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ action: 'upsert_batch', trips: chunk })
                    });
                    if (res && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
                        const data = await res.json();
                        if (data && data.success) {
                            this._hostingEndpointAvailable = true;
                        } else {
                            allChunksOk = false;
                        }
                    } else {
                        allChunksOk = false;
                    }
                }
                if (allChunksOk && this._hostingEndpointAvailable) {
                    window.dispatchEvent(new CustomEvent('jnt_data_updated', { detail: { source: 'hosting_archive_save' } }));
                    return true;
                }
            }
        } catch (err) {
            console.debug('[HOSTING ARCHIVE] save batch fallback notice:', err.message);
        }
        return false;
    },

    async deleteTripFromHostingArchive(kodeTugas, kodeTugasBalikan = '') {
        if (!kodeTugas) return;
        this._hydrateHostingArchiveFromLocalCache();
        ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'].forEach(col => {
            const map = this._hostingArchiveStore[col];
            if (map) {
                map.delete(kodeTugas);
                if (kodeTugasBalikan) map.delete(kodeTugasBalikan);
                map.delete(`${kodeTugas}-RET`);
                this._persistHostingArchiveToLocalCache(col);
            }
        });
        try {
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                const headers = await this._getHostingAuthHeaders(true);
                await fetch('trip_archive.php', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ action: 'delete_trip', kodeTugas, kodeTugasBalikan })
                });
            }
        } catch (_) { }
    },

    async saveShiftToHostingHistory(shiftObj, deleteFromFirestoreAfterSave = false) {
        if (!shiftObj || !(shiftObj.shiftId || shiftObj.id)) return false;
        this._hydrateHostingArchiveFromLocalCache();
        const sid = shiftObj.shiftId || shiftObj.id;
        const sMap = this._hostingArchiveStore.shifts || new Map();
        sMap.set(sid, { ...(sMap.get(sid) || {}), ...shiftObj, id: sid, shiftId: sid, _archivedInHosting: true });
        this._hostingArchiveStore.shifts = sMap;
        this._persistHostingArchiveToLocalCache('shifts');

        try {
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                const headers = await this._getHostingAuthHeaders(true);
                const res = await fetch('shift_history.php', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ shift: shiftObj })
                });
                if (res && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
                    const data = await res.json();
                    if (data && data.success) {
                        if (deleteFromFirestoreAfterSave && window.db && String(shiftObj.status || '').toUpperCase() === 'COMPLETED') {
                            window.db.collection('shifts').doc(sid).delete().catch(() => { });
                        }
                        this.forceRefreshSub('shifts');
                        return true;
                    }
                }
            }
        } catch (_) { }
        return false;
    },

    async saveTroubleToHostingArchive(incidentObj, deleteFromFirestoreAfterSave = false) {
        if (!incidentObj || !(incidentObj.incidentId || incidentObj.id)) return false;
        this._hydrateHostingArchiveFromLocalCache();
        const iid = incidentObj.incidentId || incidentObj.id;
        const tMap = this._hostingArchiveStore.troubles || new Map();
        tMap.set(iid, { ...(tMap.get(iid) || {}), ...incidentObj, id: iid, incidentId: iid, _archivedInHosting: true });
        this._hostingArchiveStore.troubles = tMap;
        this._persistHostingArchiveToLocalCache('troubles');

        try {
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                const headers = await this._getHostingAuthHeaders(true);
                const res = await fetch('trouble_archive.php', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ incident: incidentObj })
                });
                if (res && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
                    const data = await res.json();
                    if (data && data.success) {
                        const st = String(incidentObj.status || '').toUpperCase();
                        if (deleteFromFirestoreAfterSave && window.db && (st === 'SUDAH SELESAI' || st === 'RESOLVED' || st === 'SELESAI')) {
                            window.db.collection('troubles').doc(iid).delete().catch(() => { });
                        }
                        this.forceRefreshSub('troubles');
                        return true;
                    }
                }
            }
        } catch (_) { }
        return false;
    },

    async saveMasterDataToHosting(colName, docId, docData, isDelete = false) {
        if (!colName || !docId) return false;
        this._hydrateHostingArchiveFromLocalCache();
        const mMap = this._hostingArchiveStore[colName] || new Map();
        if (isDelete) {
            mMap.delete(docId);
        } else {
            mMap.set(docId, { ...(mMap.get(docId) || {}), ...docData, id: docId });
        }
        this._hostingArchiveStore[colName] = mMap;
        this._persistHostingArchiveToLocalCache(colName);
        this.saveLocalStore(colName, Array.from(mMap.values()));

        try {
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                const headers = await this._getHostingAuthHeaders(true);
                const res = await fetch('master_data.php', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(isDelete
                        ? { action: 'delete', collection: colName, docId }
                        : { action: 'upsert', collection: colName, docId, data: docData }
                    )
                });
                if (res && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
                    const data = await res.json();
                    if (data && data.success) {
                        this.notifyDataMutated({ colName, docId, action: isDelete ? 'delete' : 'save' });
                        return true;
                    }
                }
            }
        } catch (_) { }
        return false;
    },

    /**
     * ⚡ ONE-WAY CPANEL BACKUP ENGINE (Prioritas 1 — Strict Firestore SSOT)
     * Hanya mencadangkan (backup) trip yang berstatus COMPLETED dari Cloud Firestore ke trip_archive.php di cPanel.
     * TIDAK PERNAH mengunggah ulang (Self-Heal) arsip lama ke Cloud Firestore dan TIDAK PERNAH menghapus data dari Firestore.
     */
    async syncExistingCompletedTripsToHosting() {
        if (this._didAutoSyncCompletedToHosting) return;
        this._didAutoSyncCompletedToHosting = true;

        try {
            const deletedSet = this._getDeletedTripIdsSet();
            const incEntry = this._sharedListeners && this._sharedListeners['incoming'];
            const slaEntry = this._sharedListeners && this._sharedListeners['sla_outbound'];
            const monEntry = this._sharedListeners && this._sharedListeners['monitoring_4h'];

            const rawInc = (incEntry && incEntry.rawFirestoreDocs) || [];
            const rawSla = (slaEntry && slaEntry.rawFirestoreDocs) || [];
            const rawMon = (monEntry && monEntry.rawFirestoreDocs) || [];

            if (rawInc.length === 0 && rawSla.length === 0 && rawMon.length === 0) return;

            const incFsMap = new Map(rawInc.map(d => [d.kodeTugas || d.id, d]));
            const slaFsMap = new Map(rawSla.map(d => [d.kodeTugas || d.id, d]));
            const monFsMap = new Map(rawMon.map(d => [d.kodeTugas || d.id, d]));

            const mergedFirestoreMap = new Map();
            const DEMO_IDS = new Set([
                'DBGX2610020001', 'DBGX2610020002', 'DBGX2610020003',
                'DBGX2610020004', 'DBGX2610020005', 'DBGX2610020006',
                '4234234', 'DBDBDBDB'
            ]);

            // Hanya membaca dokumen yang BENAR-BENAR ADA di snapshot Cloud Firestore saat ini
            [...rawInc, ...rawSla, ...rawMon].forEach(item => {
                if (!item) return;
                const k = String(item.kodeTugas || item.id || '').trim();
                if (!k || DEMO_IDS.has(k) || deletedSet.has(k)) return;
                if (item.tripType === 'RETURN' || item.isBalikan || k.toUpperCase().includes('-RET')) return;
                const prev = mergedFirestoreMap.get(k) || {};
                mergedFirestoreMap.set(k, {
                    ...prev,
                    ...item,
                    slots: { ...(prev.slots || {}), ...(item.slots || {}) }
                });
            });

            const completedBundles = [];

            for (const [k, unified] of mergedFirestoreMap.entries()) {
                if (deletedSet.has(k)) continue;
                const arrStr = String(unified.jamSampaiAktual || '').trim();
                const hasValidArr = Boolean(arrStr && !/^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(arrStr));
                const stUpper = String(unified.statusPerjalanan || unified.statusSla || unified.status || '').toUpperCase();
                const isDone = hasValidArr || stUpper === 'COMPLETED' || stUpper === 'SUDAH SELESAI' || stUpper === 'ON TIME' || stUpper === 'LATE';

                if (isDone) {
                    completedBundles.push({
                        kodeTugas: k,
                        incoming: incFsMap.get(k) || unified,
                        sla_outbound: slaFsMap.get(k) || unified,
                        monitoring_4h: monFsMap.get(k) || unified
                    });
                }
            }

            if (completedBundles.length > 0) {
                await this.saveTripsBatchToHostingArchive(completedBundles, false);
            }
        } catch (err) {
            console.debug('[HOSTING ARCHIVE] backup notice:', err.message);
        }
    },

    /**
     * ⚡ SINGLETON COLLECTION SNAPSHOT MULTIPLEXER (Prioritas 1 & 3 — 100% Cloud Firestore SSOT)
     * Menjamin setiap koleksi (termasuk 5 koleksi Master Data) menggunakan onSnapshot Cloud Firestore sebagai sumber utama.
     * Ketika snapshot diterima dari server Firestore, cache lokal (RAM & localStorage) langsung diganti 100% dengan data server.
     */
    _buildCollectionQuery(colName) {
        if (!window.db) return null;
        const baseCol = window.db.collection(colName);
        const vendorScopedCols = new Set([
            'incoming',
            'sla_outbound',
            'monitoring_4h',
            'sla_return',
            'sla_roundtrip',
            'troubles',
            'master_fleets'
        ]);
        const role = this.getVerifiedRole ? this.getVerifiedRole() : '';
        if (role === 'VENDOR' && vendorScopedCols.has(colName)) {
            const scope = this.getActiveVendorScope ? this.getActiveVendorScope() : null;
            if (scope && scope.fullName && typeof baseCol.where === 'function') {
                return baseCol.where('vendor', '==', scope.fullName);
            }
        }
        return baseCol;
    },

    refreshVendorScopedListeners() {
        if (!this._sharedListeners) return;
        Object.keys(this._sharedListeners).forEach(colName => {
            const entry = this._sharedListeners[colName];
            if (entry && typeof entry.restart === 'function') {
                entry.restart();
            }
        });
    },

    _attachSharedSnapshot(colName, onDocs, onError) {
        this._sharedListeners = this._sharedListeners || {};
        let entry = this._sharedListeners[colName];

        if (!entry) {
            entry = {
                subscribers: new Set(),
                errorHandlers: new Set(),
                rawFirestoreDocs: null,
                lastDocs: null,
                unsubFirestore: null,
                authUnsub: null,
                restart: null
            };
            this._sharedListeners[colName] = entry;

            const startFirestoreSub = () => {
                if (!window.db) return;
                if (typeof entry.unsubFirestore === 'function') {
                    entry.unsubFirestore();
                    entry.unsubFirestore = null;
                }
                // Role VENDOR tidak diizinkan membaca koleksi shifts, users, atau audit_logs di Firestore Rules
                const activeRole = this.getVerifiedRole ? this.getVerifiedRole() : '';
                if (activeRole === 'VENDOR' && ['shifts', 'users', 'audit_logs'].includes(colName)) {
                    entry.rawFirestoreDocs = [];
                    entry.lastDocs = [];
                    entry.subscribers.forEach(fn => { try { fn([]); } catch (_) { } });
                    return;
                }
                try {
                    const queryRef = this._buildCollectionQuery(colName) || window.db.collection(colName);
                    entry.unsubFirestore = queryRef.onSnapshot(snap => {
                        const rawDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        entry.rawFirestoreDocs = rawDocs;
                        // Filter hanya untuk membuang ID yang sedang dihapus / demo, TANPA menyuntikkan arsip lama
                        const docs = this._mergeWithHostingArchive(colName, rawDocs);
                        entry.lastDocs = docs;
                        // Replace cache lokal 100% dengan snapshot resmi dari server Firestore
                        this.saveLocalStore(colName, docs);
                        entry.subscribers.forEach(fn => {
                            try { fn(docs); } catch (e) { console.warn(`[SHARED SUB ${colName}] subscriber error:`, e); }
                        });
                        // Backup satu arah ke cPanel (Firestore -> cPanel JSON) di latar belakang
                        if (['incoming', 'sla_outbound', 'monitoring_4h'].includes(colName) && rawDocs.length > 0) {
                            if (this._autoArchiveTimer) clearTimeout(this._autoArchiveTimer);
                            this._autoArchiveTimer = setTimeout(() => {
                                this.syncExistingCompletedTripsToHosting();
                            }, 3500);
                        }
                    }, err => {
                        console.warn(`[FIRESTORE] snapshot notice [${colName}]: ${err.message}`);
                        entry.errorHandlers.forEach(efn => {
                            try { efn(err); } catch (_) { }
                        });
                        if (window.auth && (err.code === 'permission-denied' || (err.message && err.message.includes('permission')))) {
                            if (!entry.authUnsub) {
                                entry.authUnsub = window.auth.onAuthStateChanged(u => {
                                    if (u && !u.isAnonymous) {
                                        if (typeof entry.authUnsub === 'function') { entry.authUnsub(); entry.authUnsub = null; }
                                        startFirestoreSub();
                                    }
                                });
                            }
                        }
                    });
                } catch (e) {
                    console.warn(`[SHARED SUB ${colName}] attach error:`, e);
                }
            };

            entry.restart = startFirestoreSub;
            startFirestoreSub();

            if (window.auth && !window.auth.currentUser) {
                const onceAuth = window.auth.onAuthStateChanged(u => {
                    if (u && !u.isAnonymous) {
                        onceAuth();
                        startFirestoreSub();
                    }
                });
            }
        }

        entry.subscribers.add(onDocs);
        if (typeof onError === 'function') entry.errorHandlers.add(onError);

        // Jika snapshot sudah tersedia di memori dari listener aktif, kirim langsung tanpa query ulang ke Firestore!
        if (entry.lastDocs !== null) {
            try { onDocs(entry.lastDocs); } catch (_) { }
        }

        return () => {
            entry.subscribers.delete(onDocs);
            if (typeof onError === 'function') entry.errorHandlers.delete(onError);
        };
    },

    createSub(colName, callback) {
        let isCloudInitialized = false;
        let lastEmittedJson = '';

        // Simpan referensi emit agar bisa di-force dari luar (misal: setelah submit form)
        let _emitRef = null;

        this._cachedSubData = this._cachedSubData || {};

        const emit = (cloudList = null) => {
            const map = new Map();

            if (cloudList !== null) {
                isCloudInitialized = true;
                this._cachedSubData[colName] = cloudList;

                // 1. Preserve only local items that are still PENDING sync to cloud
                const localList = this.getLocalStore(colName) || [];
                localList.forEach(i => {
                    if (i && (i.syncStatus === 'PENDING' || i._syncStatus === 'PENDING')) {
                        const key = colName === 'users'
                            ? String(i.username || i.id || i._docId || '').toLowerCase().trim()
                            : (i.kodeTugas || i.id || i._docId);
                        if (key) map.set(key, i);
                    }
                });

                // 2. Merge Cloud list as Single Source of Truth
                cloudList.forEach(i => {
                    if (!i) return;
                    const key = colName === 'users'
                        ? String(i.username || i.id || i._docId || '').toLowerCase().trim()
                        : (i.kodeTugas || i.id || i._docId);
                    if (key) {
                        const existing = map.get(key) || {};
                        map.set(key, { ...existing, ...i });
                    }
                });

                this.saveLocalStore(colName, Array.from(map.values()));
            } else if (isCloudInitialized && this._cachedSubData && this._cachedSubData[colName]) {
                this._cachedSubData[colName].forEach(i => {
                    const key = i.kodeTugas || i.id || i._docId;
                    if (key) map.set(key, i);
                });
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
            // Terapkan isolasi data otomatis jika akun yang login ber-role VENDOR
            resultList = this.filterListByActiveVendorScope(colName, resultList);

            // Anti-flicker: Only invoke callback if list content has changed
            const newJson = JSON.stringify(resultList);
            if (newJson === lastEmittedJson) return;
            lastEmittedJson = newJson;

            callback(resultList);
        };

        _emitRef = emit;

        // Simpan di registry global agar bisa diakses dari luar
        this._subRegistry = this._subRegistry || {};
        this._subRegistry[colName] = {
            emit,
            invalidate: () => { lastEmittedJson = ''; }
        };

        emit(null);

        const eventHandler = () => emit(null);
        window.addEventListener('jnt_data_updated', eventHandler);

        const unsubShared = this._attachSharedSnapshot(
            colName,
            (data) => {
                isCloudInitialized = true;
                emit(data);
            },
            () => {
                emit(null);
            }
        );

        return () => {
            window.removeEventListener('jnt_data_updated', eventHandler);
            if (typeof unsubShared === 'function') unsubShared();
            if (this._subRegistry && this._subRegistry[colName]) {
                delete this._subRegistry[colName];
            }
        };
    },

    /**
     * Invalidasi cache anti-flicker untuk koleksi tertentu, lalu paksa emit ulang.
     * Panggil ini setelah save/update agar tabel langsung refresh tanpa menunggu
     * onSnapshot (yang bisa tertunda beberapa detik di koneksi lambat).
     */
    forceRefreshSub(colName) {
        if (this._subRegistry && this._subRegistry[colName]) {
            this._subRegistry[colName].invalidate();
            this._subRegistry[colName].emit(null);
        }
    },

    // Helper to get active Shift ID & Active Shift Object
    getActiveShiftId() {
        const shifts = this.getLocalStore('shifts') || [];
        const activeInStore = shifts.find(s => s && s.status === 'AKTIF' && (s.shiftId || s.id));
        if (activeInStore) {
            const activeId = activeInStore.shiftId || activeInStore.id;
            sessionStorage.setItem('jnt_active_shift_id', activeId);
            return activeId;
        }
        const stored = sessionStorage.getItem('jnt_active_shift_id');
        if (stored) return stored;
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const fallbackId = `SHIFT-${todayStr}-01`;
        sessionStorage.setItem('jnt_active_shift_id', fallbackId);
        return fallbackId;
    },

    getRealOperatorNames() {
        const users = this.getLocalStore('users') || [];
        const activeUserName = sessionStorage.getItem('jnt_active_username') || "Farizs Hakim";
        const dummyNames = ['rina marlina', 'dedi setiawan', 'budi santoso', 'hamdan hamdani', 'hamdan', 'rizky ramadhan', 'rizky', 'devoleper', 'developer admin'];
        const fromUsers = users
            .filter(u => (u.status || 'Aktif').toLowerCase() !== 'nonaktif')
            .map(u => (u.fullname || u.username || '').trim())
            .filter(n => n && !dummyNames.includes(n.toLowerCase()));
        const unique = Array.from(new Set([activeUserName, ...fromUsers])).filter(n => !dummyNames.includes(n.toLowerCase()));
        return unique.length > 0 ? unique : [activeUserName];
    },

    getActiveShift() {
        const activeId = this.getActiveShiftId();
        const shifts = this.getLocalStore('shifts');
        let found = shifts.find(s => s.shiftId === activeId || s.id === activeId);
        if (!found) {
            found = shifts.find(s => s.status === 'AKTIF');
        }
        const activeUserName = sessionStorage.getItem('jnt_active_username') || "Farizs Hakim";
        const realOps = this.getRealOperatorNames();
        const defaultOp2 = realOps.find(n => n.toLowerCase() !== activeUserName.toLowerCase()) || realOps[0] || activeUserName;
        const dummyNames = ['rina marlina', 'dedi setiawan', 'budi santoso', 'hamdan hamdani', 'hamdan', 'rizky ramadhan', 'rizky'];

        if (!found) {
            const todayStr = new Date().toISOString().slice(0, 10);
            found = {
                id: activeId,
                shiftId: activeId,
                tanggal: todayStr,
                namaShift: "Shift 1 (08:30 - 20:30 WIB)",
                jamMulai: "08:30",
                jamSelesai: "20:30",
                status: "AKTIF",
                operator1: { nama: activeUserName, role: "Operator Utama", tugas: "Monitoring 4 Jam" },
                operator2: { nama: defaultOp2, role: "Operator Pendamping", tugas: "SLA" },
                createdAt: new Date().toISOString()
            };
            this.saveDoc('shifts', activeId, found, true);
        } else {
            // Migrasi otomatis jika masih tersimpan nama dummy legacy atau format jam/penugasan lama
            let modified = false;
            if (found.operator1 && dummyNames.includes((found.operator1.nama || '').toLowerCase().trim())) {
                found.operator1.nama = activeUserName;
                modified = true;
            }
            if (found.operator2 && (!found.operator2.nama || dummyNames.includes((found.operator2.nama || '').toLowerCase().trim()))) {
                if (defaultOp2 && !dummyNames.includes(defaultOp2.toLowerCase())) {
                    found.operator2.nama = defaultOp2;
                    modified = true;
                }
            }
            if (found.operator1 && (found.operator1.tugas === "Monitoring 4H & Incident" || found.operator1.tugas === "Monitoring 4H & Trouble/Laka")) {
                found.operator1.tugas = "Monitoring 4 Jam";
                modified = true;
            }
            if (found.operator2 && (found.operator2.tugas === "SLA Vendor & Master Data" || found.operator2.tugas === "SLA Vendor")) {
                found.operator2.tugas = "SLA";
                modified = true;
            }
            if (found.jamMulai === "08:00" || found.jamMulai === "08:00 WIB") {
                found.jamMulai = "08:30";
                modified = true;
            }
            if (found.jamSelesai === "20:00" || found.jamSelesai === "20:00 WIB") {
                found.jamSelesai = "20:30";
                modified = true;
            }
            if (found.jamMulai === "20:00" || found.jamMulai === "20:00 WIB") {
                found.jamMulai = "20:30";
                modified = true;
            }
            if (found.jamSelesai === "08:00" || found.jamSelesai === "08:00 WIB" || found.jamSelesai === "09:30" || found.jamSelesai === "09:30 WIB") {
                found.jamSelesai = "08:30";
                modified = true;
            }
            if (found.namaShift === "Shift 1 (08:00 - 20:00 WIB)") {
                found.namaShift = "Shift 1 (08:30 - 20:30 WIB)";
                modified = true;
            } else if (found.namaShift === "Shift 2 (20:00 - 08:00 WIB)" || found.namaShift === "Shift 2 (20:30 - 09:30 WIB)") {
                found.namaShift = "Shift 2 (20:30 - 08:30 WIB)";
                modified = true;
            }
            if (modified) {
                this.saveDoc('shifts', found.shiftId || found.id, found, true);
            }
        }
        return found;
    },

    // ----------------------------------------------------
    // 1. AUTO-SEED INITIAL MASTER DATA & TRANSACTIONS
    // ----------------------------------------------------
    async seedInitialDataIfEmpty() {
        try {
            // A. Master Trips & SLA Targets (EXACT MATCH FOR J&T EXPRESS OFFICIAL SLA EXCEL DATABASE)
            const initialMasterTrips = [
                { code: "BDO CDD", rute: "JAKARTA - BANDUNG", tlc: "BANDUNG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 5.5, targetSLAReturnHours: 5.5, targetSLARoundtripHours: 11.0, status: "ACTIVE" },
                { code: "BDO FUSO", rute: "JAKARTA - BANDUNG", tlc: "BANDUNG", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 5.5, targetSLAReturnHours: 4.5, targetSLARoundtripHours: 11.0, status: "ACTIVE" },
                { code: "TKG FUSO", rute: "JAKARTA - LAMPUNG", tlc: "LAMPUNG", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 13.5, targetSLAReturnHours: 13.5, targetSLARoundtripHours: 27.0, status: "ACTIVE" },
                { code: "TKG CDD", rute: "JAKARTA - LAMPUNG", tlc: "LAMPUNG", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 11.0, targetSLAReturnHours: 11.0, targetSLARoundtripHours: 22.0, status: "ACTIVE" },
                { code: "SRG CDD", rute: "JAKARTA - SEMARANG", tlc: "SEMARANG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 12.5, targetSLAReturnHours: 12.5, targetSLARoundtripHours: 25.0, status: "ACTIVE" },
                { code: "SRG FUSO", rute: "JAKARTA - SEMARANG", tlc: "SEMARANG", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 14.0, targetSLAReturnHours: 14.0, targetSLARoundtripHours: 28.0, status: "ACTIVE" },
                { code: "PLM CDD", rute: "JAKARTA - PALEMBANG", tlc: "PALEMBANG", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 19.67, targetSLAReturnHours: 19.67, targetSLARoundtripHours: 39.33, status: "ACTIVE" },
                { code: "PLM FUSO", rute: "JAKARTA - PALEMBANG", tlc: "PALEMBANG", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 19.67, targetSLAReturnHours: 19.67, targetSLARoundtripHours: 39.33, status: "ACTIVE" },
                { code: "SOC CDD", rute: "JAKARTA - SOLO", tlc: "SOLO", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 15.5, targetSLAReturnHours: 15.5, targetSLARoundtripHours: 31.0, status: "ACTIVE" },
                { code: "SOC FUSO", rute: "JAKARTA - SOLO", tlc: "SOLO", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 15.5, targetSLAReturnHours: 15.5, targetSLARoundtripHours: 31.0, status: "ACTIVE" },
                { code: "JOG CDD", rute: "JAKARTA - YOGYAKARTA", tlc: "YOGYAKARTA", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 16.0, targetSLAReturnHours: 16.0, targetSLARoundtripHours: 32.0, status: "ACTIVE" },
                { code: "JOG FUSO", rute: "JAKARTA - YOGYAKARTA", tlc: "YOGYAKARTA", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "PMH CDD", rute: "JAKARTA - PRABUMULIH", tlc: "PRABUMULIH", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 21.0, targetSLAReturnHours: 21.0, targetSLARoundtripHours: 42.0, status: "ACTIVE" },
                { code: "PMH FUSO", rute: "JAKARTA - PRABUMULIH", tlc: "PRABUMULIH", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 21.0, targetSLAReturnHours: 21.0, targetSLARoundtripHours: 42.0, status: "ACTIVE" },
                { code: "SUB CDD", rute: "JAKARTA - SURABAYA", tlc: "SURABAYA", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 19.0, targetSLAReturnHours: 18.0, targetSLARoundtripHours: 38.0, status: "ACTIVE" },
                { code: "SUB FUSO", rute: "JAKARTA - SURABAYA", tlc: "SURABAYA", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 23.0, targetSLAReturnHours: 19.0, targetSLARoundtripHours: 46.0, status: "ACTIVE" },
                { code: "BKS CDD", rute: "JAKARTA - BENGKULU", tlc: "BENGKULU", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 44.0, targetSLAReturnHours: 44.0, targetSLARoundtripHours: 88.0, status: "ACTIVE" },
                { code: "BKS FUSO", rute: "JAKARTA - BENGKULU", tlc: "BENGKULU", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 44.0, targetSLAReturnHours: 44.0, targetSLARoundtripHours: 88.0, status: "ACTIVE" },
                { code: "DJB CDD", rute: "JAKARTA - JAMBI", tlc: "JAMBI", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 21.0, targetSLAReturnHours: 21.0, targetSLARoundtripHours: 42.0, status: "ACTIVE" },
                { code: "DJB FUSO", rute: "JAKARTA - JAMBI", tlc: "JAMBI", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 33.0, targetSLAReturnHours: 33.0, targetSLARoundtripHours: 66.0, status: "ACTIVE" },
                { code: "LLG CDD", rute: "JAKARTA - LUBUKLINGGAU", tlc: "LUBUKLINGGAU", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 23.0, targetSLAReturnHours: 23.0, targetSLARoundtripHours: 46.0, status: "ACTIVE" },
                { code: "LLG FUSO", rute: "JAKARTA - LUBUKLINGGAU", tlc: "LUBUKLINGGAU", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 23.0, targetSLAReturnHours: 23.0, targetSLARoundtripHours: 46.0, status: "ACTIVE" },
                { code: "PKU CDD", rute: "JAKARTA - PEKANBARU", tlc: "PEKANBARU", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 54.0, targetSLAReturnHours: 54.0, targetSLARoundtripHours: 108.0, status: "ACTIVE" },
                { code: "PKU FUSO", rute: "JAKARTA - PEKANBARU", tlc: "PEKANBARU", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 54.0, targetSLAReturnHours: 54.0, targetSLARoundtripHours: 108.0, status: "ACTIVE" },
                { code: "PDG CDD", rute: "JAKARTA - PADANG", tlc: "PADANG", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 49.0, targetSLAReturnHours: 49.0, targetSLARoundtripHours: 98.0, status: "ACTIVE" },
                { code: "PDG FUSO", rute: "JAKARTA - PADANG", tlc: "PADANG", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 49.0, targetSLAReturnHours: 49.0, targetSLARoundtripHours: 98.0, status: "ACTIVE" },
                { code: "RPT CDD", rute: "JAKARTA - RANTAUPRAPAT", tlc: "RANTAUPRAPAT", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 48.0, targetSLAReturnHours: 48.0, targetSLARoundtripHours: 96.0, status: "ACTIVE" },
                { code: "RPT FUSO", rute: "JAKARTA - RANTAUPRAPAT", tlc: "RANTAUPRAPAT", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 50.0, targetSLAReturnHours: 50.0, targetSLARoundtripHours: 100.0, status: "ACTIVE" },
                { code: "MES CDD", rute: "JAKARTA - MEDAN", tlc: "MEDAN", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 71.0, targetSLAReturnHours: 71.0, targetSLARoundtripHours: 142.0, status: "ACTIVE" },
                { code: "MES FUSO", rute: "JAKARTA - MEDAN", tlc: "MEDAN", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 71.0, targetSLAReturnHours: 71.0, targetSLARoundtripHours: 142.0, status: "ACTIVE" },
                { code: "BTJ CDD", rute: "JAKARTA - ACEH", tlc: "ACEH", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 62.0, targetSLAReturnHours: 62.0, targetSLARoundtripHours: 124.0, status: "ACTIVE" },
                { code: "BTJ FUSO", rute: "JAKARTA - ACEH", tlc: "ACEH", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 63.0, targetSLAReturnHours: 63.0, targetSLARoundtripHours: 126.0, status: "ACTIVE" },
                { code: "GSK CDD", rute: "JAKARTA - GRESIK", tlc: "GRESIK", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 19.0, targetSLAReturnHours: 19.0, targetSLARoundtripHours: 38.0, status: "ACTIVE" },
                { code: "GSK FUSO", rute: "JAKARTA - GRESIK", tlc: "GRESIK", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 19.0, targetSLAReturnHours: 19.0, targetSLARoundtripHours: 38.0, status: "ACTIVE" },
                { code: "TGR CDD", rute: "JAKARTA - TANGERANG", tlc: "TANGERANG", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 0.5, targetSLAReturnHours: 0.5, targetSLARoundtripHours: 1.0, status: "ACTIVE" },
                { code: "TGR FUSO", rute: "JAKARTA - TANGERANG", tlc: "TANGERANG", layanan: "FUSO", wilayah: "JABODETABEK", targetSLAOutboundHours: 0.5, targetSLAReturnHours: 0.5, targetSLARoundtripHours: 1.0, status: "ACTIVE" },
                { code: "DPK CDD", rute: "JAKARTA - DEPOK", tlc: "DEPOK", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.0, targetSLAReturnHours: 2.0, targetSLARoundtripHours: 4.0, status: "ACTIVE" },
                { code: "DPK FUSO", rute: "JAKARTA - DEPOK", tlc: "DEPOK", layanan: "FUSO", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.0, targetSLAReturnHours: 2.0, targetSLARoundtripHours: 4.0, status: "ACTIVE" },
                { code: "BGR CDD", rute: "JAKARTA - BOGOR", tlc: "BOGOR", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.0, targetSLAReturnHours: 2.0, targetSLARoundtripHours: 4.0, status: "ACTIVE" },
                { code: "BGR FUSO", rute: "JAKARTA - BOGOR", tlc: "BOGOR", layanan: "FUSO", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.5, targetSLAReturnHours: 2.5, targetSLARoundtripHours: 5.0, status: "ACTIVE" },
                { code: "BKI FUSO", rute: "JAKARTA - BEKASI", tlc: "BEKASI", layanan: "FUSO", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.0, targetSLAReturnHours: 2.0, targetSLARoundtripHours: 4.0, status: "ACTIVE" },
                { code: "BKI CDD", rute: "JAKARTA - BEKASI", tlc: "BEKASI", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.0, targetSLAReturnHours: 2.0, targetSLARoundtripHours: 4.0, status: "ACTIVE" },
                { code: "CKR CDD", rute: "JAKARTA - CIKARANG", tlc: "CIKARANG", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 2.83, targetSLAReturnHours: 2.83, targetSLARoundtripHours: 5.67, status: "ACTIVE" },
                { code: "SEG CDD", rute: "JAKARTA - SERANG", tlc: "SERANG", layanan: "CDD", wilayah: "BANTEN", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
                { code: "SEG FUSO", rute: "JAKARTA - SERANG", tlc: "SERANG", layanan: "FUSO", wilayah: "BANTEN", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
                { code: "JAT CDD", rute: "JAKARTA - JAT", tlc: "JAT", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
                { code: "SMI CDD", rute: "JAKARTA - SUKABUMI", tlc: "SUKABUMI", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 6.0, targetSLAReturnHours: 6.0, targetSLARoundtripHours: 12.0, status: "ACTIVE" },
                { code: "TSK CDD", rute: "JAKARTA - TASIKMALAYA", tlc: "TASIKMALAYA", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 10.0, targetSLAReturnHours: 10.0, targetSLARoundtripHours: 20.0, status: "ACTIVE" },
                { code: "TSK FUSO", rute: "JAKARTA - TASIKMALAYA", tlc: "TASIKMALAYA", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 10.0, targetSLAReturnHours: 10.0, targetSLARoundtripHours: 20.0, status: "ACTIVE" },
                { code: "CRN CDD", rute: "JAKARTA - CIREBON", tlc: "CIREBON", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 8.5, targetSLAReturnHours: 8.5, targetSLARoundtripHours: 17.0, status: "ACTIVE" },
                { code: "CKP CDD", rute: "JAKARTA - CIKAMPEK", tlc: "CIKAMPEK", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 4.5, targetSLAReturnHours: 4.5, targetSLARoundtripHours: 9.0, status: "ACTIVE" },
                { code: "PTI CDD", rute: "JAKARTA - PATI", tlc: "PATI", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 14.0, targetSLAReturnHours: 14.0, targetSLARoundtripHours: 28.0, status: "ACTIVE" },
                { code: "PWO CDD", rute: "JAKARTA - PURWOKERTO", tlc: "PURWOKERTO", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 12.5, targetSLAReturnHours: 12.5, targetSLARoundtripHours: 25.0, status: "ACTIVE" },
                { code: "MDN CDD", rute: "JAKARTA - MADIUN", tlc: "MADIUN", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "MDN FUSO", rute: "JAKARTA - MADIUN", tlc: "MADIUN", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "KDR CDD", rute: "JAKARTA - KEDIRI", tlc: "KEDIRI", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 14.0, targetSLAReturnHours: 14.0, targetSLARoundtripHours: 28.0, status: "ACTIVE" },
                { code: "KDR FUSO", rute: "JAKARTA - KEDIRI", tlc: "KEDIRI", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 16.0, targetSLAReturnHours: 16.0, targetSLARoundtripHours: 32.0, status: "ACTIVE" },
                { code: "MLG CDD", rute: "JAKARTA - MALANG", tlc: "MALANG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 21.0, targetSLAReturnHours: 21.0, targetSLARoundtripHours: 42.0, status: "ACTIVE" },
                { code: "TGL CDD", rute: "JAKARTA - TEGAL", tlc: "TEGAL", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 9.0, targetSLAReturnHours: 9.0, targetSLARoundtripHours: 18.0, status: "ACTIVE" },
                { code: "BAL CDD", rute: "JAKARTA - BALARAJA", tlc: "BALARAJA", layanan: "CDD", wilayah: "BANTEN", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
                { code: "DPS CDD", rute: "JAKARTA - DENPASAR", tlc: "DENPASAR", layanan: "CDD", wilayah: "BALI", targetSLAOutboundHours: 40.0, targetSLAReturnHours: 40.0, targetSLARoundtripHours: 80.0, status: "ACTIVE" },
                { code: "DPS FUSO", rute: "JAKARTA - DENPASAR", tlc: "DENPASAR", layanan: "FUSO", wilayah: "BALI", targetSLAOutboundHours: 43.0, targetSLAReturnHours: 43.0, targetSLARoundtripHours: 86.0, status: "ACTIVE" },
                { code: "WRG CDD", rute: "JAKARTA - WARINGIN", tlc: "WARINGIN", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 1.0, targetSLAReturnHours: 1.0, targetSLARoundtripHours: 2.0, status: "ACTIVE" },
                { code: "WRG FUSO", rute: "JAKARTA - WARINGIN", tlc: "WARINGIN", layanan: "FUSO", wilayah: "JABODETABEK", targetSLAOutboundHours: 1.25, targetSLAReturnHours: 1.25, targetSLARoundtripHours: 2.5, status: "ACTIVE" },
                { code: "SDP CDD", rute: "JAKARTA - SDP", tlc: "SDP", layanan: "CDD", wilayah: "JABODETABEK", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
                { code: "SDP FUSO", rute: "JAKARTA - SDP", tlc: "SDP", layanan: "FUSO", wilayah: "JABODETABEK", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
                { code: "JBR CDD", rute: "JAKARTA - JEMBER", tlc: "JEMBER", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 29.0, targetSLAReturnHours: 29.0, targetSLARoundtripHours: 58.0, status: "ACTIVE" },
                { code: "JBR FUSO", rute: "JAKARTA - JEMBER", tlc: "JEMBER", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 29.0, targetSLAReturnHours: 29.0, targetSLARoundtripHours: 58.0, status: "ACTIVE" },
                { code: "MDR CDD", rute: "JAKARTA - MADURA", tlc: "MADURA", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "MDR FUSO", rute: "JAKARTA - MADURA", tlc: "MADURA", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "PRO CDD", rute: "JAKARTA - PROBOLINGGO", tlc: "PROBOLINGGO", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 22.0, targetSLAReturnHours: 22.0, targetSLARoundtripHours: 44.0, status: "ACTIVE" },
                { code: "LMG CDD", rute: "JAKARTA - LAMONGAN", tlc: "LAMONGAN", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 19.5, targetSLAReturnHours: 19.5, targetSLARoundtripHours: 39.0, status: "ACTIVE" },
                { code: "BTN FUSO", rute: "JAKARTA - BANTEN", tlc: "BANTEN", layanan: "FUSO", wilayah: "BANTEN", targetSLAOutboundHours: 3.0, targetSLAReturnHours: 3.0, targetSLARoundtripHours: 6.0, status: "ACTIVE" },
                { code: "BTN CDD", rute: "JAKARTA - BANTEN", tlc: "BANTEN", layanan: "CDD", wilayah: "BANTEN", targetSLAOutboundHours: 2.5, targetSLAReturnHours: 2.5, targetSLARoundtripHours: 5.0, status: "ACTIVE" },
                { code: "TKG KONTAINER", rute: "JAKARTA - LAMPUNG", tlc: "LAMPUNG", layanan: "KONTAINER", wilayah: "SUMATERA", targetSLAOutboundHours: 13.0, targetSLAReturnHours: 13.0, targetSLARoundtripHours: 26.0, status: "ACTIVE" },
                { code: "PLM KONTAINER", rute: "JAKARTA - PALEMBANG", tlc: "PALEMBANG", layanan: "KONTAINER", wilayah: "SUMATERA", targetSLAOutboundHours: 19.75, targetSLAReturnHours: 19.75, targetSLARoundtripHours: 39.5, status: "ACTIVE" },
                { code: "SUB KONTAINER", rute: "JAKARTA - SURABAYA", tlc: "SURABAYA", layanan: "KONTAINER", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "MDN KONTAINER", rute: "JAKARTA - MADIUN", tlc: "MADIUN", layanan: "KONTAINER", wilayah: "JAWA", targetSLAOutboundHours: 20.0, targetSLAReturnHours: 20.0, targetSLARoundtripHours: 40.0, status: "ACTIVE" },
                { code: "CIM CDD", rute: "JAKARTA - CIMAHI", tlc: "CIMAHI", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 4.5, targetSLAReturnHours: 4.5, targetSLARoundtripHours: 9.0, status: "ACTIVE" },
                { code: "CIM FUSO", rute: "JAKARTA - CIMAHI", tlc: "CIMAHI", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 5.5, targetSLAReturnHours: 5.5, targetSLARoundtripHours: 11.0, status: "ACTIVE" }
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

            // B2. Master Vendors (13 Official Vendors)
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
                { code: "MTI", nama: "PT. MEDIA TRANS INDO (MTI)", status: "AKTIF" },
                { code: "LNP", nama: "LNP", status: "AKTIF" },
                { code: "FASTRANS", nama: "PT. FASTRANS LOGISTIK INDONESIA (FASTRANS)", status: "AKTIF" }
            ];

            // Registri singkatan vendor terpusat — dipakai oleh semua modul
            JNTFirebaseService._vendorMap = {
                SERYU: "PT. SERIKAT HANTAR EKSPEDISI (SERYU)",
                APL: "PT. ASIA PASIFIK LOGISTIK (APL)",
                KLS: "PT. KENCANA LOGISTIK SAMUDERA (KLS)",
                JTS: "PT. JET TRANSPORT SERVICES (JTS)",
                CHIJUN: "PT CHIJUN SMART FREIGHT (CHIJUN)",
                PAL: "PT. PESONA ABADI LOGISTIK (PAL)",
                AB: "PT ANUGERAH BERSATU (AB)",
                SOLUSI: "PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)",
                REYA: "PT. REYA BAHAGIA ABADI (REYA)",
                SDE: "PT. SOLUSI DUNIA EXPEDISI (SDE)",
                MTI: "PT. MEDIA TRANS INDO (MTI)",
                LNP: "LNP",
                FASTRANS: "PT. FASTRANS LOGISTIK INDONESIA (FASTRANS)"
            };
            JNTFirebaseService._vendorList = initialVendors;

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
                { username: "farizs", fullname: "Farizs Hakim", email: "farizs.hakim@jtexpress.co.id", phone: "0812-3456-7890", role: "Super Admin", tlc: "Head Office", status: "Aktif", createdAt: "2026-06-10 14:25" }
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
            const realOps = this.getRealOperatorNames();
            const op2Initial = realOps.find(n => n.toLowerCase() !== "farizs hakim") || realOps[0] || "Farizs Hakim";
            const activeShiftObj = {
                shiftId: "SHIFT-20261111-01",
                tanggal: new Date().toISOString().slice(0, 10),
                namaShift: "Shift 1 (08:30 - 20:30 WIB)",
                status: "AKTIF",
                jamMulai: "08:30",
                jamSelesai: "20:30",
                operator1: { nama: "Farizs Hakim", role: "Operator Utama", tugas: "Monitoring 4 Jam" },
                operator2: { nama: op2Initial, role: "Operator Pendamping", tugas: "SLA" }
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
                    dilaporkanOleh: "Farizs Hakim",
                    status: "DALAM PENANGANAN",
                    shiftId: "SHIFT-20261111-01",
                    createdAt: new Date().toISOString(),
                    history: [
                        {
                            time: "02/10/2026 10:35",
                            note: "Laporan insiden ban pecah diterima dari driver.",
                            status: "OPEN",
                            user: "Farizs Hakim"
                        },
                        {
                            time: "02/10/2026 10:45",
                            note: "Tim mekanik rekanan vendor meluncur ke lokasi kejadian.",
                            status: "DALAM PENANGANAN",
                            user: "Farizs Hakim"
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
                    dilaporkanOleh: "Rina Marlina",
                    status: "SUDAH SELESAI",
                    shiftId: "SHIFT-20261111-01",
                    createdAt: new Date().toISOString(),
                    history: [
                        {
                            time: "01/10/2026 23:15",
                            note: "Armada berhenti di Rest Area 208 karena indikator suhu mesin tinggi.",
                            status: "OPEN",
                            user: "Rina Marlina"
                        },
                        {
                            time: "02/10/2026 00:20",
                            note: "Mesin telah dingin dan air radiator diisi ulang. Unit melanjutkan perjalanan normal.",
                            status: "SUDAH SELESAI",
                            user: "Rina Marlina"
                        }
                    ]
                }
            ];

            // G. Clean up any legacy seeded demo data (NO DUMMY DATA IN PRODUCTION)
            this._purgeLegacyDemoData();

            // H. Seed Initial Transactions & Incidents — DISABLED (100% REAL USER DATA ONLY)
            const IS_DEMO_MODE = false;
            if (IS_DEMO_MODE && this.getLocalStore('incoming').length === 0) {
                const initialIncoming = [
                    {
                        kodeTugas: "DBGX2610020001",
                        trip: "JOG CDD",
                        tlc: "JOG CDD",
                        namaRute: "JAKARTA - YOGYA",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9134 PXX",
                        vendor: "PT. SERIKAT HANTAR EKSPEDISI (SERYU)",
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
                        inputBy: "Farizs Hakim",
                        shiftId: "SHIFT-20261111-01"
                    },
                    {
                        kodeTugas: "DBGX2610020002",
                        trip: "SRG FUSO",
                        tlc: "SRG FUSO",
                        namaRute: "JAKARTA - SEMARANG",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9041 SXX",
                        vendor: "PT. ASIA PASIFIK LOGISTIK (APL)",
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
                        inputBy: "Rina Marlina",
                        shiftId: "SHIFT-20261111-01"
                    },
                    {
                        kodeTugas: "DBGX2610020003",
                        trip: "BDG CDD",
                        tlc: "BDG CDD",
                        namaRute: "JAKARTA - BANDUNG",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9201 TXX",
                        vendor: "PT. SOLUSI DUNIA EXPEDISI (SDE)",
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
                        inputBy: "Farizs Hakim",
                        shiftId: "SHIFT-20261111-01"
                    },
                    {
                        kodeTugas: "DBGX2610020004",
                        trip: "PLM FUSO",
                        tlc: "PLM FUSO",
                        namaRute: "JAKARTA - PALEMBANG",
                        tripType: "ADD",
                        wilayah: "SUMATERA",
                        platNomor: "B 9356 PKK",
                        vendor: "PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)",
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
                        inputBy: "Farizs Hakim",
                        shiftId: "SHIFT-20261111-01"
                    },
                    {
                        kodeTugas: "DBGX2610020005",
                        trip: "SUB FUSO",
                        tlc: "SUB FUSO",
                        namaRute: "JAKARTA - SURABAYA",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9812 WXX",
                        vendor: "PT. JET TRANSPORT SERVICES (JTS)",
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
                        inputBy: "Rina Marlina",
                        shiftId: "SHIFT-20261111-01"
                    },
                    {
                        kodeTugas: "DBGX2610020006",
                        trip: "TKG CDD",
                        tlc: "TKG CDD",
                        namaRute: "JAKARTA - LAMPUNG",
                        tripType: "ADD",
                        wilayah: "SUMATERA",
                        platNomor: "B 9400 ERR",
                        vendor: "PT. PESONA ABADI LOGISTIK (PAL)",
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
                        inputBy: "Farizs Hakim",
                        shiftId: "SHIFT-20261111-01"
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
                        vendor: item.vendor,
                        driver1: item.driver1,
                        driver2: item.driver2,
                        totalAwb: item.totalAwb || 0,
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

                    // Monitoring 4H Record (sinkron langsung saat inisialisasi)
                    const slotKeys24 = this.getMonitoringSlotKeys();
                    const depSlotIdx = this.getDepartureSlotIndex(item.jamBerangkat);
                    const departureSlotKey = slotKeys24[depSlotIdx] || '00:00';
                    const initialSlots = {};
                    slotKeys24.forEach(k => { initialSlots[k] = null; });
                    if (item.jamBerangkat) {
                        initialSlots[departureSlotKey] = {
                            lokasi: "OUT JKT999",
                            keterangan: "Keberangkatan Awal",
                            jenisUpdate: "Lokasi Normal",
                            jamUpdateAktual: item.jamBerangkat,
                            inputBy: item.inputBy,
                            shiftId: item.shiftId,
                            statusUpdate: "SUDAH UPDATE"
                        };
                    }

                    await this.saveDoc('monitoring_4h', item.kodeTugas, {
                        kodeTugas: item.kodeTugas,
                        tanggalMonitoring: item.jamBerangkat ? item.jamBerangkat.split(' ')[0] : new Date().toISOString().split('T')[0],
                        trip: item.trip,
                        namaRute: item.namaRute,
                        platNomor: item.platNomor,
                        vendor: item.vendor,
                        driver1: item.driver1,
                        jamBerangkat: item.jamBerangkat || "",
                        slots: initialSlots,
                        lastUpdateSlot: departureSlotKey,
                        lastUpdateLokasi: "OUT JKT999",
                        lastUpdateTime: item.jamBerangkat || "",
                        lastUpdateBy: item.inputBy,
                        statusPerjalanan: item.status === 'SUDAH SELESAI' ? 'COMPLETED' : (item.status === 'KENDALA' ? 'KENDALA' : 'ON PROGRESS')
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
    /**
     * Normalisasi nama vendor ke 12 Vendor Resmi J&T Express.
     * Jika vendor tidak dikenal / kosong, coba lookup dari plat nomor di master_fleets.
     */
    /**
     * Normalisasi nama vendor ke 12 Vendor Resmi J&T Express atau vendor yang tertera di Excel.
     * Tidak pernah menimpa vendor 3PL menjadi 'J&T Express'.
     */
    _purgeLegacyDemoData() {
        const DEMO_TRIP_IDS = new Set([
            'DBGX2610020001', 'DBGX2610020002', 'DBGX2610020003',
            'DBGX2610020004', 'DBGX2610020005', 'DBGX2610020006',
            '4234234', 'DBDBDBDB'
        ]);
        const DEMO_TROUBLE_IDS = new Set(['INC-20261002-01', 'INC-20261001-02']);

        ['incoming', 'sla_outbound', 'sla_roundtrip', 'monitoring_4h'].forEach(col => {
            const list = this.getLocalStore(col) || [];
            const filtered = list.filter(item => !DEMO_TRIP_IDS.has(item.kodeTugas || item.id));
            if (filtered.length !== list.length) {
                this.saveLocalStore(col, filtered);
            }
            if (window.db) {
                DEMO_TRIP_IDS.forEach(id => {
                    window.db.collection(col).doc(id).delete().catch(() => { });
                });
            }
        });

        const trList = this.getLocalStore('troubles') || [];
        const trFiltered = trList.filter(item => !DEMO_TROUBLE_IDS.has(item.incidentId || item.id) && !DEMO_TRIP_IDS.has(item.kodeTugas));
        if (trFiltered.length !== trList.length) {
            this.saveLocalStore('troubles', trFiltered);
        }
        if (window.db) {
            DEMO_TROUBLE_IDS.forEach(id => {
                window.db.collection('troubles').doc(id).delete().catch(() => { });
            });
        }
    },

    /**
     * Normalisasi & Perbaikan Otomatis Timestamp Kedatangan (jamSampaiAktual) terhadap jamBerangkat.
     * Memperbaiki kasus di mana file Excel Monitoring 4H di-upload pada hari berbeda tanpa kolom tanggal berangkat,
     * sehingga tanggal jamSampaiAktual tercatat sebagai tanggal upload (selisih > 7 hari dari jamBerangkat).
     */
    normalizeArrivalAgainstDeparture(jamBerangkatStr, jamSampaiStr, targetSLAHours = 16, monSlots = null) {
        if (!jamSampaiStr) return '';
        const cleanArr = String(jamSampaiStr).trim();
        if (!cleanArr || /^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(cleanArr)) {
            return '';
        }
        if (!jamBerangkatStr || !window.SLACountdownEngine) return cleanArr;

        const depDate = window.SLACountdownEngine.parseTimestamp(jamBerangkatStr);
        const arrDate = window.SLACountdownEngine.parseTimestamp(cleanArr);
        if (!depDate || !arrDate) return cleanArr;

        const diffMs = arrDate.getTime() - depDate.getTime();
        const maxReasonableMs = 7 * 24 * 3600 * 1000; // 7 hari (maksimum slot monitoring 4H)

        // Jika tanggal sampai melompat > 7 hari atau < 0 (karena tanggal upload dipakai saat import slot 4H)
        if (diffMs > maxReasonableMs || diffMs < 0) {
            // Hitung estimasi dayOffset dari slot IN di monitoring_4h atau dari targetSLAHours
            let dayOffset = 0;
            if (monSlots && typeof monSlots === 'object') {
                for (const [sk, sVal] of Object.entries(monSlots)) {
                    if (sVal && sVal.lokasi) {
                        const uLoc = String(sVal.lokasi).toUpperCase();
                        if (!uLoc.startsWith('OUT') && (uLoc.startsWith('IN') || uLoc.includes('SAMPAI') || sVal.jenisUpdate === 'Sampai')) {
                            const dm = sk.match(/^D(\d+)_/i);
                            if (dm) dayOffset = Math.max(0, parseInt(dm[1], 10) - 1);
                            break;
                        }
                    }
                }
            }

            const fixedArr = new Date(
                depDate.getFullYear(),
                depDate.getMonth(),
                depDate.getDate() + dayOffset,
                arrDate.getHours(),
                arrDate.getMinutes(),
                0
            );
            // Jika jam sampai pada hari yang sama ternyata lebih awal dari jam berangkat (berangkat malam, sampai besoknya)
            while (fixedArr.getTime() <= depDate.getTime()) {
                fixedArr.setDate(fixedArr.getDate() + 1);
            }
            const pad = n => String(n).padStart(2, '0');
            return `${pad(fixedArr.getMonth() + 1)}/${pad(fixedArr.getDate())}/${fixedArr.getFullYear()} ${pad(fixedArr.getHours())}:${pad(fixedArr.getMinutes())}`;
        }

        return this.formatStandardDateTime(cleanArr) || cleanArr;
    },

    normalizeVendorName(rawVendor, platNomor = '') {
        const raw = String(rawVendor || '').trim();
        const rawUpper = raw.toUpperCase();

        if (rawUpper) {
            if (rawUpper.includes('SERIKAT') || rawUpper.includes('SERYU')) {
                return 'PT. SERIKAT HANTAR EKSPEDISI (SERYU)';
            }
            if (rawUpper.includes('ASIA PASIFIK') || rawUpper.includes('APL')) {
                return 'PT. ASIA PASIFIK LOGISTIK (APL)';
            }
            if (rawUpper.includes('KENCANA') || rawUpper.includes('KLS')) {
                return 'PT. KENCANA LOGISTIK SAMUDERA (KLS)';
            }
            if (rawUpper.includes('MEDIA TRANS') || rawUpper.includes('MTI')) {
                return 'PT. MEDIA TRANS INDO (MTI)';
            }
            if (rawUpper.includes('CHIJUN')) {
                return 'PT CHIJUN SMART FREIGHT (CHIJUN)';
            }
            if (rawUpper.includes('SOLUSI DUNIA') || rawUpper.includes('SDE') || rawUpper.includes('(SDE)')) {
                return 'PT. SOLUSI DUNIA EXPEDISI (SDE)';
            }
            if (rawUpper.includes('SOLUSI TRANSPORTASI') || rawUpper === 'SOLUSI' || rawUpper.includes('(SOLUSI)')) {
                return 'PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)';
            }
            if (rawUpper.includes('JET TRANSPORT') || rawUpper.includes('JTS')) {
                return 'PT. JET TRANSPORT SERVICES (JTS)';
            }
            if (rawUpper.includes('ANUGERAH') || /\bAB\b/.test(rawUpper) || rawUpper.includes('(AB)')) {
                return 'PT ANUGERAH BERSATU (AB)';
            }
            if (rawUpper.includes('REYA')) {
                return 'PT. REYA BAHAGIA ABADI (REYA)';
            }
            if (rawUpper.includes('PESONA') || rawUpper.includes('PAL') || rawUpper.includes('(PAL)')) {
                return 'PT. PESONA ABADI LOGISTIK (PAL)';
            }
            if (rawUpper === 'LNP' || rawUpper.includes('LNP')) {
                return 'LNP';
            }
            if (rawUpper.includes('FASTRANS')) {
                return 'PT. FASTRANS LOGISTIK INDONESIA (FASTRANS)';
            }
            // Jika nama vendor ada di Excel dan BUKAN J&T / Global Jet, pertahankan nama vendor tersebut!
            if (!rawUpper.includes('JNT') && !rawUpper.includes('J&T') && !rawUpper.includes('GLOBAL JET') && rawUpper !== '-' && rawUpper !== 'NULL' && rawUpper !== 'UNDEFINED' && raw.toLowerCase() !== 'semua vendor') {
                return raw;
            }
        }

        // Cek Lookup Plat Nomor jika vendor di Excel kosong atau berisi teks J&T
        const fleetVendor = this.getFleetVendorByPlat(platNomor);
        if (fleetVendor) return fleetVendor;

        // Jika raw adalah nama custom lain dari Excel
        if (raw && raw !== '-' && raw !== 'null' && raw !== 'undefined' && raw.toLowerCase() !== 'semua vendor' && !rawUpper.includes('JNT') && !rawUpper.includes('J&T') && !rawUpper.includes('GLOBAL JET')) {
            return raw;
        }

        // Fallback vendor 3PL resmi: SERYU (jangan pernah default ke 'J&T Express' untuk data vendor)
        return 'PT. SERIKAT HANTAR EKSPEDISI (SERYU)';
    },

    getFleetVendorByPlat(platNomor = '') {
        const platClean = String(platNomor || '').replace(/\s+/g, '').toUpperCase();
        if (!platClean) return '';
        const fleetMap = {
            'B9134PXX': 'PT. SERIKAT HANTAR EKSPEDISI (SERYU)',
            'B9041SXX': 'PT. ASIA PASIFIK LOGISTIK (APL)',
            'B9812BKN': 'PT. JET TRANSPORT SERVICES (JTS)',
            'B9812WXX': 'PT. JET TRANSPORT SERVICES (JTS)',
            'B9356PKK': 'PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)',
            'B9201SKK': 'PT. SOLUSI DUNIA EXPEDISI (SDE)',
            'B9201TXX': 'PT. SOLUSI DUNIA EXPEDISI (SDE)',
            'B9400ERR': 'PT. PESONA ABADI LOGISTIK (PAL)'
        };
        if (fleetMap[platClean]) return fleetMap[platClean];

        try {
            const fleets = this.getLocalStore('master_fleets') || [];
            if (!this._fleetVendorMapCache || this._fleetVendorMapLen !== fleets.length) {
                this._fleetVendorMapCache = new Map();
                this._fleetVendorMapLen = fleets.length;
                for (let idx = 0; idx < fleets.length; idx++) {
                    const f = fleets[idx];
                    const fp = String(f.platNomor || f.plat || f.nopol || '').replace(/\s+/g, '').toUpperCase();
                    if (fp && f.vendor && !f.vendor.toUpperCase().includes('JNT') && !f.vendor.toUpperCase().includes('J&T')) {
                        this._fleetVendorMapCache.set(fp, f.vendor);
                    }
                }
            }
            if (this._fleetVendorMapCache.has(platClean)) {
                return this._fleetVendorMapCache.get(platClean);
            }
        } catch (_) { }
        return '';
    },

    formatVendorShort(vStr) {
        if (!vStr) return 'SERYU';
        const v = String(vStr).trim();
        const match = v.match(/\(([^)]+)\)/);
        if (match && match[1]) return match[1].trim();

        const u = v.toUpperCase();
        if (u.includes('SERIKAT') || u.includes('SERYU')) return 'SERYU';
        if (u.includes('ASIA PASIFIK') || u.includes('APL')) return 'APL';
        if (u.includes('KENCANA') || u.includes('KLS')) return 'KLS';
        if (u.includes('JET TRANSPORT') || u.includes('JTS')) return 'JTS';
        if (u.includes('CHIJUN')) return 'CHIJUN';
        if (u.includes('PESONA') || u.includes('PAL')) return 'PAL';
        if (u.includes('ANUGERAH') || /\bAB\b/.test(u)) return 'AB';
        if (u.includes('SOLUSI TRANSPORTASI') || u === 'SOLUSI') return 'SOLUSI';
        if (u.includes('REYA')) return 'REYA';
        if (u.includes('SOLUSI DUNIA') || u.includes('SDE')) return 'SDE';
        if (u.includes('MEDIA TRANS') || u.includes('MTI')) return 'MTI';
        if (u === 'LNP' || u.includes('LNP')) return 'LNP';
        if (u.includes('FASTRANS')) return 'FASTRANS';

        // Jika custom vendor dari Excel
        const clean = v.replace(/^(PT\.|PT|CV\.|CV|UD\.)\s+/i, '').trim();
        const firstWord = clean.split(/\s+/)[0] || 'VENDOR';
        return firstWord.length <= 10 ? firstWord.toUpperCase() : firstWord.substring(0, 10).toUpperCase();
    },

    /**
     * Ekstraksi Driver & Nomor Telepon Driver secara cerdas.
     */
    extractDriverAndPhone(rawDriverText, explicitPhone = '') {
        let raw = String(rawDriverText || '').trim();
        let phone = String(explicitPhone || '').trim();
        let driver2 = '';
        let driver2Phone = '';

        // Bersihkan sisa tag HTML atau icon yang mungkin tersimpan
        if (raw.includes('<') && raw.includes('>')) {
            const phoneTagMatch = raw.match(/📞\s*([0-9+\s-]{7,})/);
            if (phoneTagMatch && !phone) {
                phone = phoneTagMatch[1].trim();
            }
            const cadTagMatch = raw.match(/Cad:\s*([^(<]+)(?:\(([^)]+)\))?/i);
            if (cadTagMatch && !driver2) {
                driver2 = cadTagMatch[1].trim();
                if (cadTagMatch[2]) driver2Phone = cadTagMatch[2].trim();
            }
            raw = raw.replace(/<[^>]+>/g, ' ').trim();
        }
        raw = raw.replace(/📞/g, '').trim();

        if (phone) {
            phone = phone.replace(/📞/g, '').trim();
            if (/tanpa|tidak ada/i.test(phone)) phone = '';
            const pMatch = phone.match(/(?:(?:\+?62[\s-]?)?0?8[0-9\s-]{7,15}|[0-9]{7,15})/);
            if (pMatch) phone = pMatch[0].trim();
        }

        // Hapus teks penanda tanpa nomor hp agar tidak menghalangi regex parsing
        raw = raw.replace(/\(\s*tanpa\s*(?:no\.?\s*)?(?:hp|telepon|wa|telp)\s*\)/gi, '').trim();
        raw = raw.replace(/\b(?:tanpa\s*(?:no\.?\s*)?(?:hp|telepon|wa|telp)|no\s*hp\s*tidak\s*ada)\b/gi, '').trim();

        if (raw.toLowerCase().includes('cad:') || raw.toLowerCase().includes('cadangan:')) {
            const parts = raw.split(/(?:\/|\n|\b)\s*(?:cad:|cadangan:)\s*/i);
            raw = parts[0].trim();
            if (parts[1]) {
                const d2Parsed = this.extractDriverAndPhone(parts[1], '');
                driver2 = d2Parsed.driver1;
                driver2Phone = d2Parsed.driverPhone;
            }
        }

        // Deteksi pemisah antar dua nama driver (misal: "Muslihin - Saiful", "Bayu / Yoga", "Januri & Joko", "Erwan dan Dani")
        if (!driver2) {
            const splitMatch = raw.match(/^([a-zA-Z\s.']{2,})\s*(?:&|\/|\bdan\b|\s+-\s+)\s*([a-zA-Z\s.']{2,}(?:[\s\d+-]*))$/i);
            if (splitMatch) {
                const p2 = splitMatch[2].trim();
                const p2Digits = p2.replace(/\D/g, '');
                // Pastikan bagian kedua bukan nomor telepon murni
                if (p2Digits.length < 7 || /[a-zA-Z]{3,}/.test(p2)) {
                    raw = splitMatch[1].trim();
                    const d2Parsed = this.extractDriverAndPhone(p2, '');
                    driver2 = d2Parsed.driver1;
                    driver2Phone = d2Parsed.driverPhone;
                }
            }
        }

        if (!phone && raw) {
            // 1. Pola kurung: "Nama (081234567890)" atau "Nama (+62 811-9650-9767)"
            const parenMatch = raw.match(/\(([^)]*(?:\+?62|08|\d{7,})[^)]*)\)/);
            if (parenMatch) {
                phone = parenMatch[1].trim();
                raw = raw.replace(parenMatch[0], '').trim();
            } else {
                // 2. Pemisah titik dua / slash / strip dengan nomor di kanan: "Nama : 0812..." atau "Nama:0812..."
                const sepMatch = raw.match(/^(.*?)\s*[:\/|-]\s*(\+?62[\s\d-]{7,}|08[\s\d-]{7,}|\d{7,})$/);
                if (sepMatch) {
                    raw = sepMatch[1].trim();
                    phone = sepMatch[2].trim();
                } else {
                    // 3. Nomor telepon di akhir kalimat tanpa pemisah: "Wandi +62 811-9650-9767" atau "M Ridwan 083807993276"
                    const endPhoneMatch = raw.match(/^(.*?)\s+((?:\+?62[\s-]?)?0?8[0-9\s-]{7,15}|08\d{8,12}|\+?62\d{9,13}|\d{7,15})$/);
                    if (endPhoneMatch) {
                        raw = endPhoneMatch[1].trim();
                        phone = endPhoneMatch[2].trim();
                    } else {
                        // 4. Nomor telepon di awal kalimat: "081234567890 Budi Santoso"
                        const startPhoneMatch = raw.match(/^((?:\+?62[\s-]?)?0?8[0-9\s-]{7,15}|08\d{8,12})\s+(.*?)$/);
                        if (startPhoneMatch) {
                            phone = startPhoneMatch[1].trim();
                            raw = startPhoneMatch[2].trim();
                        } else {
                            // 5. Pola newline: "12ASDA\n1432342"
                            const newlineParts = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                            if (newlineParts.length >= 2 && /^[\d+\s-]{7,}$/.test(newlineParts[1])) {
                                raw = newlineParts[0];
                                phone = newlineParts[1];
                            } else {
                                // 6. Fallback cerdas: ekstrak nomor telepon dari posisi manapun dalam string
                                const genMatch = raw.match(/((?:\+?62[\s-]?)?0?8[0-9\s-]{7,15}|\b08\d{8,12}\b|\b\d{9,15}\b)/);
                                if (genMatch) {
                                    phone = genMatch[0].trim();
                                    raw = raw.replace(genMatch[0], '').trim();
                                }
                            }
                        }
                    }
                }
            }
        }

        // Bersihkan sisa karakter pemisah di ujung nama driver
        raw = raw.replace(/^[:\/|\-\s]+|[:\/|\-\s]+$/g, '').trim();

        // Rapikan format spasi pada nomor telepon
        if (phone) {
            phone = phone.replace(/^[:\/|\-\s]+|[:\/|\-\s]+$/g, '').replace(/\s+/g, ' ').trim();
        }

        // Fallback: Jika nomor telepon masih kosong, cari di master_drivers (O(1) Map cache)
        if (!phone && raw && raw !== '-') {
            try {
                const masterDrivers = this.getLocalStore('master_drivers') || [];
                if (!this._driverPhoneMapCache || this._driverPhoneMapLen !== masterDrivers.length) {
                    this._driverPhoneMapCache = new Map();
                    this._driverPhoneMapLen = masterDrivers.length;
                    for (let idx = 0; idx < masterDrivers.length; idx++) {
                        const d = masterDrivers[idx];
                        const mdNama = String(d.nama || d.name || d.driverName || '').toLowerCase().trim();
                        const mdPhone = d.phone || d.noHp || d.telepon || d.noWa || d.whatsapp || '';
                        if (mdNama && mdPhone) this._driverPhoneMapCache.set(mdNama, mdPhone);
                    }
                }
                const cleanDriver = raw.toLowerCase().trim();
                if (this._driverPhoneMapCache.has(cleanDriver)) {
                    phone = this._driverPhoneMapCache.get(cleanDriver);
                }
            } catch (_) { }
        }

        return {
            driver1: raw || '-',
            driverPhone: phone || '',
            driver2: driver2,
            driver2Phone: driver2Phone
        };
    },

    parseDriverAndPhone(rawDriver1, rawPhone1 = '', rawDriver2 = '', rawPhone2 = '') {
        const d1 = this.extractDriverAndPhone(rawDriver1, rawPhone1);
        const d2 = (rawDriver2 || rawPhone2) ? this.extractDriverAndPhone(rawDriver2, rawPhone2) : { driver1: '', driverPhone: '' };
        return {
            name: d1.driver1,
            phone: d1.driverPhone,
            driver1: d1.driver1,
            driverPhone: d1.driverPhone,
            driver2: d2.driver1 === '-' ? '' : (d2.driver1 || d1.driver2 || ''),
            driver2Phone: d2.driverPhone || d1.driver2Phone || ''
        };
    },

    /**
     * Format nomor HP Indonesia standar rapi bertanda hubung:
     * - 082152738262 -> 0821-5273-8262
     * - +62 811-9650-9767 -> 0811-9650-9767
     * - 6281196509767 -> 0811-9650-9767
     * Normalisasi nomor berawalan 628... menjadi 08... agar ringkas, seragam, dan muat di dalam badge sel tabel tanpa overflow.
     */
    formatPhoneNumber(rawPhone) {
        if (!rawPhone || rawPhone === '-') return '';
        let p = String(rawPhone).trim();
        p = p.replace(/📞/g, '').trim();
        let digits = p.replace(/\D/g, '');
        if (!digits) return p;

        // Normalisasi nomor Indonesia yang berawalan 628... menjadi 08...
        if (digits.startsWith('62') && digits.length >= 10) {
            digits = '0' + digits.slice(2);
        }

        if (digits.startsWith('08')) {
            if (digits.length <= 10) {
                return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
            } else if (digits.length === 11) {
                return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
            } else if (digits.length >= 12) {
                return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
            }
        }

        if (digits.length >= 7 && digits.length <= 9) {
            return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        }

        return p;
    },

    /**
     * Format Driver & Kontak HTML dengan tata letak rapi bertingkat & badge nomor telepon biru/cyan.
     * 100% Real Data: Hanya menampilkan Driver 1, Driver 2 (Cadangan), dan Nomor Telepon asli dari database/Excel
     * tanpa pernah meng-generate nama driver dummy atau nomor telepon dummy.
     */
    formatDriverDisplay(rawDriver, explicitPhone = '', explicitDriver2 = '', explicitDriver2Phone = '') {
        const info = this.extractDriverAndPhone(rawDriver, explicitPhone);
        let d1Name = info.driver1 || '-';
        let d1PhoneRaw = info.driverPhone || '';
        let d2Name = explicitDriver2 || info.driver2 || '';
        let d2PhoneRaw = explicitDriver2Phone || info.driver2Phone || '';

        if (!d2Name || d2Name === '-' || /^(belum|kosong|null|undefined|none|tidak ada)$/i.test(String(d2Name).trim())) {
            d2Name = '';
        }
        if (!d1PhoneRaw || d1PhoneRaw === '-' || /^(belum|kosong|null|undefined|none|tidak ada)$/i.test(String(d1PhoneRaw).trim())) {
            d1PhoneRaw = '';
        }
        if (!d2PhoneRaw || d2PhoneRaw === '-' || /^(belum|kosong|null|undefined|none|tidak ada)$/i.test(String(d2PhoneRaw).trim())) {
            d2PhoneRaw = '';
        }

        const d1PhoneFormatted = d1PhoneRaw ? this.formatPhoneNumber(d1PhoneRaw) : '';
        const d2PhoneFormatted = d2PhoneRaw ? this.formatPhoneNumber(d2PhoneRaw) : '';

        const esc = (s) => (typeof jntEscapeHtml === 'function')
            ? jntEscapeHtml(s)
            : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const safeD1 = esc(d1Name);
        const safeD1Phone = esc(d1PhoneFormatted);
        const telLink1 = d1PhoneRaw.replace(/[^\d+]/g, '');
        const safeD2 = esc(d2Name);
        const safeD2Phone = esc(d2PhoneFormatted);
        const telLink2 = d2PhoneRaw.replace(/[^\d+]/g, '');

        let html = `<div class="sh-driver-cell">`;
        html += `<div class="sh-driver-primary-row">`;
        html += `<span class="sh-driver-name" title="Driver 1: ${safeD1}">${safeD1}</span>`;
        if (safeD1Phone && telLink1) {
            html += `<a href="tel:${telLink1}" class="sh-driver-phone" title="Hubungi Driver 1: ${safeD1}"><span class="phone-icon">📞</span><span>${safeD1Phone}</span></a>`;
        }
        html += `</div>`;

        if (safeD2) {
            html += `<div class="sh-driver-d2-row">`;
            html += `<span class="sh-driver-cad" title="Driver 2 (Cadangan): ${safeD2}">Cad: <strong>${safeD2}</strong></span>`;
            if (safeD2Phone && telLink2) {
                html += `<a href="tel:${telLink2}" class="sh-driver-phone sh-driver-phone-cad" title="Hubungi Driver 2: ${safeD2}"><span class="phone-icon">📞</span><span>${safeD2Phone}</span></a>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    },

    resolveTripVendor(item) {
        if (!item) return 'PT. SERIKAT HANTAR EKSPEDISI (SERYU)';
        const candidateVendor = item.vendor || item.namaVendor || '';
        return this.normalizeVendorName(candidateVendor, item.platNomor);
    },

    /**
     * Resolusi Target SLA Resmi J&T Express berdasarkan Rute / TLC / Jenis Armada.
     * Memperbaiki data trip dari Excel yang nilai TARGET SLA-nya #N/A atau terisi fallback generik 16 jam
     * padahal rutenya jarak jauh (misal MEDAN 71j, PEKANBARU 54j, PALEMBANG 19.67j, YOGYAKARTA FUSO 20j).
     */
    getOfficialRouteTargetSLA(item) {
        if (!item) return 16;
        const rawCombined = [
            item.trip || '',
            item.tlc || '',
            item.namaRute || '',
            item.rute || '',
            item.layanan || '',
            item.jenisMobil || '',
            item.jenisArmada || ''
        ].join(' ').toUpperCase();

        const isCDD = rawCombined.includes('CDD') || rawCombined.includes('ENGKEL') || rawCombined.includes('BOX') || rawCombined.includes('SMALL');
        const isKontainer = rawCombined.includes('KONTAINER') || rawCombined.includes('CONTAINER');

        const ROUTE_SLA_TABLE = [
            { keys: ['MES', 'MEDAN'], fuso: 71.0, cdd: 71.0, kontainer: 71.0 },
            { keys: ['BTJ', 'ACEH'], fuso: 63.0, cdd: 62.0, kontainer: 63.0 },
            { keys: ['PKU', 'PEKANBARU'], fuso: 54.0, cdd: 54.0, kontainer: 54.0 },
            { keys: ['RPT', 'RANTAUPRAPAT'], fuso: 50.0, cdd: 48.0, kontainer: 50.0 },
            { keys: ['PDG', 'PADANG'], fuso: 49.0, cdd: 49.0, kontainer: 49.0 },
            { keys: ['BKS', 'BENGKULU'], fuso: 44.0, cdd: 44.0, kontainer: 44.0 },
            { keys: ['DPS', 'DENPASAR', 'BALI'], fuso: 43.0, cdd: 40.0, kontainer: 43.0 },
            { keys: ['DJB', 'JAMBI'], fuso: 33.0, cdd: 21.0, kontainer: 33.0 },
            { keys: ['JBR', 'JEMBER'], fuso: 29.0, cdd: 29.0, kontainer: 29.0 },
            { keys: ['SUB', 'SURABAYA'], fuso: 23.0, cdd: 19.0, kontainer: 20.0 },
            { keys: ['LLG', 'LUBUKLINGGAU'], fuso: 23.0, cdd: 23.0, kontainer: 23.0 },
            { keys: ['PRO', 'PROBOLINGGO'], fuso: 22.0, cdd: 22.0, kontainer: 22.0 },
            { keys: ['PMH', 'PRABUMULIH'], fuso: 21.0, cdd: 21.0, kontainer: 21.0 },
            { keys: ['MLG', 'MALANG'], fuso: 21.0, cdd: 21.0, kontainer: 21.0 },
            { keys: ['JOG', 'YOGYAKARTA', 'YOGYA', 'JOGJA'], fuso: 20.0, cdd: 16.0, kontainer: 20.0 },
            { keys: ['MDN', 'MADIUN'], fuso: 20.0, cdd: 20.0, kontainer: 20.0 },
            { keys: ['MDR', 'MADURA'], fuso: 20.0, cdd: 20.0, kontainer: 20.0 },
            { keys: ['PLM', 'PALEMBANG'], fuso: 19.67, cdd: 19.67, kontainer: 19.75 },
            { keys: ['LMG', 'LAMONGAN'], fuso: 19.5, cdd: 19.5, kontainer: 19.5 },
            { keys: ['GSK', 'GRESIK'], fuso: 19.0, cdd: 19.0, kontainer: 19.0 },
            { keys: ['KDR', 'KEDIRI'], fuso: 16.0, cdd: 14.0, kontainer: 16.0 },
            { keys: ['SOC', 'SOLO', 'SURAKARTA'], fuso: 15.5, cdd: 15.5, kontainer: 15.5 },
            { keys: ['PTI', 'PATI'], fuso: 14.0, cdd: 14.0, kontainer: 14.0 },
            { keys: ['SRG', 'SEMARANG'], fuso: 14.0, cdd: 12.5, kontainer: 14.0 },
            { keys: ['TKG', 'LAMPUNG'], fuso: 13.5, cdd: 11.0, kontainer: 13.0 },
            { keys: ['PWO', 'PWT', 'PURWOKERTO'], fuso: 12.5, cdd: 12.5, kontainer: 12.5 },
            { keys: ['TSK', 'TSM', 'TASIKMALAYA', 'TASIK'], fuso: 10.0, cdd: 10.0, kontainer: 10.0 },
            { keys: ['TGL', 'TEGAL'], fuso: 9.0, cdd: 9.0, kontainer: 9.0 },
            { keys: ['CRN', 'CBN', 'CIREBON'], fuso: 8.5, cdd: 8.5, kontainer: 8.5 },
            { keys: ['SMI', 'SUKABUMI'], fuso: 6.0, cdd: 6.0, kontainer: 6.0 },
            { keys: ['BDO', 'BDG', 'BANDUNG'], fuso: 5.5, cdd: 5.5, kontainer: 5.5 },
            { keys: ['CIM', 'CIMAHI'], fuso: 5.5, cdd: 4.5, kontainer: 5.5 },
            { keys: ['CKP', 'CIKAMPEK'], fuso: 4.5, cdd: 4.5, kontainer: 4.5 },
            { keys: ['BTN', 'BANTEN'], fuso: 3.0, cdd: 2.5, kontainer: 3.0 },
            { keys: ['CKR', 'CIKARANG'], fuso: 2.83, cdd: 2.83, kontainer: 2.83 },
            { keys: ['BGR', 'BOGOR'], fuso: 2.5, cdd: 2.0, kontainer: 2.5 },
            { keys: ['DPK', 'DEPOK'], fuso: 2.0, cdd: 2.0, kontainer: 2.0 },
            { keys: ['BKI', 'BEKASI'], fuso: 2.0, cdd: 2.0, kontainer: 2.0 },
            { keys: ['SEG', 'SERANG'], fuso: 1.5, cdd: 1.5, kontainer: 1.5 },
            { keys: ['BAL', 'BALARAJA'], fuso: 1.5, cdd: 1.5, kontainer: 1.5 },
            { keys: ['SDP'], fuso: 1.5, cdd: 1.5, kontainer: 1.5 },
            { keys: ['JAT', 'JRT'], fuso: 1.5, cdd: 1.5, kontainer: 1.5 },
            { keys: ['WRG', 'WARINGIN'], fuso: 1.25, cdd: 1.0, kontainer: 1.25 },
            { keys: ['TGR', 'TANGERANG'], fuso: 0.5, cdd: 0.5, kontainer: 0.5 }
        ];

        const tokens = rawCombined.split(/[\s\-_\/(),.]+/);
        for (const entry of ROUTE_SLA_TABLE) {
            const matched = entry.keys.some(k => tokens.includes(k) || (k.length > 3 && rawCombined.includes(k)));
            if (matched) {
                if (isKontainer) return entry.kontainer;
                if (isCDD) return entry.cdd;
                return entry.fuso;
            }
        }

        const existingTarget = parseFloat(item.targetSLAHours || item.targetSLAOutboundHours);
        return (!isNaN(existingTarget) && existingTarget > 0) ? existingTarget : 16;
    },

    resolveEffectiveTargetSLAHours(item) {
        if (!item) return 16;
        const officialH = this.getOfficialRouteTargetSLA(item);
        const savedH = parseFloat(item.targetSLAHours || item.targetSLAOutboundHours);
        if (isNaN(savedH) || savedH <= 0 || (savedH === 16 && officialH !== 16)) {
            return officialH;
        }
        return savedH;
    },

    async lookupTripMaster(tripCode) {
        const fallbackMap = {
            "SEG FUSO": { trip: "SEG FUSO", rute: "JAKARTA - SERANG", tlc: "SERANG", layanan: "FUSO", wilayah: "BANTEN", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
            "SEG CDD": { trip: "SEG CDD", rute: "JAKARTA - SERANG", tlc: "SERANG", layanan: "CDD", wilayah: "BANTEN", targetSLAOutboundHours: 1.5, targetSLAReturnHours: 1.5, targetSLARoundtripHours: 3.0, status: "ACTIVE" },
            "TKG FUSO": { trip: "TKG FUSO", rute: "JAKARTA - LAMPUNG", tlc: "LAMPUNG", layanan: "FUSO", wilayah: "SUMATERA", targetSLAOutboundHours: 13.5, targetSLAReturnHours: 13.5, targetSLARoundtripHours: 27.0, status: "ACTIVE" },
            "TKG CDD": { trip: "TKG CDD", rute: "JAKARTA - LAMPUNG", tlc: "LAMPUNG", layanan: "CDD", wilayah: "SUMATERA", targetSLAOutboundHours: 11.0, targetSLAReturnHours: 11.0, targetSLARoundtripHours: 22.0, status: "ACTIVE" },
            "SRG FUSO": { trip: "SRG FUSO", rute: "JAKARTA - SEMARANG", tlc: "SEMARANG", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 14.0, targetSLAReturnHours: 14.0, targetSLARoundtripHours: 28.0, status: "ACTIVE" },
            "SRG CDD": { trip: "SRG CDD", rute: "JAKARTA - SEMARANG", tlc: "SEMARANG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 12.5, targetSLAReturnHours: 12.5, targetSLARoundtripHours: 25.0, status: "ACTIVE" },
            "BDO FUSO": { trip: "BDO FUSO", rute: "JAKARTA - BANDUNG", tlc: "BANDUNG", layanan: "FUSO", wilayah: "JAWA", targetSLAOutboundHours: 5.5, targetSLAReturnHours: 4.5, targetSLARoundtripHours: 11.0, status: "ACTIVE" },
            "BDO CDD": { trip: "BDO CDD", rute: "JAKARTA - BANDUNG", tlc: "BANDUNG", layanan: "CDD", wilayah: "JAWA", targetSLAOutboundHours: 5.5, targetSLAReturnHours: 5.5, targetSLARoundtripHours: 11.0, status: "ACTIVE" },
            "JOG CDD": { trip: "JOG CDD", rute: "JAKARTA - YOGYA", tlc: "JOG CDD", layanan: "ADD", wilayah: "JAWA", targetSLAOutboundHours: 16, targetSLAReturnHours: 16, targetSLARoundtripHours: 32, status: "ACTIVE" },
            "BDG CDD": { trip: "BDG CDD", rute: "JAKARTA - BANDUNG", tlc: "BDG CDD", layanan: "REG", wilayah: "JAWA", targetSLAOutboundHours: 6, targetSLAReturnHours: 6, targetSLARoundtripHours: 12, status: "ACTIVE" },
            "PLM FUSO": { trip: "PLM FUSO", rute: "JAKARTA - PALEMBANG", tlc: "PLM FUSO", layanan: "ADD", wilayah: "SUMATERA", targetSLAOutboundHours: 24, targetSLAReturnHours: 24, targetSLARoundtripHours: 48, status: "ACTIVE" },
            "SUB FUSO": { trip: "SUB FUSO", rute: "JAKARTA - SURABAYA", tlc: "SUB FUSO", layanan: "ADD", wilayah: "JAWA", targetSLAOutboundHours: 20, targetSLAReturnHours: 20, targetSLARoundtripHours: 40, status: "ACTIVE" }
        };

        const localTrips = this.getLocalStore('master_trips');
        const foundLocal = localTrips.find(t => t.code === tripCode || t.id === tripCode);
        if (foundLocal) return foundLocal;

        const officialTargetH = this.getOfficialRouteTargetSLA({ trip: tripCode, tlc: tripCode, namaRute: tripCode });
        return fallbackMap[tripCode] || {
            trip: tripCode,
            rute: "JAKARTA - " + tripCode,
            tlc: tripCode,
            layanan: String(tripCode || '').toUpperCase().includes('CDD') ? 'CDD' : 'FUSO',
            wilayah: "JAWA",
            targetSLAOutboundHours: officialTargetH,
            targetSLAReturnHours: officialTargetH,
            targetSLARoundtripHours: officialTargetH * 2,
            status: "ACTIVE"
        };
    },

    subscribeMasterTrips(callback) {
        return this.createSub('master_trips', callback);
    },

    async saveMasterTrip(tripData) {
        const doc = { ...tripData, id: tripData.code, status: tripData.status || 'ACTIVE' };
        const saved = await this.saveDoc('master_trips', tripData.code, doc, true);
        this.saveMasterDataToHosting('master_trips', tripData.code, saved, false).catch(() => { });
        return saved;
    },

    async deleteMasterTrip(tripCode) {
        const incomingCheck = (this.getLocalStore('incoming') || []).some(i => i.trip === tripCode);
        if (incomingCheck) {
            const saved = await this.saveDoc('master_trips', tripCode, { status: 'INACTIVE' }, true);
            this.saveMasterDataToHosting('master_trips', tripCode, { status: 'INACTIVE' }, false).catch(() => { });
            return saved;
        }
        const deleted = await this.deleteDoc('master_trips', tripCode);
        this.saveMasterDataToHosting('master_trips', tripCode, null, true).catch(() => { });
        return deleted;
    },

    subscribeMasterFleets(callback) {
        return this.createSub('master_fleets', callback);
    },

    async saveMasterFleet(fleetData) {
        const docId = fleetData.platNomor.replace(/\s+/g, '');
        const doc = { ...fleetData, id: docId };
        const saved = await this.saveDoc('master_fleets', docId, doc, true);
        this.saveMasterDataToHosting('master_fleets', docId, saved, false).catch(() => { });
        return saved;
    },

    async deleteMasterFleet(platNomor) {
        const docId = platNomor.replace(/\s+/g, '');
        const deleted = await this.deleteDoc('master_fleets', docId);
        this.saveMasterDataToHosting('master_fleets', docId, null, true).catch(() => { });
        return deleted;
    },

    subscribeMasterDrivers(callback) {
        return this.createSub('master_drivers', callback);
    },

    async saveMasterDriver(driverData) {
        const docId = driverData.nama.toLowerCase().replace(/\s+/g, '_');
        const doc = { ...driverData, id: docId };
        const saved = await this.saveDoc('master_drivers', docId, doc, true);
        this.saveMasterDataToHosting('master_drivers', docId, saved, false).catch(() => { });
        return saved;
    },

    async deleteMasterDriver(nama) {
        const docId = nama.toLowerCase().replace(/\s+/g, '_');
        const deleted = await this.deleteDoc('master_drivers', docId);
        this.saveMasterDataToHosting('master_drivers', docId, null, true).catch(() => { });
        return deleted;
    },

    subscribeMasterReasons(callback) {
        return this.createSub('master_reasons', callback);
    },

    async saveMasterReason(reasonData) {
        const saved = await this.saveDoc('master_reasons', reasonData.id, reasonData, true);
        this.saveMasterDataToHosting('master_reasons', reasonData.id, saved, false).catch(() => { });
        return saved;
    },

    // ----------------------------------------------------
    // 3. INCOMING TRIPS (SINGLE SOURCE OF TRUTH)
    // ----------------------------------------------------
    async checkDuplicateKodeTugas(kodeTugas) {
        if (!kodeTugas) return false;
        const targetClean = kodeTugas.trim().toLowerCase();
        // Cek langsung dari gabungan Memory Cache + Hosting Archive (0 Read Firestore!)
        const items = [
            ...(this.getLocalStore('incoming') || []),
            ...(this.getLocalStore('sla_outbound') || [])
        ];
        const foundInMemory = items.some(d =>
            (d.id && String(d.id).toLowerCase() === targetClean) ||
            (d.kodeTugas && String(d.kodeTugas).toLowerCase() === targetClean)
        );
        if (foundInMemory) return true;

        // Jika belum ada di memori, cek hanya 1 dokumen spesifik di Firestore (maks 1 Read, bukan .get() seluruh koleksi)
        if (window.db) {
            try {
                const docSnap = await window.db.collection('incoming').doc(kodeTugas.trim()).get();
                if (docSnap.exists) return true;
            } catch (err) {
                console.warn("checkDuplicateKodeTugas Firestore doc notice:", err.message);
            }
        }
        return false;
    },

    subscribeIncoming(callback) {
        return this.createSub('incoming', callback);
    },

    async addIncomingTrip(tripData) {
        this._unmarkTripAsDeleted(tripData && tripData.kodeTugas);
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

        const slaDoc = {
            kodeTugas: tripData.kodeTugas,
            trip: fullTripData.trip,
            namaRute: fullTripData.namaRute,
            platNomor: fullTripData.platNomor,
            vendor: fullTripData.vendor || "J&T",
            driver1: fullTripData.driver1 || "",
            driverPhone: fullTripData.driverPhone || "",
            driver2: fullTripData.driver2 || "",
            driver2Phone: fullTripData.driver2Phone || "",
            jamBerangkat: fullTripData.jamBerangkat,
            totalAwb: fullTripData.totalAwb || 0,
            jamSampaiAktual: "",
            durasiBerangkatMinutes: 0,
            targetSLAHours: masterInfo.targetSLAOutboundHours,
            lateMinutes: 0,
            statusSla: "BERJALAN",
            alasan: "",
            inputBy: tripData.inputBy || sessionStorage.getItem('jnt_active_username') || "Operator",
            shiftId: shiftId
        };

        const roundtripDoc = {
            kodeTugas: tripData.kodeTugas,
            trip: fullTripData.trip,
            vendor: fullTripData.vendor || "PT. SERIKAT HANTAR EKSPEDISI (SERYU)",
            platNomor: fullTripData.platNomor || "",
            wilayah: masterInfo.wilayah,
            targetSLAPP: masterInfo.targetSLARoundtripHours,
            totalDurasiPPMinutes: 0,
            totalLatePPMinutes: 0,
            statusRoundtrip: "WAITING_RETURN",
            keterangan: "Menunggu data perjalanan balikan dari Gateway"
        };

        // Monitoring 4H Record (42 slot 7 hari)
        const todayStr = new Date().toISOString().split('T')[0];
        const allSlotKeys = this.getMonitoringSlotKeys();
        const depSlotIdx = this.getDepartureSlotIndex(fullTripData.jamBerangkat);
        const departureSlotKey = allSlotKeys[depSlotIdx] || '00:00';
        const initialSlots = {};
        allSlotKeys.forEach(k => { initialSlots[k] = null; });

        initialSlots[departureSlotKey] = {
            lokasi: "OUT JKT999",
            keterangan: "Keberangkatan Awal",
            jenisUpdate: "Lokasi Normal",
            jamUpdateAktual: fullTripData.jamBerangkat,
            inputBy: fullTripData.inputBy,
            shiftId: shiftId,
            statusUpdate: "SUDAH UPDATE"
        };

        const monDoc = {
            kodeTugas: tripData.kodeTugas,
            tanggalMonitoring: todayStr,
            trip: fullTripData.trip,
            namaRute: fullTripData.namaRute,
            platNomor: fullTripData.platNomor,
            vendor: fullTripData.vendor || "J&T",
            driver1: fullTripData.driver1,
            driverPhone: fullTripData.driverPhone || "",
            driver2: fullTripData.driver2 || "",
            driver2Phone: fullTripData.driver2Phone || "",
            jamBerangkat: fullTripData.jamBerangkat || "",
            slots: initialSlots,
            lastUpdateSlot: departureSlotKey,
            lastUpdateLokasi: "OUT JKT999",
            lastUpdateTime: fullTripData.jamBerangkat,
            lastUpdateBy: fullTripData.inputBy,
            statusPerjalanan: "ON PROGRESS"
        };

        // ⚡ ATOMIC WRITEBATCH: Simpan ke 4 koleksi SSOT secara atomik (100% serentak terkonfirmasi Server ACK)
        await this.commitAtomicBatch([
            { type: 'set', colName: 'incoming', docId: tripData.kodeTugas, data: fullTripData, merge: true },
            { type: 'set', colName: 'sla_outbound', docId: tripData.kodeTugas, data: slaDoc, merge: true },
            { type: 'set', colName: 'sla_roundtrip', docId: tripData.kodeTugas, data: roundtripDoc, merge: true },
            { type: 'set', colName: 'monitoring_4h', docId: tripData.kodeTugas, data: monDoc, merge: true }
        ]);

        // Log Audit Event
        await this.logAuditEvent({
            waktu: this.formatStandardDateTime(),
            operator: tripData.inputBy || sessionStorage.getItem('jnt_active_username') || "Operator",
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

    /**
     * Import / Sinkronisasi data perjalanan dari Excel (SLA & Monitoring 4 Jam).
     * Jam keberangkatan otomatis terisi di SLA Vendor dan slot OUT JKT999 Monitoring 4H.
     */
    async importTripFromExcel(row, options = { upsert: true }) {
        if (!row || !row.kodeTugas) {
            throw new Error('Kode Tugas wajib ada pada setiap baris data Excel.');
        }
        const kode = String(row.kodeTugas).trim();
        this._unmarkTripAsDeleted(kode);
        const plat = String(row.platNomor || '-').trim();
        const trip = String(row.trip || row.rute || row.namaRute || row.tlc || 'JKT - SUB').trim();

        // Normalisasi Vendor Resmi J&T
        const rawVendor = String(row.vendor || '').trim();
        const vendor = this.normalizeVendorName(rawVendor, plat);

        // Ekstraksi & Pencocokan Driver dan Nomor Telepon Driver
        const rawDriver = String(row.driver1 || row.driver || '-').trim();
        const explicitPhone = String(row.driverPhone || row.noHpDriver || row.phone || '').trim();
        const d1Info = this.extractDriverAndPhone(rawDriver, explicitPhone);
        const driver1 = d1Info.driver1;
        const driverPhone = d1Info.driverPhone;

        const rawDriver2 = String(row.driver2 || d1Info.driver2 || '').trim();
        const explicitPhone2 = String(row.driver2Phone || d1Info.driver2Phone || '').trim();
        const d2Info = rawDriver2 ? this.extractDriverAndPhone(rawDriver2, explicitPhone2) : { driver1: '', driverPhone: '' };
        const driver2 = d2Info.driver1 !== '-' ? d2Info.driver1 : '';
        const driver2Phone = d2Info.driverPhone || '';

        const jamBerangkat = String(row.jamBerangkat || row.waktuBerangkat || '').trim();
        const targetSLA = row.targetSLA || row.targetSLAOutboundHours || null;
        let jamSampai = String(row.jamSampai || row.jamSampaiAktual || '').trim();
        if (/^(kosong|belum|nihil|-|—|null|undefined|n\/a)$/i.test(jamSampai)) {
            jamSampai = '';
        }

        // Ekstraksi Total AWB (Format Angka / Ribuan)
        const rawAwb = (row.totalAwb !== undefined && row.totalAwb !== null) ? row.totalAwb : (row.awb || row.jumlahAwb || row.total_awb || null);
        let totalAwb = null;
        if (rawAwb !== null && rawAwb !== undefined && rawAwb !== '') {
            if (typeof rawAwb === 'number') {
                totalAwb = Math.round(rawAwb);
            } else {
                const s = String(rawAwb).replace(/\s+/g, '');
                const cleanDigits = (/^\d{1,3}([.,]\d{3})+$/.test(s)) ? s.replace(/[.,]/g, '') : s.replace(/[^\d]/g, '');
                const n = parseInt(cleanDigits, 10);
                if (!isNaN(n) && n > 0) totalAwb = n;
            }
        }

        const inputBy = row.inputBy || sessionStorage.getItem('jnt_active_username') || 'Operator';
        const shiftId = this.getActiveShiftId();

        const existingIncoming = this.getLocalStore('incoming') || [];
        const existing = existingIncoming.find(i => (i.kodeTugas || i.id) === kode);

        if (existing && !options.upsert) {
            throw new Error(`Kode Tugas ${kode} sudah terdaftar di sistem.`);
        }

        const masterInfo = await this.lookupTripMaster(trip || row.tlc);

        // 1. Data SSOT Incoming
        const tripData = {
            ...(existing || {}),
            kodeTugas: kode,
            platNomor: plat,
            trip: trip,
            namaRute: masterInfo.rute || trip,
            tlc: row.tlc || masterInfo.tlc || trip.substring(0, 3).toUpperCase(),
            vendor: vendor,
            driver1: driver1,
            driverPhone: driverPhone,
            driver2: driver2,
            driver2Phone: driver2Phone,
            jamBerangkat: jamBerangkat ? this.formatStandardDateTime(jamBerangkat) : (existing ? existing.jamBerangkat : this.formatStandardDateTime()),
            targetSLAOutboundHours: targetSLA ? parseFloat(targetSLA) : masterInfo.targetSLAOutboundHours,
            targetSLARoundtripHours: masterInfo.targetSLARoundtripHours,
            totalAwb: (totalAwb !== null) ? totalAwb : (existing ? existing.totalAwb : null),
            jamSampaiAktual: jamSampai ? this.formatStandardDateTime(jamSampai) : (existing ? existing.jamSampaiAktual : ''),
            status: jamSampai ? 'COMPLETED' : (existing ? existing.status : 'ON PROGRESS'),
            inputBy: inputBy,
            shiftId: shiftId,
            updatedAt: new Date().toISOString()
        };
        if (!existing) {
            tripData.createdAt = new Date().toISOString();
        }

        // 2. Data Monitoring 4 Jam (otomatis slot OUT JKT999 pada slot jam berangkat)
        const allSlotKeys = this.getMonitoringSlotKeys();
        const existingMon = (this.getLocalStore('monitoring_4h') || []).find(m => (m.kodeTugas || m.id) === kode);
        const initialSlots = existingMon && existingMon.slots ? { ...existingMon.slots } : {};
        allSlotKeys.forEach(k => { if (initialSlots[k] === undefined) initialSlots[k] = null; });

        const depSlotIdx = this.getDepartureSlotIndex(tripData.jamBerangkat);
        const departureSlotKey = allSlotKeys[depSlotIdx] || '00:00';

        initialSlots[departureSlotKey] = {
            lokasi: "OUT JKT999",
            keterangan: "Keberangkatan Awal (Auto-Import Excel)",
            jenisUpdate: "Lokasi Normal",
            jamUpdateAktual: tripData.jamBerangkat,
            inputBy: inputBy,
            shiftId: shiftId,
            statusUpdate: "SUDAH UPDATE"
        };

        // Jika file Excel berisi kolom-kolom slot jam checkpoint 4H (H1 s/d H7)
        let lastFilledSlotKey = departureSlotKey;
        let lastFilledLokasi = "OUT JKT999";
        let lastFilledTime = tripData.jamBerangkat;
        let hasArrival = Boolean(tripData.jamSampaiAktual && !/^(kosong|belum|nihil|-|—)$/i.test(tripData.jamSampaiAktual));

        if (row.slots && typeof row.slots === 'object') {
            allSlotKeys.forEach(k => {
                const sData = row.slots[k];
                if (sData && typeof sData === 'object' && sData.lokasi) {
                    initialSlots[k] = {
                        lokasi: sData.lokasi,
                        keterangan: sData.keterangan || "Update dari Excel Monitoring 4H",
                        jenisUpdate: sData.jenisUpdate || "Lokasi Normal",
                        jamUpdateAktual: this.formatStandardDateTime(sData.jamUpdateAktual || tripData.jamBerangkat || new Date()),
                        inputBy: inputBy,
                        shiftId: shiftId,
                        statusUpdate: "SUDAH UPDATE"
                    };
                    lastFilledSlotKey = k;
                    lastFilledLokasi = sData.lokasi;
                    lastFilledTime = sData.jamUpdateAktual || lastFilledTime;

                    const locUp = String(sData.lokasi).toUpperCase();
                    const isOut = locUp.startsWith('OUT') || locUp.includes('OUT JKT') || locUp.includes('BERANGKAT');
                    const isArr = !isOut && (locUp.startsWith('IN') || locUp.includes('GATEWAY IN') || locUp.includes('GW IN') || locUp.includes('SAMPAI') || locUp.includes('TIBA') || sData.jenisUpdate === 'Sampai');
                    if (isArr) {
                        hasArrival = true;
                        tripData.jamSampaiAktual = this.formatStandardDateTime(sData.jamUpdateAktual || tripData.jamSampaiAktual || new Date());
                    }
                }
            });
        }

        if (hasArrival && tripData.jamSampaiAktual && !/^(kosong|belum|nihil|-|—)$/i.test(tripData.jamSampaiAktual)) {
            const arrSlotIdx = Math.max(depSlotIdx + 1, Math.min(depSlotIdx + 3, allSlotKeys.length - 1));
            const arrKey = allSlotKeys[arrSlotIdx];
            const destCode = (tripData.tlc || 'GATEWAY').substring(0, 3).toUpperCase();
            if (!initialSlots[arrKey]) {
                initialSlots[arrKey] = {
                    lokasi: `IN ${destCode}`,
                    keterangan: "Armada Sampai Tujuan (Excel)",
                    jenisUpdate: "Sampai",
                    jamUpdateAktual: tripData.jamSampaiAktual,
                    inputBy: inputBy,
                    shiftId: shiftId,
                    statusUpdate: "COMPLETED"
                };
            }
            lastFilledSlotKey = arrKey;
            lastFilledLokasi = initialSlots[arrKey].lokasi;
            lastFilledTime = tripData.jamSampaiAktual;
            tripData.status = 'SUDAH SELESAI';
        }

        const slaDoc = {
            kodeTugas: kode,
            trip: tripData.trip,
            namaRute: tripData.namaRute,
            platNomor: tripData.platNomor,
            vendor: tripData.vendor,
            driver1: tripData.driver1,
            driverPhone: tripData.driverPhone,
            driver2: tripData.driver2,
            driver2Phone: tripData.driver2Phone,
            jamBerangkat: tripData.jamBerangkat,
            jamSampaiAktual: tripData.jamSampaiAktual,
            totalAwb: tripData.totalAwb,
            targetSLAHours: tripData.targetSLAOutboundHours,
            statusSla: (hasArrival || (tripData.jamSampaiAktual && tripData.jamSampaiAktual !== '-')) ? 'COMPLETED' : 'BERJALAN',
            inputBy: inputBy,
            shiftId: shiftId,
            updatedAt: new Date().toISOString()
        };

        const monDoc = {
            ...(existingMon || {}),
            kodeTugas: kode,
            trip: tripData.trip,
            namaRute: tripData.namaRute,
            platNomor: tripData.platNomor,
            vendor: tripData.vendor,
            driver1: tripData.driver1,
            driverPhone: tripData.driverPhone,
            driver2: tripData.driver2,
            driver2Phone: tripData.driver2Phone,
            jamBerangkat: tripData.jamBerangkat,
            jamSampaiAktual: tripData.jamSampaiAktual,
            totalAwb: tripData.totalAwb,
            slots: initialSlots,
            lastUpdateSlot: lastFilledSlotKey,
            lastUpdateLokasi: lastFilledLokasi,
            lastUpdateTime: lastFilledTime,
            lastUpdateBy: inputBy,
            statusPerjalanan: hasArrival ? "COMPLETED" : "ON PROGRESS",
            updatedAt: new Date().toISOString()
        };

        // ⚡ ATOMIC WRITEBATCH: Simpan ke semua 3 koleksi SSOT (incoming, sla_outbound, monitoring_4h) secara atomik
        await this.commitAtomicBatch([
            { type: 'set', colName: 'incoming', docId: kode, data: tripData, merge: true },
            { type: 'set', colName: 'sla_outbound', docId: kode, data: slaDoc, merge: true },
            { type: 'set', colName: 'monitoring_4h', docId: kode, data: monDoc, merge: true }
        ]);

        // Backup ke trip_archive.php di latar belakang jika sudah selesai
        if (hasArrival) {
            this.saveTripsBatchToHostingArchive([{
                kodeTugas: kode,
                incoming: tripData,
                sla_outbound: slaDoc,
                monitoring_4h: monDoc
            }], false).catch(() => { });
        }

        return tripData;
    },

    /**
     * ⚡ BULK ATOMIC EXCEL IMPORT ENGINE (Prioritas 2)
     * Mengimpor ratusan/ribuan baris Excel ke Cloud Firestore menggunakan WriteBatch (120 trip / 360 dokumen per batch commit)
     * dengan konfirmasi Server ACK nyata untuk setiap batch.
     */
    async importTripsBatchFromExcel(rows = [], options = { upsert: true }, onProgress = null) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return { successCount: 0, errorCount: 0, errors: [] };
        }
        if (!navigator.onLine) {
            throw new Error('Tidak ada koneksi internet. Import Excel membutuhkan koneksi ke Cloud Firestore.');
        }
        if (!window.db) {
            throw new Error('Database Cloud Firestore belum terhubung.');
        }

        const TRIPS_PER_BATCH = 120; // 120 trip x 3 koleksi = 360 operasi per Firestore WriteBatch (batas maks 500)
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        const failedRows = [];
        const completedArchiveBundles = [];

        const existingIncMap = new Map((this.getLocalStore('incoming') || []).map(i => [i.kodeTugas || i.id, i]));
        const existingMonMap = new Map((this.getLocalStore('monitoring_4h') || []).map(m => [m.kodeTugas || m.id, m]));
        const allSlotKeys = this.getMonitoringSlotKeys();
        const shiftId = this.getActiveShiftId();
        const defaultInputBy = sessionStorage.getItem('jnt_active_username') || 'Operator';

        for (let start = 0; start < rows.length; start += TRIPS_PER_BATCH) {
            const chunkRows = rows.slice(start, start + TRIPS_PER_BATCH);
            const batchOps = [];
            const chunkArchiveBundles = [];
            const chunkValidRows = [];
            let validTripsInChunk = 0;

            for (let idx = 0; idx < chunkRows.length; idx++) {
                const row = chunkRows[idx];
                const absRowNum = start + idx + 1;
                try {
                    if (!row || !row.kodeTugas) {
                        throw new Error(`Baris ${absRowNum}: Kode Tugas kosong.`);
                    }
                    const kode = String(row.kodeTugas).trim();
                    this._unmarkTripAsDeleted(kode);

                    const existing = existingIncMap.get(kode);
                    if (existing && !options.upsert) {
                        throw new Error(`Baris ${absRowNum} (${kode}): Sudah terdaftar di sistem.`);
                    }

                    const plat = String(row.platNomor || '-').trim();
                    const trip = String(row.trip || row.rute || row.namaRute || row.tlc || 'JKT - SUB').trim();
                    const vendor = this.normalizeVendorName(String(row.vendor || '').trim(), plat);

                    const rawDriver = String(row.driver1 || row.driver || '-').trim();
                    const explicitPhone = String(row.driverPhone || row.noHpDriver || row.phone || '').trim();
                    const d1Info = this.extractDriverAndPhone(rawDriver, explicitPhone);

                    const rawDriver2 = String(row.driver2 || d1Info.driver2 || '').trim();
                    const explicitPhone2 = String(row.driver2Phone || d1Info.driver2Phone || '').trim();
                    const d2Info = rawDriver2 ? this.extractDriverAndPhone(rawDriver2, explicitPhone2) : { driver1: '', driverPhone: '' };
                    const driver2 = d2Info.driver1 !== '-' ? d2Info.driver1 : '';
                    const driver2Phone = d2Info.driverPhone || '';

                    const jamBerangkat = String(row.jamBerangkat || row.waktuBerangkat || '').trim();
                    const targetSLA = row.targetSLA || row.targetSLAOutboundHours || null;
                    let jamSampai = String(row.jamSampai || row.jamSampaiAktual || '').trim();
                    if (/^(kosong|belum|nihil|-|—|null|undefined|n\/a)$/i.test(jamSampai)) {
                        jamSampai = '';
                    }

                    const rawAwb = (row.totalAwb !== undefined && row.totalAwb !== null) ? row.totalAwb : (row.awb || row.jumlahAwb || row.total_awb || null);
                    let totalAwb = null;
                    if (rawAwb !== null && rawAwb !== undefined && rawAwb !== '') {
                        if (typeof rawAwb === 'number') {
                            totalAwb = Math.round(rawAwb);
                        } else {
                            const s = String(rawAwb).replace(/\s+/g, '');
                            const cleanDigits = (/^\d{1,3}([.,]\d{3})+$/.test(s)) ? s.replace(/[.,]/g, '') : s.replace(/[^\d]/g, '');
                            const n = parseInt(cleanDigits, 10);
                            if (!isNaN(n) && n > 0) totalAwb = n;
                        }
                    }

                    const inputBy = row.inputBy || defaultInputBy;
                    const masterInfo = await this.lookupTripMaster(trip || row.tlc);
                    const nowIso = new Date().toISOString();

                    const tripData = {
                        ...(existing || {}),
                        kodeTugas: kode,
                        platNomor: plat,
                        trip: trip,
                        namaRute: masterInfo.rute || trip,
                        tlc: row.tlc || masterInfo.tlc || trip.substring(0, 3).toUpperCase(),
                        vendor: vendor,
                        driver1: d1Info.driver1,
                        driverPhone: d1Info.driverPhone,
                        driver2: driver2,
                        driver2Phone: driver2Phone,
                        jamBerangkat: jamBerangkat ? this.formatStandardDateTime(jamBerangkat) : (existing ? existing.jamBerangkat : this.formatStandardDateTime()),
                        targetSLAOutboundHours: targetSLA ? parseFloat(targetSLA) : masterInfo.targetSLAOutboundHours,
                        targetSLARoundtripHours: masterInfo.targetSLARoundtripHours,
                        totalAwb: (totalAwb !== null) ? totalAwb : (existing ? existing.totalAwb : null),
                        jamSampaiAktual: jamSampai ? this.formatStandardDateTime(jamSampai) : (existing ? existing.jamSampaiAktual : ''),
                        status: jamSampai ? 'COMPLETED' : (existing ? existing.status : 'ON PROGRESS'),
                        inputBy: inputBy,
                        shiftId: shiftId,
                        updatedAt: nowIso
                    };
                    if (!existing) tripData.createdAt = nowIso;

                    const existingMon = existingMonMap.get(kode);
                    const initialSlots = existingMon && existingMon.slots ? { ...existingMon.slots } : {};
                    allSlotKeys.forEach(k => { if (initialSlots[k] === undefined) initialSlots[k] = null; });

                    const depSlotIdx = this.getDepartureSlotIndex(tripData.jamBerangkat);
                    const departureSlotKey = allSlotKeys[depSlotIdx] || '00:00';

                    initialSlots[departureSlotKey] = {
                        lokasi: "OUT JKT999",
                        keterangan: "Keberangkatan Awal (Auto-Import Excel)",
                        jenisUpdate: "Lokasi Normal",
                        jamUpdateAktual: tripData.jamBerangkat,
                        inputBy: inputBy,
                        shiftId: shiftId,
                        statusUpdate: "SUDAH UPDATE"
                    };

                    let lastFilledSlotKey = departureSlotKey;
                    let lastFilledLokasi = "OUT JKT999";
                    let lastFilledTime = tripData.jamBerangkat;
                    let hasArrival = Boolean(tripData.jamSampaiAktual && !/^(kosong|belum|nihil|-|—)$/i.test(tripData.jamSampaiAktual));

                    if (row.slots && typeof row.slots === 'object') {
                        allSlotKeys.forEach(k => {
                            const sData = row.slots[k];
                            if (sData && typeof sData === 'object' && sData.lokasi) {
                                initialSlots[k] = {
                                    lokasi: sData.lokasi,
                                    keterangan: sData.keterangan || "Update dari Excel Monitoring 4H",
                                    jenisUpdate: sData.jenisUpdate || "Lokasi Normal",
                                    jamUpdateAktual: this.formatStandardDateTime(sData.jamUpdateAktual || tripData.jamBerangkat || new Date()),
                                    inputBy: inputBy,
                                    shiftId: shiftId,
                                    statusUpdate: "SUDAH UPDATE"
                                };
                                lastFilledSlotKey = k;
                                lastFilledLokasi = sData.lokasi;
                                lastFilledTime = sData.jamUpdateAktual || lastFilledTime;

                                const locUp = String(sData.lokasi).toUpperCase();
                                const isOut = locUp.startsWith('OUT') || locUp.includes('OUT JKT') || locUp.includes('BERANGKAT');
                                const isArr = !isOut && (locUp.startsWith('IN') || locUp.includes('GATEWAY IN') || locUp.includes('GW IN') || locUp.includes('SAMPAI') || locUp.includes('TIBA') || sData.jenisUpdate === 'Sampai');
                                if (isArr) {
                                    hasArrival = true;
                                    tripData.jamSampaiAktual = this.formatStandardDateTime(sData.jamUpdateAktual || tripData.jamSampaiAktual || new Date());
                                }
                            }
                        });
                    }

                    if (hasArrival && tripData.jamSampaiAktual && !/^(kosong|belum|nihil|-|—)$/i.test(tripData.jamSampaiAktual)) {
                        const arrSlotIdx = Math.max(depSlotIdx + 1, Math.min(depSlotIdx + 3, allSlotKeys.length - 1));
                        const arrKey = allSlotKeys[arrSlotIdx];
                        const destCode = (tripData.tlc || 'GATEWAY').substring(0, 3).toUpperCase();
                        if (!initialSlots[arrKey]) {
                            initialSlots[arrKey] = {
                                lokasi: `IN ${destCode}`,
                                keterangan: "Armada Sampai Tujuan (Excel)",
                                jenisUpdate: "Sampai",
                                jamUpdateAktual: tripData.jamSampaiAktual,
                                inputBy: inputBy,
                                shiftId: shiftId,
                                statusUpdate: "COMPLETED"
                            };
                        }
                        lastFilledSlotKey = arrKey;
                        lastFilledLokasi = initialSlots[arrKey].lokasi;
                        lastFilledTime = tripData.jamSampaiAktual;
                        tripData.status = 'SUDAH SELESAI';
                    }

                    const slaDoc = {
                        kodeTugas: kode,
                        trip: tripData.trip,
                        namaRute: tripData.namaRute,
                        platNomor: tripData.platNomor,
                        vendor: tripData.vendor,
                        driver1: tripData.driver1,
                        driverPhone: tripData.driverPhone,
                        driver2: tripData.driver2,
                        driver2Phone: tripData.driver2Phone,
                        jamBerangkat: tripData.jamBerangkat,
                        jamSampaiAktual: tripData.jamSampaiAktual,
                        totalAwb: tripData.totalAwb,
                        targetSLAHours: tripData.targetSLAOutboundHours,
                        statusSla: (hasArrival || (tripData.jamSampaiAktual && tripData.jamSampaiAktual !== '-')) ? 'COMPLETED' : 'BERJALAN',
                        inputBy: inputBy,
                        shiftId: shiftId,
                        updatedAt: nowIso
                    };

                    const monDoc = {
                        ...(existingMon || {}),
                        kodeTugas: kode,
                        trip: tripData.trip,
                        namaRute: tripData.namaRute,
                        platNomor: tripData.platNomor,
                        vendor: tripData.vendor,
                        driver1: tripData.driver1,
                        driverPhone: tripData.driverPhone,
                        driver2: tripData.driver2,
                        driver2Phone: tripData.driver2Phone,
                        jamBerangkat: tripData.jamBerangkat,
                        jamSampaiAktual: tripData.jamSampaiAktual,
                        totalAwb: tripData.totalAwb,
                        slots: initialSlots,
                        lastUpdateSlot: lastFilledSlotKey,
                        lastUpdateLokasi: lastFilledLokasi,
                        lastUpdateTime: lastFilledTime,
                        lastUpdateBy: inputBy,
                        statusPerjalanan: hasArrival ? "COMPLETED" : "ON PROGRESS",
                        updatedAt: nowIso
                    };

                    batchOps.push(
                        { type: 'set', colName: 'incoming', docId: kode, data: tripData, merge: true },
                        { type: 'set', colName: 'sla_outbound', docId: kode, data: slaDoc, merge: true },
                        { type: 'set', colName: 'monitoring_4h', docId: kode, data: monDoc, merge: true }
                    );
                    chunkValidRows.push(row);
                    validTripsInChunk++;

                    if (hasArrival) {
                        chunkArchiveBundles.push({
                            kodeTugas: kode,
                            incoming: tripData,
                            sla_outbound: slaDoc,
                            monitoring_4h: monDoc
                        });
                    }
                } catch (rowErr) {
                    errorCount++;
                    errors.push(rowErr.message || String(rowErr));
                    failedRows.push(row);
                }
            }

            if (batchOps.length > 0) {
                try {
                    await this.commitAtomicBatch(batchOps, 25000);
                    successCount += validTripsInChunk;
                    if (chunkArchiveBundles.length > 0) {
                        completedArchiveBundles.push(...chunkArchiveBundles);
                    }
                } catch (batchErr) {
                    errorCount += validTripsInChunk;
                    errors.push(`Gagal menulis Batch ${Math.floor(start / TRIPS_PER_BATCH) + 1} ke Firestore: ${batchErr.message}`);
                    failedRows.push(...chunkValidRows);
                }
            }

            if (typeof onProgress === 'function') {
                onProgress({
                    processed: Math.min(start + chunkRows.length, rows.length),
                    total: rows.length,
                    successCount,
                    errorCount
                });
            }
        }

        if (completedArchiveBundles.length > 0) {
            this.saveTripsBatchToHostingArchive(completedArchiveBundles, false).catch(() => { });
        }

        return { successCount, errorCount, errors, failedRows };
    },

    // ----------------------------------------------------
    // 4. SLA MONITORING 3-TAB ENGINE
    // ----------------------------------------------------
    subscribeSLAOutbound(callback) {
        let slaCache = this.getLocalStore('sla_outbound') || [];
        let incCache = this.getLocalStore('incoming') || [];
        let monCache = this.getLocalStore('monitoring_4h') || [];

        const DEMO_TRIP_IDS = new Set([
            'DBGX2610020001', 'DBGX2610020002', 'DBGX2610020003',
            'DBGX2610020004', 'DBGX2610020005', 'DBGX2610020006',
            '4234234', 'DBDBDBDB'
        ]);

        const isReturnTripItem = (item, k) => {
            return Boolean(
                item.tripType === 'RETURN' ||
                item.isBalikan ||
                String(k || '').toUpperCase().includes('-RET') ||
                String(item.trip || item.namaRute || '').toUpperCase().startsWith('BALIKAN')
            );
        };

        const emitMergedSLA = () => {
            const mergedMap = new Map();
            const deletedSet = this._getDeletedTripIdsSet();

            // 1. Gabungkan dari incoming
            incCache.forEach(item => {
                if (!item) return;
                const k = String(item.kodeTugas || item.id || '').trim();
                if (k && !DEMO_TRIP_IDS.has(k) && !deletedSet.has(k) && !isReturnTripItem(item, k) && (item.jamBerangkat || item.trip || item.platNomor)) {
                    mergedMap.set(k, { ...item });
                }
            });

            // 2. Gabungkan dari monitoring_4h (agar trip yang ada di Monitoring 4 Jam 100% muncul juga di SLA Vendor & Dashboard!)
            monCache.forEach(item => {
                if (!item) return;
                const k = String(item.kodeTugas || item.id || '').trim();
                if (k && !DEMO_TRIP_IDS.has(k) && !deletedSet.has(k) && !isReturnTripItem(item, k) && (item.jamBerangkat || item.trip || item.platNomor || mergedMap.has(k))) {
                    const existing = mergedMap.get(k) || {};
                    mergedMap.set(k, { ...item, ...existing, slots: item.slots || existing.slots || {} });
                }
            });

            // 3. Gabungkan dari sla_outbound
            slaCache.forEach(item => {
                if (!item) return;
                const k = String(item.kodeTugas || item.id || '').trim();
                if (k && !DEMO_TRIP_IDS.has(k) && !deletedSet.has(k) && !isReturnTripItem(item, k) && (item.jamBerangkat || item.trip || item.platNomor || mergedMap.has(k))) {
                    const existing = mergedMap.get(k) || {};
                    mergedMap.set(k, { ...existing, ...item });
                }
            });

            const monMap = new Map();
            monCache.forEach(m => {
                if (!m) return;
                const k = m.kodeTugas || m.id;
                if (k && !DEMO_TRIP_IDS.has(k)) monMap.set(k, m);
            });

            const resultList = Array.from(mergedMap.values()).map(item => {
                item.vendor = this.resolveTripVendor(item);
                if (!item.driverPhone && item.driver1) {
                    const ext = this.extractDriverAndPhone(item.driver1, '');
                    if (ext.driverPhone) {
                        item.driverPhone = ext.driverPhone;
                        item.driver1 = ext.driver1;
                    }
                }

                // 1. Bersihkan nilai literal "KOSONG" / "ONROAD" atau teks invalid dari jamSampaiAktual
                if (item.jamSampaiAktual && /^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(String(item.jamSampaiAktual).trim())) {
                    item.jamSampaiAktual = '';
                }

                const k = item.kodeTugas || item.id;
                const mon = monMap.get(k);

                // 2. Auto-heal kedatangan dari monitoring_4h jika jamSampaiAktual belum terisi
                if ((!item.jamSampaiAktual || item.jamSampaiAktual === '-') && mon && mon.slots) {
                    const slotKeys = Object.keys(mon.slots);
                    for (const sk of slotKeys) {
                        const s = mon.slots[sk];
                        if (s && s.lokasi) {
                            const uLoc = String(s.lokasi).toUpperCase();
                            const isOut = uLoc.startsWith('OUT') || uLoc.includes('OUT JKT') || uLoc.includes('BERANGKAT');
                            const isArr = !isOut && (uLoc.startsWith('IN') || uLoc.includes('GATEWAY IN') || uLoc.includes('GW IN') || uLoc.includes('SAMPAI') || uLoc.includes('TIBA') || s.jenisUpdate === 'Sampai');
                            if (isArr) {
                                item.jamSampaiAktual = s.jamUpdateAktual || mon.lastUpdateTime || '';
                                break;
                            }
                        }
                    }
                }

                // 3. Normalisasi Target SLA Rute Resmi & tanggal jamSampaiAktual terhadap jamBerangkat
                const targetH = this.resolveEffectiveTargetSLAHours(item);
                item.targetSLAHours = targetH;
                item.targetSLAOutboundHours = targetH;
                if (item.jamSampaiAktual) {
                    item.jamSampaiAktual = this.normalizeArrivalAgainstDeparture(
                        item.jamBerangkat,
                        item.jamSampaiAktual,
                        targetH,
                        mon ? mon.slots : null
                    );
                }

                // 4. Hitung statusSla & lateMinutes secara akurat dan konsisten
                if (item.jamSampaiAktual && window.SLACountdownEngine) {
                    const depD = window.SLACountdownEngine.parseTimestamp(item.jamBerangkat);
                    const arrD = window.SLACountdownEngine.parseTimestamp(item.jamSampaiAktual);
                    if (depD && arrD) {
                        const durMin = Math.max(0, Math.round((arrD.getTime() - depD.getTime()) / 60000));
                        const targetMin = Math.round(targetH * 60);
                        const lateMin = Math.max(0, durMin - targetMin);
                        item.durasiBerangkatMinutes = durMin;
                        item.lateMinutes = lateMin;
                        if (item.statusSla !== 'KENDALA') {
                            item.statusSla = lateMin > 0 ? 'LATE' : 'ON TIME';
                        }
                    }
                }

                // 5. Auto-heal Total AWB jika belum terisi di sla_outbound
                if (!item.totalAwb && mon && mon.totalAwb) {
                    item.totalAwb = mon.totalAwb;
                }

                return item;
            });
            this.saveLocalStore('sla_outbound', resultList);
            callback(this.filterListByActiveVendorScope('sla_outbound', resultList));
        };

        let slaEmitTimer = null;
        const scheduleEmitSLA = (immediate = false) => {
            if (slaEmitTimer) clearTimeout(slaEmitTimer);
            if (immediate) {
                emitMergedSLA();
            } else {
                slaEmitTimer = setTimeout(emitMergedSLA, 30);
            }
        };

        // 1. Emit data cache seketika (0ms render)
        scheduleEmitSLA(true);

        const localHandler = (ev) => {
            const col = ev && ev.detail && (ev.detail.collection || ev.detail.colName);
            if (col && col !== 'sla_outbound' && col !== 'incoming' && col !== 'monitoring_4h') return;
            slaCache = this.getLocalStore('sla_outbound') || [];
            incCache = this.getLocalStore('incoming') || [];
            monCache = this.getLocalStore('monitoring_4h') || [];
            scheduleEmitSLA(false);
        };
        window.addEventListener('jnt_data_updated', localHandler);

        const unsubSla = this._attachSharedSnapshot('sla_outbound', (docs) => {
            slaCache = docs;
            scheduleEmitSLA(false);
        });
        const unsubInc = this._attachSharedSnapshot('incoming', (docs) => {
            incCache = docs;
            scheduleEmitSLA(false);
        });
        const unsubMon = this._attachSharedSnapshot('monitoring_4h', (docs) => {
            monCache = docs;
            scheduleEmitSLA(false);
        });

        return () => {
            window.removeEventListener('jnt_data_updated', localHandler);
            if (typeof unsubSla === 'function') unsubSla();
            if (typeof unsubInc === 'function') unsubInc();
            if (typeof unsubMon === 'function') unsubMon();
        };
    },

    async saveSLAOutbound(kodeTugas, updateObj) {
        const shiftId = this.getActiveShiftId();
        await this.saveDoc('sla_outbound', kodeTugas, { ...updateObj, shiftId: shiftId }, true);
        await this.recalculateSLARoundtrip(kodeTugas);

        // Synchronize SLA Outbound update -> Monitoring 4H & Incoming
        if (updateObj.jamSampaiAktual) {
            const monUpdated = await this.saveDoc('monitoring_4h', kodeTugas, {
                statusPerjalanan: 'COMPLETED',
                lastUpdateTime: updateObj.jamSampaiAktual,
                jamSampaiAktual: updateObj.jamSampaiAktual
            }, true);
            const incUpdated = await this.saveDoc('incoming', kodeTugas, {
                status: 'SUDAH SELESAI',
                jamSampaiAktual: updateObj.jamSampaiAktual
            }, true);
            const slaFull = (this.getLocalStore('sla_outbound') || []).find(s => (s.kodeTugas || s.id) === kodeTugas) || { kodeTugas, ...updateObj };
            // Arsipkan trip yang sudah selesai ke hosting cPanel (trip_archive.php) tanpa menghapus dari Firestore
            this.saveTripsBatchToHostingArchive([{
                kodeTugas,
                incoming: incUpdated,
                sla_outbound: slaFull,
                monitoring_4h: monUpdated
            }], false).catch(() => { });
        }

        await this.logAuditEvent({
            waktu: this.formatStandardDateTime(),
            operator: updateObj.inputBy || sessionStorage.getItem('jnt_active_username') || "Farizs Hakim",
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
            waktu: this.formatStandardDateTime(),
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

        // 1. Ambil data SSOT trip asal untuk enrich metadata lengkap
        let incData = {};
        let outData = {};
        let existingRet = {};
        try { incData = (await this.getDoc('incoming', kodeTugas)) || {}; } catch (e) { }
        try { outData = (await this.getDoc('sla_outbound', kodeTugas)) || {}; } catch (e) { }
        try { existingRet = (await this.getDoc('sla_return', returnObj.kodeTugasAsal || kodeTugas)) || {}; } catch (e) { }
        const origin = { ...outData, ...incData };

        const kodeBalikan = returnObj.kodeTugasBalikan || returnObj.kodeBalikan || returnObj.kodeTugas || `${kodeTugas}-RET`;
        const kodeAsal = returnObj.kodeTugasAsal || kodeTugas;
        const originTrip = origin.trip || origin.namaRute || '';
        const tripName = returnObj.trip || (originTrip ? `BALIKAN ${originTrip}` : 'BALIKAN GATEWAY - JKT999');
        const tripUpper = String(tripName).toUpperCase();
        const inferredFleet = tripUpper.includes('CDD') ? 'CDD' : (tripUpper.includes('KONTAINER') ? 'KONTAINER' : (tripUpper.includes('WINGBOX') ? 'WINGBOX' : 'FUSO'));
        const vendor = returnObj.vendor || origin.vendor || (this.resolveTripVendor ? this.resolveTripVendor(origin) : '') || 'J&T';
        const platNomor = returnObj.platNomor || origin.platNomor || '-';
        const driver1 = returnObj.driver1 || origin.driver1 || '-';
        const driverPhone = returnObj.driverPhone || origin.driverPhone || '';
        const driver2 = returnObj.driver2 || origin.driver2 || '';
        const driver2Phone = returnObj.driver2Phone || origin.driver2Phone || '';
        const totalAwb = returnObj.totalAwb !== undefined ? returnObj.totalAwb : (origin.totalAwb || 0);
        const tlc = returnObj.tlc || origin.tlc || `JKT999 ${inferredFleet}`;
        const jenisMobil = returnObj.jenisMobil || origin.jenisMobil || inferredFleet;
        const targetHours = returnObj.targetSLABalikanHours || returnObj.targetSLAHours || origin.targetSLAReturnHours || 16;
        const jamBerangkat = returnObj.jamBerangkatGateway || returnObj.jamBerangkat || '';
        const jamSampai = returnObj.jamSampaiJKT999 || returnObj.jamSampaiAktual || '';
        const isFinished = Boolean(jamSampai && jamSampai !== '-');
        const arrivalLoc = returnObj.lokasiSampai || 'IN JKT999';
        const resolvedRetPhoto = returnObj.fotoSampai || existingRet.fotoSampai || '';

        const enrichedReturn = {
            ...returnObj,
            id: kodeAsal,
            kodeTugas: kodeBalikan,
            kodeTugasBalikan: kodeBalikan,
            kodeTugasAsal: kodeAsal,
            vendor: vendor,
            platNomor: platNomor,
            driver1: driver1,
            driverPhone: driverPhone,
            driver2: driver2,
            driver2Phone: driver2Phone,
            totalAwb: totalAwb,
            trip: tripName,
            namaRute: tripName,
            tlc: tlc,
            jenisMobil: jenisMobil,
            tripType: 'RETURN',
            isBalikan: true,
            jamBerangkat: jamBerangkat,
            jamBerangkatGateway: jamBerangkat,
            jamSampaiAktual: jamSampai,
            jamSampaiJKT999: jamSampai,
            targetSLAHours: targetHours,
            targetSLABalikanHours: targetHours,
            fotoSampai: resolvedRetPhoto,
            hasFotoSampai: Boolean(resolvedRetPhoto || returnObj.hasFotoSampai || existingRet.hasFotoSampai),
            statusPerjalanan: isFinished ? 'COMPLETED' : 'ON PROGRESS',
            shiftId: shiftId
        };

        // 1. Simpan ke koleksi sla_return (indexed by kodeAsal)
        await this.saveDoc('sla_return', kodeAsal, enrichedReturn, true);

        // 2. Synchronize ke koleksi monitoring_4h (indexed by kodeBalikan)
        let existingMon = null;
        try { existingMon = await this.getDoc('monitoring_4h', kodeBalikan); } catch (e) { }
        if (!existingMon) {
            existingMon = (this.getLocalStore('monitoring_4h') || []).find(m => (m.kodeTugas || m.id) === kodeBalikan) || null;
        }

        const existingSlots = (existingMon && existingMon.slots) ? { ...existingMon.slots } : {};
        const allSlotKeys = this.getMonitoringSlotKeys();
        allSlotKeys.forEach(k => {
            if (!(k in existingSlots)) existingSlots[k] = null;
        });

        const depSlotIdx = this.getDepartureSlotIndex(jamBerangkat);
        const depSlotKey = (depSlotIdx >= 0 && depSlotIdx < allSlotKeys.length) ? allSlotKeys[depSlotIdx] : allSlotKeys[0];

        if (!existingSlots[depSlotKey]) {
            existingSlots[depSlotKey] = {
                lokasi: "OUT GATEWAY",
                keterangan: "Keberangkatan Balikan",
                jenisUpdate: "Lokasi Normal",
                jamUpdateAktual: jamBerangkat,
                inputBy: returnObj.inputBy || sessionStorage.getItem('jnt_active_username') || "Operator",
                shiftId: shiftId,
                statusUpdate: "SUDAH UPDATE"
            };
        }

        let lastLoc = existingSlots[depSlotKey]?.lokasi || "OUT GATEWAY";
        let lastTime = jamBerangkat;
        let lastSlot = depSlotKey;

        if (isFinished) {
            let arrSlotIdx = -1;
            const parsedArr = this.parseMonitoringDate ? this.parseMonitoringDate(jamSampai) : null;
            if (parsedArr && jamBerangkat) {
                arrSlotIdx = this.getCheckinSlotIndexByTime(jamBerangkat, parsedArr);
            }
            if (arrSlotIdx === null || arrSlotIdx < 0 || arrSlotIdx >= allSlotKeys.length) {
                arrSlotIdx = Math.min(allSlotKeys.length - 1, (depSlotIdx >= 0 ? depSlotIdx + 1 : 1));
            }
            const arrSlotKey = allSlotKeys[arrSlotIdx];
            const finalMonPhoto = resolvedRetPhoto || (existingMon && existingMon.fotoSampai) || '';
            existingSlots[arrSlotKey] = {
                lokasi: arrivalLoc,
                keterangan: returnObj.catatan || returnObj.alasan || "Sampai JKT999",
                jenisUpdate: "Sampai",
                jamUpdateAktual: jamSampai,
                inputBy: returnObj.inputBy || sessionStorage.getItem('jnt_active_username') || "Operator",
                shiftId: shiftId,
                statusUpdate: "SUDAH UPDATE",
                ...(finalMonPhoto ? { foto: finalMonPhoto, fotoUrl: finalMonPhoto } : {})
            };
            lastLoc = arrivalLoc;
            lastTime = jamSampai;
            lastSlot = arrSlotKey;
        }

        const monFotoSampai = resolvedRetPhoto || (existingMon && existingMon.fotoSampai) || '';
        const monPayload = {
            id: kodeBalikan,
            kodeTugas: kodeBalikan,
            kodeTugasBalikan: kodeBalikan,
            kodeTugasAsal: kodeAsal,
            vendor: vendor,
            platNomor: platNomor,
            driver1: driver1,
            driverPhone: driverPhone,
            driver2: driver2,
            driver2Phone: driver2Phone,
            totalAwb: totalAwb,
            trip: tripName,
            namaRute: tripName,
            tlc: tlc,
            jenisMobil: jenisMobil,
            tripType: 'RETURN',
            isBalikan: true,
            jamBerangkat: jamBerangkat,
            jamBerangkatGateway: jamBerangkat,
            jamSampaiAktual: jamSampai,
            jamSampaiJKT999: jamSampai,
            targetSLAHours: targetHours,
            targetSLABalikanHours: targetHours,
            slots: existingSlots,
            lastUpdateSlot: lastSlot,
            lastUpdateLokasi: lastLoc,
            lastUpdateTime: lastTime,
            lokasiSampai: isFinished ? arrivalLoc : '',
            fotoSampai: monFotoSampai,
            hasFotoSampai: Boolean(monFotoSampai || returnObj.hasFotoSampai || (existingMon && existingMon.hasFotoSampai)),
            catatanSampai: returnObj.catatan || (existingMon && existingMon.catatanSampai) || '',
            statusPerjalanan: isFinished ? 'COMPLETED' : 'ON PROGRESS',
            shiftId: shiftId
        };

        await this.saveDoc('monitoring_4h', kodeBalikan, monPayload, true);

        // 3. Hitung ulang SLA Roundtrip
        await this.recalculateSLARoundtrip(kodeAsal);

        // 4. Log Audit Trail
        await this.logAuditEvent({
            waktu: this.formatStandardDateTime(),
            operator: returnObj.inputBy || sessionStorage.getItem('jnt_active_username') || "Operator",
            shiftId: shiftId,
            modul: "SLA Vendor",
            kodeTugas: kodeBalikan,
            aktivitas: `Sinkronisasi Perjalanan Balikan (${kodeBalikan} Asal: ${kodeAsal}) ke Monitoring 4 Jam — Status: ${isFinished ? 'COMPLETED' : 'ON PROGRESS'}`
        });

        // 5. Trigger event cross-tab / real-time listener
        window.dispatchEvent(new CustomEvent('jnt_data_updated', {
            detail: { collection: 'sla_return', id: kodeAsal, data: enrichedReturn }
        }));
        window.dispatchEvent(new CustomEvent('jnt_data_updated', {
            detail: { collection: 'monitoring_4h', id: kodeBalikan, data: monPayload }
        }));
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
            const resolvedVendor = this.resolveTripVendor({
                vendor: outData.vendor || incData.vendor || retData.vendor || '',
                platNomor: outData.platNomor || incData.platNomor || retData.platNomor || ''
            });
            const resolvedPlat = outData.platNomor || incData.platNomor || retData.platNomor || '-';

            if (!retData || !retData.jamSampaiJKT999) {
                await this.saveDoc('sla_roundtrip', kodeTugas, {
                    kodeTugas: kodeTugas,
                    trip: incData.trip || outData.trip || "-",
                    vendor: resolvedVendor,
                    platNomor: resolvedPlat,
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
                trip: incData.trip || outData.trip || "-",
                vendor: resolvedVendor,
                platNomor: resolvedPlat,
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
        const DEMO_TRIP_IDS = new Set([
            'DBGX2610020001', 'DBGX2610020002', 'DBGX2610020003',
            'DBGX2610020004', 'DBGX2610020005', 'DBGX2610020006',
            '4234234', 'DBDBDBDB'
        ]);

        let slaCache = this.getLocalStore('sla_outbound') || [];
        let incCache = this.getLocalStore('incoming') || [];
        let monCache = this.getLocalStore('monitoring_4h') || [];
        let retCache = this.getLocalStore('sla_return') || [];

        const buildAndEmit = () => {
            const mergedMap = new Map();

            const upsertTrip = (raw, source) => {
                if (!raw) return;
                const kode = String(raw.kodeTugas || raw.kodeTugasBalikan || raw.id || '').trim();
                if (!kode || DEMO_TRIP_IDS.has(kode)) return;

                const prev = mergedMap.get(kode) || {};
                const merged = { ...prev, ...raw, kodeTugas: kode };

                merged.platNomor = String(raw.platNomor || prev.platNomor || '-').trim();
                merged.trip = String(raw.trip || prev.trip || raw.namaRute || prev.namaRute || raw.tlc || prev.tlc || '-').trim();
                merged.namaRute = String(raw.namaRute || prev.namaRute || raw.rute || prev.rute || merged.trip || '-').trim();
                merged.tlc = String(raw.tlc || prev.tlc || merged.trip || '-').trim();
                merged.vendor = this.resolveTripVendor(merged);

                const rawDriver1 = String(raw.driver1 || raw.driver || prev.driver1 || prev.driver || '-').trim();
                const rawPhone1 = String(raw.driverPhone || raw.driverPhone1 || prev.driverPhone || prev.driverPhone1 || '').trim();
                const dInfo = this.extractDriverAndPhone ? this.extractDriverAndPhone(rawDriver1, rawPhone1) : { driver1: rawDriver1, driverPhone: rawPhone1 };
                merged.driver1 = dInfo.driver1 || rawDriver1 || '-';
                merged.driverPhone = dInfo.driverPhone || rawPhone1 || '';
                merged.driver2 = String(raw.driver2 || prev.driver2 || dInfo.driver2 || '').trim();
                merged.driver2Phone = String(raw.driver2Phone || prev.driver2Phone || dInfo.driver2Phone || '').trim();

                merged.jamBerangkat = raw.jamBerangkat || prev.jamBerangkat || raw.jamBerangkatGateway || prev.jamBerangkatGateway || '';
                merged.jamSampaiAktual = raw.jamSampaiAktual || prev.jamSampaiAktual || raw.jamSampaiJKT999 || prev.jamSampaiJKT999 || '';
                if (merged.jamSampaiAktual && /^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(String(merged.jamSampaiAktual).trim())) {
                    merged.jamSampaiAktual = '';
                }

                const rawSt = String(merged.statusPerjalanan || merged.statusSla || merged.status || '').toUpperCase();
                const isCompleted = Boolean(merged.jamSampaiAktual) || rawSt === 'COMPLETED' || rawSt === 'SUDAH SELESAI' || rawSt === 'ON TIME';
                merged._isActiveOnRoad = !isCompleted;
                merged._source = source;

                mergedMap.set(kode, merged);
            };

            incCache.forEach(item => upsertTrip(item, 'incoming'));
            slaCache.forEach(item => upsertTrip(item, 'sla_outbound'));
            monCache.forEach(item => upsertTrip(item, 'monitoring_4h'));
            retCache.forEach(item => {
                const kodeBalikan = item.kodeTugasBalikan || item.kodeBalikan || item.kodeTugas || (item.id ? `${item.id}-RET` : '');
                if (!kodeBalikan) return;
                upsertTrip({
                    ...item,
                    kodeTugas: kodeBalikan,
                    trip: item.trip || 'BALIKAN (Gateway → JKT999)',
                    isBalikan: true,
                    tripType: 'RETURN'
                }, 'sla_return');
            });

            const list = Array.from(mergedMap.values());
            list.sort((a, b) => {
                if (a._isActiveOnRoad !== b._isActiveOnRoad) return a._isActiveOnRoad ? -1 : 1;
                return String(b.jamBerangkat || '').localeCompare(String(a.jamBerangkat || '')) ||
                    String(a.kodeTugas || '').localeCompare(String(b.kodeTugas || ''));
            });

            callback(list);
        };

        let emitTimer = null;
        const scheduleEmit = (immediate = false) => {
            if (emitTimer) clearTimeout(emitTimer);
            if (immediate) buildAndEmit();
            else emitTimer = setTimeout(buildAndEmit, 40);
        };

        scheduleEmit(true);

        const localHandler = (ev) => {
            const col = ev && ev.detail && (ev.detail.collection || ev.detail.colName);
            if (col && !['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return'].includes(col)) return;
            slaCache = this.getLocalStore('sla_outbound') || [];
            incCache = this.getLocalStore('incoming') || [];
            monCache = this.getLocalStore('monitoring_4h') || [];
            retCache = this.getLocalStore('sla_return') || [];
            scheduleEmit(false);
        };
        window.addEventListener('jnt_data_updated', localHandler);

        const unsub1 = this._attachSharedSnapshot('sla_outbound', (docs) => {
            slaCache = docs;
            scheduleEmit(false);
        });
        const unsub2 = this._attachSharedSnapshot('monitoring_4h', (docs) => {
            monCache = docs;
            scheduleEmit(false);
        });
        const unsub3 = this._attachSharedSnapshot('incoming', (docs) => {
            incCache = docs;
            scheduleEmit(false);
        });
        const unsub4 = this._attachSharedSnapshot('sla_return', (docs) => {
            retCache = docs;
            scheduleEmit(false);
        });

        return () => {
            window.removeEventListener('jnt_data_updated', localHandler);
            if (typeof unsub1 === 'function') unsub1();
            if (typeof unsub2 === 'function') unsub2();
            if (typeof unsub3 === 'function') unsub3();
            if (typeof unsub4 === 'function') unsub4();
        };
    },

    subscribeMonitoring4H(callback) {
        if (!window.db) {
            // Fallback for offline / local storage
            return this.createSub('monitoring_4h', (monList) => {
                const incList = this.getLocalStore('incoming') || [];
                const slaList = this.getLocalStore('sla_outbound') || [];
                const retList = this.getLocalStore('sla_return') || [];
                const mergedMap = new Map();
                slaList.forEach(item => { const k = item.kodeTugas || item.id; if (k) mergedMap.set(k, { ...item, slots: {} }); });
                incList.forEach(item => { const k = item.kodeTugas || item.id; if (k && !mergedMap.has(k)) mergedMap.set(k, { ...item, slots: {} }); });

                // Synchronize SLA Return (Armada Balikan)
                retList.forEach(ret => {
                    const retKey = ret.kodeTugasBalikan || ret.kodeBalikan || ret.kodeTugas || (ret.id ? `${ret.id}-RET` : '');
                    if (!retKey) return;
                    const asalKey = ret.kodeTugasAsal || ret.id;
                    const origin = mergedMap.get(asalKey) || {};
                    const originTrip = origin.trip || origin.namaRute || '';
                    const tripName = ret.trip || (originTrip ? `BALIKAN ${originTrip}` : 'BALIKAN GATEWAY - JKT999');
                    const vendor = ret.vendor || origin.vendor || (this.resolveTripVendor ? this.resolveTripVendor(origin) : '') || 'J&T';
                    const jamBerangkat = ret.jamBerangkatGateway || ret.jamBerangkat || '';
                    const jamSampai = ret.jamSampaiJKT999 || ret.jamSampaiAktual || '';
                    const isFinished = Boolean(jamSampai && jamSampai !== '-');

                    mergedMap.set(retKey, JNTFirebaseService._buildReturnMonitoringDoc({
                        ret,
                        origin,
                        retKey,
                        asalKey,
                        vendor,
                        tripName,
                        jamBerangkat,
                        jamSampai,
                        isFinished
                    }));
                });

                (monList || []).forEach(item => {
                    const k = item.kodeTugas || item.id;
                    if (k) {
                        const existing = mergedMap.get(k) || { ...item, slots: {} };
                        mergedMap.set(k, {
                            ...existing,
                            ...item,
                            tripType: item.tripType || existing.tripType || (item.isBalikan || existing.isBalikan ? 'RETURN' : 'OUTBOUND'),
                            isBalikan: Boolean(item.isBalikan || existing.isBalikan),
                            slots: { ...(existing.slots || {}), ...(item.slots || {}) }
                        });
                    }
                });
                callback(Array.from(mergedMap.values()).map(item => {
                    item.vendor = this.resolveTripVendor(item);
                    return this.normalizeMonitoringSlots(item);
                }));
            });
        }

        // REAL-TIME FIRESTORE MULTI-COLLECTION MERGE LISTENER (sla_outbound + incoming + sla_return + monitoring_4h)
        let slaCache = this.getLocalStore('sla_outbound') || [];
        let incCache = this.getLocalStore('incoming') || [];
        let retCache = this.getLocalStore('sla_return') || [];
        let monCache = this.getLocalStore('monitoring_4h') || [];

        const DEMO_TRIP_IDS = new Set([
            'DBGX2610020001', 'DBGX2610020002', 'DBGX2610020003',
            'DBGX2610020004', 'DBGX2610020005', 'DBGX2610020006',
            '4234234', 'DBDBDBDB'
        ]);

        const emitMergedData = () => {
            const mergedMap = new Map();
            const deletedSet = this._getDeletedTripIdsSet();

            // 1. All SLA Outbound trips from Firestore / local cache
            slaCache.forEach(item => {
                const key = String(item.kodeTugas || item.id || '').trim();
                if (key && !DEMO_TRIP_IDS.has(key) && !deletedSet.has(key)) mergedMap.set(key, { ...item, slots: {} });
            });

            // 2. All Incoming trips from Firestore / local cache
            incCache.forEach(item => {
                const key = String(item.kodeTugas || item.id || '').trim();
                if (key && !DEMO_TRIP_IDS.has(key) && !deletedSet.has(key) && !mergedMap.has(key)) mergedMap.set(key, { ...item, slots: {} });
            });

            // 3. Synchronize All SLA Return (Armada Balikan)
            retCache.forEach(ret => {
                const retKey = String(ret.kodeTugasBalikan || ret.kodeBalikan || ret.kodeTugas || (ret.id ? `${ret.id}-RET` : '')).trim();
                if (!retKey || deletedSet.has(retKey)) return;
                const asalKey = String(ret.kodeTugasAsal || ret.id || '').trim();
                if (asalKey && deletedSet.has(asalKey)) return;
                const origin = mergedMap.get(asalKey) || {};
                const originTrip = origin.trip || origin.namaRute || '';
                const tripName = ret.trip || (originTrip ? `BALIKAN ${originTrip}` : 'BALIKAN GATEWAY - JKT999');
                const vendor = ret.vendor || origin.vendor || this.resolveTripVendor(origin) || 'J&T';
                const jamBerangkat = ret.jamBerangkatGateway || ret.jamBerangkat || '';
                const jamSampai = ret.jamSampaiJKT999 || ret.jamSampaiAktual || '';
                const isFinished = Boolean(jamSampai && jamSampai !== '-');

                const retDoc = JNTFirebaseService._buildReturnMonitoringDoc({
                    ret,
                    origin,
                    retKey,
                    asalKey,
                    vendor,
                    tripName,
                    jamBerangkat,
                    jamSampai,
                    isFinished
                });

                if (!mergedMap.has(retKey)) {
                    mergedMap.set(retKey, retDoc);
                } else {
                    const existing = mergedMap.get(retKey);
                    mergedMap.set(retKey, { ...retDoc, ...existing, tripType: 'RETURN', isBalikan: true });
                }
            });

            // 4. All Monitoring 4H slot check-ins from Firestore / local cache
            monCache.forEach(item => {
                const key = String(item.kodeTugas || item.id || '').trim();
                if (key && !DEMO_TRIP_IDS.has(key) && !deletedSet.has(key)) {
                    const existing = mergedMap.get(key) || {};
                    const mergedSlots = { ...(existing.slots || {}), ...(item.slots || {}) };
                    mergedMap.set(key, {
                        ...existing,
                        ...item, // Prioritas 1: Data snapshot monitoring_4h terbaru menjadi prioritas utama, fallback ke existing bila kosong
                        trip: item.trip || existing.trip || item.namaRute || existing.namaRute || '',
                        namaRute: item.namaRute || existing.namaRute || item.trip || existing.trip || '',
                        tlc: item.tlc || existing.tlc || '',
                        vendor: item.vendor || existing.vendor || '',
                        platNomor: item.platNomor || existing.platNomor || '',
                        driver1: item.driver1 || existing.driver1 || '',
                        driver2: item.driver2 || existing.driver2 || '',
                        jamBerangkat: item.jamBerangkat || existing.jamBerangkat || '',
                        tripType: item.tripType || existing.tripType || (item.isBalikan || existing.isBalikan ? 'RETURN' : 'OUTBOUND'),
                        isBalikan: Boolean(item.isBalikan || existing.isBalikan),
                        kodeTugasBalikan: item.kodeTugasBalikan || existing.kodeTugasBalikan || (item.isBalikan ? key : ''),
                        kodeTugasAsal: item.kodeTugasAsal || existing.kodeTugasAsal || '',
                        jamSampaiAktual: item.jamSampaiAktual || existing.jamSampaiAktual || '',
                        jamSampaiJKT999: item.jamSampaiJKT999 || item.jamSampaiAktual || existing.jamSampaiJKT999 || existing.jamSampaiAktual || '',
                        fotoSampai: item.fotoSampai || existing.fotoSampai || '',
                        hasFotoSampai: Boolean(item.hasFotoSampai || existing.hasFotoSampai || item.fotoSampai || existing.fotoSampai),
                        lokasiSampai: item.lokasiSampai || existing.lokasiSampai || '',
                        catatanSampai: item.catatanSampai || existing.catatanSampai || item.catatan || existing.catatan || '',
                        catatan: item.catatan || existing.catatan || item.catatanSampai || existing.catatanSampai || '',
                        driverPhone: item.driverPhone || existing.driverPhone || '',
                        driver2Phone: item.driver2Phone || existing.driver2Phone || '',
                        totalAwb: item.totalAwb || existing.totalAwb || '',
                        inputBy: item.inputBy || existing.inputBy || '',
                        slots: mergedSlots,
                        lastUpdateSlot: item.lastUpdateSlot || existing.lastUpdateSlot || '',
                        lastUpdateLokasi: item.lastUpdateLokasi || existing.lastUpdateLokasi || '',
                        lastUpdateTime: item.lastUpdateTime || existing.lastUpdateTime || '',
                        statusPerjalanan: item.statusPerjalanan || existing.statusPerjalanan || 'ON PROGRESS'
                    });
                }
            });

            const mergedList = Array.from(mergedMap.values()).map(item => {
                item.vendor = this.resolveTripVendor(item);
                const normItem = this.normalizeMonitoringSlots(item);
                const targetH = this.resolveEffectiveTargetSLAHours(normItem);
                normItem.targetSLAHours = targetH;
                normItem.targetSLAOutboundHours = targetH;
                if (normItem.jamSampaiAktual && normItem.jamBerangkat) {
                    normItem.jamSampaiAktual = this.normalizeArrivalAgainstDeparture(
                        normItem.jamBerangkat,
                        normItem.jamSampaiAktual,
                        targetH,
                        normItem.slots
                    );
                }
                return normItem;
            });
            this.saveLocalStore('monitoring_4h', mergedList);
            callback(this.filterListByActiveVendorScope('monitoring_4h', mergedList));
        };

        let monEmitTimer = null;
        const scheduleEmitMon = (immediate = false) => {
            if (monEmitTimer) clearTimeout(monEmitTimer);
            if (immediate) {
                emitMergedData();
            } else {
                monEmitTimer = setTimeout(emitMergedData, 30);
            }
        };

        // Emit cached data immediately (0ms delay for tabs & KPI cards)
        scheduleEmitMon(true);

        const localHandler = (ev) => {
            const col = ev && ev.detail && (ev.detail.collection || ev.detail.colName);
            if (col && col !== 'sla_outbound' && col !== 'incoming' && col !== 'sla_return' && col !== 'monitoring_4h') return;
            slaCache = this.getLocalStore('sla_outbound') || [];
            incCache = this.getLocalStore('incoming') || [];
            retCache = this.getLocalStore('sla_return') || [];
            monCache = this.getLocalStore('monitoring_4h') || [];
            scheduleEmitMon(false);
        };
        window.addEventListener('jnt_data_updated', localHandler);

        const unsubSla = this._attachSharedSnapshot('sla_outbound', (docs) => {
            slaCache = docs;
            scheduleEmitMon(false);
        });
        const unsubInc = this._attachSharedSnapshot('incoming', (docs) => {
            incCache = docs;
            scheduleEmitMon(false);
        });
        const unsubRet = this._attachSharedSnapshot('sla_return', (docs) => {
            retCache = docs;
            scheduleEmitMon(false);
        });
        const unsubMon = this._attachSharedSnapshot('monitoring_4h', (docs) => {
            monCache = docs;
            scheduleEmitMon(false);
        });

        return () => {
            window.removeEventListener('jnt_data_updated', localHandler);
            if (typeof unsubSla === 'function') unsubSla();
            if (typeof unsubInc === 'function') unsubInc();
            if (typeof unsubRet === 'function') unsubRet();
            if (typeof unsubMon === 'function') unsubMon();
        };
    },

    async saveMonitoringSlotUpdate(kodeTugas, slotKey, lokasi, keterangan = "", jenisUpdate = "Lokasi Normal", jamUpdateAktual = "", inputBy = "", statusPerjalanan = "ON PROGRESS") {
        const activeUserName = sessionStorage.getItem('jnt_active_username') || "Farizs Hakim";
        const actualInputBy = inputBy || activeUserName;
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

        const incList = this.getLocalStore('incoming') || [];
        const incData = incList.find(i => (i.id === kodeTugas || i.kodeTugas === kodeTugas)) || {};

        // Perbaiki data lama: update posisi yang tercatat sebelum OUT JAKARTA dipindah ke slot setelahnya
        existing = this.normalizeMonitoringSlots(existing);
        existing.slots = { ...existing.slots };

        // GUARD: update posisi 4 jam hanya boleh SETELAH OUT JAKARTA
        const keys24 = this.getMonitoringSlotKeys();
        const targetIdx = keys24.indexOf(slotKey);
        if (targetIdx < 0) {
            throw new Error(`Slot ${slotKey} tidak valid.`);
        }
        const minIdx = this.getMinCheckinSlotIndex({
            ...existing,
            jamBerangkat: existing.jamBerangkat || incData.jamBerangkat || ""
        });
        if (targetIdx < minIdx) {
            throw new Error(`Slot ${slotKey} berada sebelum/bersamaan dengan OUT JKT999. Update posisi 4 jam hanya bisa diinput setelah armada OUT JKT999.`);
        }

        const oldSlotData = existing.slots[slotKey];
        const newSlotData = {
            lokasi: lokasi,
            keterangan: keterangan,
            jenisUpdate: jenisUpdate,
            jamUpdateAktual: jamUpdateAktual ? this.formatStandardDateTime(jamUpdateAktual) : this.formatStandardDateTime(),
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

        // ⚡ CONCURRENCY CONTROL (ATOMIC SLOT MERGE):
        // Ambil kembali snapshot dokumen terbaru tepat sebelum menyimpan dan gabungkan HANYA slot yang terisi (non-null)
        // agar dua operator yang meng-update slot berbeda (mis. Slot 08:00 & Slot 12:00) pada saat bersamaan
        // tidak saling menimpa slot operator lain dengan nilai null!
        if (window.db) {
            try {
                const latestSnap = await window.db.collection('monitoring_4h').doc(kodeTugas).get();
                if (latestSnap.exists) {
                    const latestData = latestSnap.data() || {};
                    const latestSlots = latestData.slots || {};
                    const mergedNonNullSlots = { ...existing.slots };
                    Object.keys(latestSlots).forEach(k => {
                        if (k !== slotKey && latestSlots[k] && typeof latestSlots[k] === 'object' && latestSlots[k].lokasi) {
                            mergedNonNullSlots[k] = latestSlots[k];
                        }
                    });
                    mergedNonNullSlots[slotKey] = newSlotData;
                    existing.slots = mergedNonNullSlots;
                }
            } catch (_) { }
        }

        // Bersihkan key bernilai null pada payload slots yang tidak disentuh agar merge Firestore tidak menimpa slot paralel
        const cleanSlotsPayload = {};
        Object.keys(existing.slots || {}).forEach(k => {
            if (existing.slots[k] && typeof existing.slots[k] === 'object') {
                cleanSlotsPayload[k] = existing.slots[k];
            }
        });
        cleanSlotsPayload[slotKey] = newSlotData;

        const updateObj = {
            ...existing,
            kodeTugas: kodeTugas,
            platNomor: existing.platNomor || incData.platNomor || "",
            driver1: existing.driver1 || incData.driver1 || "",
            trip: existing.trip || incData.trip || "",
            namaRute: existing.namaRute || incData.namaRute || "",
            vendor: existing.vendor || incData.vendor || incData.namaVendor || "",
            namaVendor: existing.namaVendor || incData.namaVendor || incData.vendor || "",
            tlc: existing.tlc || incData.tlc || "",
            jamBerangkat: existing.jamBerangkat || incData.jamBerangkat || "",
            slots: cleanSlotsPayload,
            lastUpdateSlot: slotKey,
            lastUpdateLokasi: lokasi,
            lastUpdateTime: newSlotData.jamUpdateAktual,
            lastUpdateBy: actualInputBy,
            statusPerjalanan: statusPerjalanan
        };

        const result = await this.saveDoc('monitoring_4h', kodeTugas, updateObj, true);

        // Jika diupdate oleh VENDOR, vendor hanya memiliki akses update ke monitoring_4h (tidak boleh menulis ke incoming/sla_outbound)
        if (this.getVerifiedRole() === 'VENDOR') {
            return result;
        }

        // Auto-sync status to Incoming, SLA Outbound, and SLA Return
        if (statusPerjalanan === 'COMPLETED' || statusPerjalanan === 'SUDAH SELESAI') {
            const incUpdated = await this.saveDoc('incoming', kodeTugas, { status: 'SUDAH SELESAI', jamSampaiAktual: newSlotData.jamUpdateAktual }, true);
            const slaUpdated = await this.saveDoc('sla_outbound', kodeTugas, { jamSampaiAktual: newSlotData.jamUpdateAktual, statusSla: 'ON TIME' }, true);
            // Arsipkan trip yang sudah selesai ke hosting cPanel (trip_archive.php) tanpa menghapus dari Firestore
            this.saveTripsBatchToHostingArchive([{
                kodeTugas,
                incoming: incUpdated,
                sla_outbound: slaUpdated,
                monitoring_4h: result
            }], false).catch(() => { });

            // Sync ke sla_return jika ini armada balikan
            if (updateObj.isBalikan || updateObj.tripType === 'RETURN' || updateObj.kodeTugasAsal) {
                const asalKey = updateObj.kodeTugasAsal || kodeTugas;
                let retDoc = {};
                try { retDoc = (await this.getDoc('sla_return', asalKey)) || {}; } catch (e) { }
                const targetHours = updateObj.targetSLABalikanHours || retDoc.targetSLABalikanHours || 16;
                const depStr = updateObj.jamBerangkatGateway || updateObj.jamBerangkat || retDoc.jamBerangkatGateway;
                const dBerg = this.parseMonitoringDate ? this.parseMonitoringDate(depStr) : null;
                const dSamp = this.parseMonitoringDate ? this.parseMonitoringDate(newSlotData.jamUpdateAktual) : null;
                let durasiMin = 0;
                if (dBerg && dSamp && dSamp > dBerg) durasiMin = Math.round((dSamp - dBerg) / 60000);
                const lateMin = Math.max(0, durasiMin - targetHours * 60);

                await this.saveDoc('sla_return', asalKey, {
                    ...retDoc,
                    jamSampaiJKT999: newSlotData.jamUpdateAktual,
                    jamSampaiAktual: newSlotData.jamUpdateAktual,
                    durasiBalikanMinutes: durasiMin,
                    totalTelatMinutes: lateMin,
                    statusPerjalanan: 'COMPLETED',
                    statusSla: lateMin > 0 ? 'LATE' : 'ON TIME'
                }, true);
                await this.recalculateSLARoundtrip(asalKey);
                window.dispatchEvent(new CustomEvent('jnt_data_updated', {
                    detail: { collection: 'sla_return', id: asalKey }
                }));
            }
        } else if (jenisUpdate === 'Trouble' || jenisUpdate === 'Laka' || statusPerjalanan === 'KENDALA') {
            await this.saveDoc('incoming', kodeTugas, { status: 'KENDALA' }, true);
            await this.saveDoc('sla_outbound', kodeTugas, { statusSla: 'KENDALA' }, true);
            if (updateObj.isBalikan || updateObj.tripType === 'RETURN' || updateObj.kodeTugasAsal) {
                const asalKey = updateObj.kodeTugasAsal || kodeTugas;
                let retDoc = {};
                try { retDoc = (await this.getDoc('sla_return', asalKey)) || {}; } catch (e) { }
                await this.saveDoc('sla_return', asalKey, {
                    ...retDoc,
                    statusPerjalanan: 'KENDALA',
                    statusSla: 'KENDALA'
                }, true);
            }
        }
        return result;
    },
    /**
     * Upload Foto ke Hosting cPanel via upload.php
     * Menyimpan fisik gambar ke folder /uploads/ di hosting cPanel,
     * dan mengembalikan URL publik gambar untuk disimpan ke Firestore.
     * @param {File|Blob|string} photoData - Objek File/Blob atau string Base64 dataURL
     * @param {string} prefix - Prefix nama file (misal 'sampai', 'trouble')
     * @returns {Promise<string>} - Mengembalikan URL foto di hosting, atau fallback ke dataURL jika upload gagal
     */
    async compressImageToCloudPayload(photoData, maxWidth = 960, quality = 0.72) {
        if (!photoData) return { blob: null, dataUrl: null };
        if (typeof photoData === 'string' && !photoData.startsWith('data:image')) {
            return { blob: null, dataUrl: photoData };
        }

        const readAsDataUrl = (input) => new Promise((resolve, reject) => {
            if (typeof input === 'string') return resolve(input);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(input);
        });

        try {
            const rawDataUrl = await readAsDataUrl(photoData);
            if (typeof document === 'undefined' || typeof Image === 'undefined') {
                return { blob: photoData instanceof Blob ? photoData : null, dataUrl: rawDataUrl };
            }

            return await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        let w = img.naturalWidth || img.width || maxWidth;
                        let h = img.naturalHeight || img.height || maxWidth;
                        if (w > maxWidth || h > maxWidth) {
                            const scale = maxWidth / Math.max(w, h);
                            w = Math.max(1, Math.round(w * scale));
                            h = Math.max(1, Math.round(h * scale));
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);

                        let q = quality;
                        let dataUrl = canvas.toDataURL('image/jpeg', q);
                        // Pastikan ukuran aman di bawah batas 1MB dokumen Cloud Firestore
                        if (dataUrl.length > 420000) {
                            q = 0.55;
                            dataUrl = canvas.toDataURL('image/jpeg', q);
                        }
                        if (canvas.toBlob) {
                            canvas.toBlob((blob) => {
                                resolve({
                                    blob: blob || (photoData instanceof Blob ? photoData : null),
                                    dataUrl
                                });
                            }, 'image/jpeg', q);
                        } else {
                            resolve({ blob: photoData instanceof Blob ? photoData : null, dataUrl });
                        }
                    } catch (_) {
                        resolve({ blob: photoData instanceof Blob ? photoData : null, dataUrl: rawDataUrl });
                    }
                };
                img.onerror = () => resolve({ blob: photoData instanceof Blob ? photoData : null, dataUrl: rawDataUrl });
                img.src = rawDataUrl;
            });
        } catch (err) {
            return { blob: photoData instanceof Blob ? photoData : null, dataUrl: typeof photoData === 'string' ? photoData : null };
        }
    },

    async uploadPhotoToHosting(photoData, prefix = 'bukti') {
        if (!photoData) return null;
        if (typeof photoData === 'string' && (photoData.startsWith('http://') || photoData.startsWith('https://') || photoData.startsWith('uploads/'))) {
            return photoData;
        }

        const { blob, dataUrl } = await this.compressImageToCloudPayload(photoData, 960, 0.72);
        const fileToSend = blob || (photoData instanceof Blob ? photoData : null);

        // Tier 1: Upload ke cPanel / PHP Hosting (upload.php) bila tersedia
        try {
            if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
                const uploadEndpoint = 'upload.php';
                const authHeaders = {};
                if (window.auth && window.auth.currentUser && !window.auth.currentUser.isAnonymous) {
                    try {
                        const tok = await window.auth.currentUser.getIdToken();
                        if (tok) authHeaders['Authorization'] = `Bearer ${tok}`;
                    } catch (_) { }
                }
                let response = null;

                if (fileToSend) {
                    const formData = new FormData();
                    const origName = (photoData && photoData.name) ? photoData.name.replace(/\.[^/.]+$/, '') : `${prefix}_${Date.now()}`;
                    formData.append('file', fileToSend, `${origName}.jpg`);
                    formData.append('prefix', prefix);
                    response = await fetch(uploadEndpoint, { method: 'POST', headers: authHeaders, body: formData });
                } else if (dataUrl && dataUrl.startsWith('data:image')) {
                    response = await fetch(uploadEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify({ image: dataUrl, prefix: prefix })
                    });
                }

                const contentType = response && response.headers ? (response.headers.get('content-type') || '') : '';
                if (response && response.ok && contentType.includes('application/json')) {
                    const result = await response.json();
                    if (result && result.success && result.url) {
                        console.log('✅ [HOSTING UPLOAD] Foto tersimpan di server:', result.url);
                        return result.url;
                    }
                }
            }
        } catch (err) {
            console.warn('⚠️ [HOSTING UPLOAD] upload.php tidak tersedia, mencoba Firebase Storage:', err.message);
        }

        // Tier 2: Upload ke Firebase Storage (jika SDK & Storage Bucket aktif) dengan timeout 4 detik
        try {
            if (typeof window !== 'undefined' && window.storage) {
                const safePrefix = String(prefix || 'bukti').replace(/[^a-zA-Z0-9_-]/g, '_');
                const fileName = `bukti_sampai/${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
                const ref = window.storage.ref(fileName);
                const uploadTask = fileToSend
                    ? ref.put(fileToSend, { contentType: 'image/jpeg' })
                    : (dataUrl && dataUrl.startsWith('data:image') ? ref.putString(dataUrl, 'data_url') : null);

                if (uploadTask) {
                    const url = await Promise.race([
                        new Promise((resolve, reject) => {
                            uploadTask.on(
                                'state_changed',
                                null,
                                (error) => reject(error),
                                async () => {
                                    try {
                                        resolve(await ref.getDownloadURL());
                                    } catch (e) {
                                        reject(e);
                                    }
                                }
                            );
                        }),
                        new Promise((_, reject) => setTimeout(() => {
                            try { if (typeof uploadTask.cancel === 'function') uploadTask.cancel(); } catch (_) { }
                            reject(new Error('Firebase Storage upload timeout'));
                        }, 4000))
                    ]);
                    if (url) {
                        console.log('✅ [FIREBASE STORAGE] Foto tersimpan di Cloud Storage:', url);
                        return url;
                    }
                }
            }
        } catch (err) {
            console.warn('⚠️ [FIREBASE STORAGE] Fallback ke payload terkompresi Cloud Firestore:', err.message);
        }

        // Tier 3: Kembalikan Data URL terkompresi agar tersimpan ke Cloud Firestore (tidak pernah ke localStorage)
        return dataUrl || (typeof photoData === 'string' ? photoData : null);
    },

    // ----------------------------------------------------
    // 6. INCIDENT MANAGEMENT (TROUBLE & LAKA)
    // ----------------------------------------------------
    subscribeTroubles(callback) {
        return this.createSub('troubles', callback);
    },

    async updateTripStatus(kodeTugas, newStatus, meta = {}) {
        if (!kodeTugas || kodeTugas === '-') return;
        const stUpper = String(newStatus || 'KENDALA').toUpperCase();
        try {
            await this.saveDoc('incoming', kodeTugas, { status: stUpper }, true);
        } catch (_) { }
        try {
            await this.saveDoc('monitoring_4h', kodeTugas, { statusPerjalanan: stUpper }, true);
        } catch (_) { }
        try {
            await this.saveDoc('sla_outbound', kodeTugas, { statusSla: stUpper }, true);
        } catch (_) { }
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

        // Auto-fill master details if available from Incoming / SLA Outbound / Monitoring 4H SSOT
        let incMaster = {};
        if (incidentData.kodeTugas) {
            const k = incidentData.kodeTugas;
            const localInc = (this.getLocalStore('incoming') || []).find(i => (i.kodeTugas || i.id) === k);
            const localSla = (this.getLocalStore('sla_outbound') || []).find(i => (i.kodeTugas || i.id) === k);
            const localMon = (this.getLocalStore('monitoring_4h') || []).find(i => (i.kodeTugas || i.id) === k);
            incMaster = { ...(localInc || {}), ...(localSla || {}), ...(localMon || {}) };
            if (!incMaster.kodeTugas && window.db) {
                try {
                    incMaster = (await this.getDoc('sla_outbound', k)) || (await this.getDoc('incoming', k)) || (await this.getDoc('monitoring_4h', k)) || {};
                } catch (_) { }
            }
        }

        const resolvedVendor = this.resolveTripVendor({
            vendor: incidentData.vendor || incMaster.vendor || incMaster.namaVendor || '',
            platNomor: incidentData.platNomor || incMaster.platNomor || ''
        });
        const resolvedTlc = incidentData.tlc || incMaster.tlc || incMaster.trip || incidentData.rute || "-";
        const resolvedRute = incidentData.rute || incMaster.namaRute || incMaster.rute || incMaster.trip || "-";

        const deterministicId = incidentData.incidentId
            || (incidentData.kodeTugas && incidentData.kodeTugas !== '-'
                ? `INC-${String(incidentData.kodeTugas).trim()}-${String(incidentData.kategoriTrouble || 'TROUBLE').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
                : `INC-${Date.now()}`);

        const fullIncident = {
            incidentId: deterministicId,
            id: deterministicId,
            kodeTugas: incidentData.kodeTugas || "-",
            jenis: incidentData.jenis || "Trouble Armada",
            kategoriTrouble: incidentData.kategoriTrouble || "Kendala Operasional",
            severity: incidentData.severity || "MEDIUM",
            lokasiKejadian: incidentData.lokasiKejadian || "Rest Area / Jalur Rute",
            waktuKejadian: incidentData.waktuKejadian ? this.formatStandardDateTime(incidentData.waktuKejadian) : this.formatStandardDateTime(),
            platNomor: incidentData.platNomor || incMaster.platNomor || "-",
            driver: incidentData.driver || incMaster.driver1 || incMaster.driver || "-",
            driverPhone: incidentData.driverPhone || incMaster.driverPhone || incMaster.driverPhone1 || "-",
            driver2: incidentData.driver2 || incMaster.driver2 || "-",
            driver2Phone: incidentData.driver2Phone || incMaster.driver2Phone || "-",
            vendor: resolvedVendor,
            tlc: resolvedTlc,
            rute: resolvedRute,
            deskripsi: incidentData.deskripsi || "Kejadian terdeteksi pada operasional.",
            dilaporkanOleh: incidentData.dilaporkanOleh || sessionStorage.getItem('jnt_active_username') || "Farizs Hakim",
            status: incidentData.status || "DALAM PENANGANAN",
            fotoKejadian: incidentData.fotoKejadian || [],
            fotoSelesai: incidentData.fotoSelesai || [],
            shiftId: shiftId,
            createdAt: new Date().toISOString(),
            history: [
                {
                    time: incidentData.waktuKejadian ? this.formatStandardDateTime(incidentData.waktuKejadian) : this.formatStandardDateTime(),
                    note: `Laporan incident ${incidentData.jenis || 'Trouble'} dikirim oleh ${incidentData.dilaporkanOleh || sessionStorage.getItem('jnt_active_username') || 'Operator'}`,
                    status: incidentData.status || "OPEN",
                    user: incidentData.dilaporkanOleh || sessionStorage.getItem('jnt_active_username') || "Operator"
                }
            ]
        };

        await this.saveDoc('troubles', fullIncident.incidentId, fullIncident, true);

        // Update status armada di Incoming, Monitoring 4H & SLA Outbound menjadi KENDALA jika insiden aktif (Hanya untuk internal staff; VENDOR tidak menulis ke incoming/sla_outbound)
        if (incidentData.kodeTugas && fullIncident.status !== 'SUDAH SELESAI' && this.getVerifiedRole() !== 'VENDOR') {
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

    async updateIncidentStatus(incidentId, newStatus, note = "", user = "", restoreTripStatus = true, fotoSelesai = null, extraFotoKejadian = null) {
        const actualUser = user || sessionStorage.getItem('jnt_active_username') || "Farizs Hakim";
        const data = await this.getDoc('troubles', incidentId);
        if (!data) {
            console.warn(`[TROUBLE] Incident with ID ${incidentId} not found.`);
            return null;
        }

        const history = Array.isArray(data.history) ? [...data.history] : [];
        const nowStr = this.formatStandardDateTime();
        history.push({
            time: nowStr,
            note: note || `Status diperbarui menjadi ${newStatus}`,
            status: newStatus,
            user: user
        });

        const existingKejadian = Array.isArray(data.fotoKejadian) ? data.fotoKejadian : [];
        const existingSelesai = Array.isArray(data.fotoSelesai) ? data.fotoSelesai : [];

        const updatedData = {
            ...data,
            status: newStatus,
            fotoKejadian: extraFotoKejadian && Array.isArray(extraFotoKejadian) ? [...existingKejadian, ...extraFotoKejadian] : existingKejadian,
            fotoSelesai: fotoSelesai && Array.isArray(fotoSelesai) ? [...existingSelesai, ...fotoSelesai] : existingSelesai,
            history: history,
            updatedAt: new Date().toISOString()
        };

        await this.saveDoc('troubles', incidentId, updatedData, true);
        if (newStatus === 'SUDAH SELESAI' || newStatus === 'RESOLVED' || newStatus === 'SELESAI') {
            this.saveTroubleToHostingArchive(updatedData).catch(() => { });
        }

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

        // Deactivate existing active shifts & arsipkan ke shift_history.php di hosting
        for (const s of shifts) {
            if (s.status === 'AKTIF') {
                const endedShift = await this.saveDoc('shifts', s.shiftId || s.id, { status: 'COMPLETED', endedAt: new Date().toISOString() }, true);
                this.saveShiftToHostingHistory({ ...s, ...endedShift, status: 'COMPLETED' }).catch(() => { });
            }
        }

        const dateStr = shiftData.tanggal ? shiftData.tanggal.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayShifts = shifts.filter(s => (s.shiftId || s.id || '').includes(dateStr));
        const nextSeq = String(todayShifts.length + 1).padStart(2, '0');
        const newShiftId = shiftData.shiftId || `SHIFT-${dateStr}-${nextSeq}`;

        const isShift2 = String(shiftData.namaShift || '').includes('Shift 2') || shiftData.jamMulai === "20:30";
        const jamMulaiVal = isShift2 ? "20:30" : "08:30";
        const jamSelesaiVal = isShift2 ? "08:30" : "20:30";
        const defaultNamaShift = isShift2
            ? `Shift 2 (20:30 - 08:30 WIB)`
            : `Shift 1 (08:30 - 20:30 WIB)`;

        const newShiftObj = {
            id: newShiftId,
            shiftId: newShiftId,
            tanggal: shiftData.tanggal || new Date().toISOString().slice(0, 10),
            namaShift: defaultNamaShift,
            jamMulai: jamMulaiVal,
            jamSelesai: jamSelesaiVal,
            status: "AKTIF",
            operator1: {
                nama: shiftData.operator1.nama,
                role: shiftData.operator1.role || "Operator Utama",
                tugas: shiftData.operator1.tugas || "Monitoring 4 Jam"
            },
            operator2: {
                nama: shiftData.operator2.nama,
                role: shiftData.operator2.role || "Operator Pendamping",
                tugas: shiftData.operator2.tugas || "SLA"
            },
            ...(shiftData.handoverFrom ? {
                handoverFrom: shiftData.handoverFrom,
                handoverNote: shiftData.handoverNote || "Pergantian Shift Operasional",
                handoverTime: shiftData.handoverTime ? this.formatStandardDateTime(shiftData.handoverTime) : this.formatStandardDateTime()
            } : {}),
            createdAt: new Date().toISOString()
        };

        sessionStorage.setItem('jnt_active_shift_id', newShiftId);
        // FIREBASE-ONLY: Tidak menyimpan shift ID ke localStorage.

        await this.saveDoc('shifts', newShiftId, newShiftObj, true);

        await this.logAuditEvent({
            waktu: this.formatStandardDateTime(),
            operator: shiftData.operator1.nama,
            shiftId: newShiftId,
            modul: "Shift Management",
            kodeTugas: "-",
            aktivitas: `Mulai Shift Baru (${newShiftId} - ${newShiftObj.operator1.nama} [${newShiftObj.operator1.tugas}] & ${newShiftObj.operator2.nama} [${newShiftObj.operator2.tugas}])`
        });

        return newShiftObj;
    },

    async switchShift(shiftId, newOp1, newOp2, op1Tugas, op2Tugas, reason = "Pergantian Shift Operasional", jamMulai = "20:30", jamSelesai = "08:30") {
        const shifts = this.getLocalStore('shifts');
        const currentShift = shifts.find(s => (s.shiftId === shiftId || s.id === shiftId));

        let prevOpNames = "Operator Sebelumnya";
        const activeUserName = sessionStorage.getItem('jnt_active_username') || "Farizs Hakim";
        const realOps = this.getRealOperatorNames();
        const fallbackOp2 = realOps.find(n => n.toLowerCase() !== activeUserName.toLowerCase()) || realOps[0] || "-";
        if (currentShift) {
            const op1Prev = currentShift.operator1 ? currentShift.operator1.nama : activeUserName;
            const op2Prev = currentShift.operator2 ? currentShift.operator2.nama : fallbackOp2;
            prevOpNames = `${op1Prev} & ${op2Prev}`;
            await this.saveDoc('shifts', shiftId, { status: 'COMPLETED', endedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) }, true);
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const isShift2 = jamMulai === "20:30" || String(jamMulai || '').includes('Shift 2');
        const resolvedMulai = isShift2 ? "20:30" : "08:30";
        const resolvedSelesai = isShift2 ? "08:30" : "20:30";
        const nextNamaShift = isShift2
            ? `Shift 2 (20:30 - 08:30 WIB)`
            : `Shift 1 (08:30 - 20:30 WIB)`;
        const nextShift = await this.startNewShift({
            tanggal: todayStr,
            namaShift: nextNamaShift,
            jamMulai: resolvedMulai,
            jamSelesai: resolvedSelesai,
            operator1: { nama: newOp1, role: "Operator Utama", tugas: op1Tugas || "Monitoring 4 Jam" },
            operator2: { nama: newOp2, role: "Operator Pendamping", tugas: op2Tugas || "SLA" },
            handoverFrom: prevOpNames,
            handoverNote: reason,
            handoverTime: this.formatStandardDateTime()
        });

        await this.logAuditEvent({
            waktu: this.formatStandardDateTime(),
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
        const existingShift = (this.getLocalStore('shifts') || []).find(s => (s.shiftId || s.id) === id) || {};
        const updated = await this.saveDoc('shifts', id, {
            status: 'COMPLETED',
            endedAt: new Date().toISOString()
        }, true);
        this.saveShiftToHostingHistory({ ...existingShift, ...updated, status: 'COMPLETED' }).catch(() => { });

        await this.logAuditEvent({
            waktu: this.formatStandardDateTime(),
            operator: sessionStorage.getItem('jnt_active_username') || "System",
            shiftId: id,
            modul: "Shift Management",
            kodeTugas: "-",
            aktivitas: `Shift Operasional (${id}) Telah Diakhiri (Status: COMPLETED)`
        });

        return updated;
    },

    getSynthesizedAuditLogs() {
        const rawLogs = this.getLocalStore('audit_logs') || [];
        const monList = this.getLocalStore('monitoring_4h') || [];
        const slaList = this.getLocalStore('sla_outbound') || [];
        const slaRetList = this.getLocalStore('sla_return') || [];
        const troubleList = this.getLocalStore('troubles') || [];
        const shiftList = this.getLocalStore('shifts') || [];
        const activeShiftId = this.getActiveShiftId();
        const activeUser = sessionStorage.getItem('jnt_active_username') || 'Farizs Hakim';

        const map = new Map();
        rawLogs.forEach(l => {
            const key = l.id || `${l.modul}-${l.kodeTugas}-${l.waktu}-${l.aktivitas}`;
            map.set(key, l);
        });

        // Synthesize from monitoring_4h (trip + slots)
        monList.forEach(m => {
            const kode = m.kodeTugas || m.id || '-';
            const sId = m.shiftId || activeShiftId;
            const op = m.lastUpdateBy || m.inputBy || activeUser;
            const rute = m.trip || m.namaRute || m.tlc || '-';
            const plat = m.platNomor || '-';

            if (m.slots && typeof m.slots === 'object') {
                Object.entries(m.slots).forEach(([slotKey, slotVal]) => {
                    if (slotVal && (slotVal.lokasi || slotVal.statusUpdate === 'SUDAH UPDATE')) {
                        const synId = `SYN-MON-${kode}-${slotKey}`;
                        if (!map.has(synId)) {
                            const waktuStr = slotVal.jamUpdateAktual || slotVal.checkinTime || m.lastUpdateTime || m.jamBerangkat || '-';
                            const parsedDate = this.parseMonitoringDate ? this.parseMonitoringDate(waktuStr) : null;
                            map.set(synId, {
                                id: synId,
                                createdAt: parsedDate ? parsedDate.getTime() : Date.now() - 3600000,
                                waktu: waktuStr,
                                operator: slotVal.inputBy || op,
                                shiftId: slotVal.shiftId || sId,
                                modul: 'Monitoring 4H',
                                kodeTugas: kode,
                                aktivitas: `Update Slot [${slotKey}] Armada ${plat} (${rute}) → Posisi: ${slotVal.lokasi}${slotVal.keterangan ? ' (' + slotVal.keterangan + ')' : ''}`
                            });
                        }
                    }
                });
            } else {
                const synId = `SYN-MON-INIT-${kode}`;
                if (!map.has(synId)) {
                    const waktuStr = m.lastUpdateTime || m.jamBerangkat || '-';
                    const parsedDate = this.parseMonitoringDate ? this.parseMonitoringDate(waktuStr) : null;
                    map.set(synId, {
                        id: synId,
                        createdAt: parsedDate ? parsedDate.getTime() : Date.now() - 7200000,
                        waktu: waktuStr,
                        operator: op,
                        shiftId: sId,
                        modul: 'Monitoring 4H',
                        kodeTugas: kode,
                        aktivitas: `Registrasi Monitoring 4 Jam Armada ${plat} (${rute}) — Status: ${m.statusPerjalanan || 'ON PROGRESS'}`
                    });
                }
            }
        });

        // Synthesize from sla_outbound
        slaList.forEach(s => {
            const kode = s.kodeTugas || s.id || '-';
            const synId = `SYN-SLA-OUT-${kode}`;
            if (!map.has(synId)) {
                const waktuStr = s.jamSampaiAktual || s.jamBerangkat || '-';
                const parsedDate = this.parseMonitoringDate ? this.parseMonitoringDate(waktuStr) : null;
                const statusSla = s.statusSla || s.status || 'BERJALAN';
                map.set(synId, {
                    id: synId,
                    createdAt: parsedDate ? parsedDate.getTime() : Date.now() - 5400000,
                    waktu: waktuStr,
                    operator: s.inputBy || activeUser,
                    shiftId: s.shiftId || activeShiftId,
                    modul: 'SLA Vendor',
                    kodeTugas: kode,
                    aktivitas: `SLA Outbound ${s.platNomor || '-'} (${s.trip || s.namaRute || '-'} • ${s.vendor || '-'}) — Status: ${statusSla}`
                });
            }
        });

        // Synthesize from sla_return
        slaRetList.forEach(r => {
            const kode = r.kodeTugas || r.id || '-';
            const synId = `SYN-SLA-RET-${kode}`;
            if (!map.has(synId)) {
                const waktuStr = r.jamSampaiJkt || r.jamBerangkatBalik || '-';
                const parsedDate = this.parseMonitoringDate ? this.parseMonitoringDate(waktuStr) : null;
                map.set(synId, {
                    id: synId,
                    createdAt: parsedDate ? parsedDate.getTime() : Date.now() - 4800000,
                    waktu: waktuStr,
                    operator: r.inputBy || activeUser,
                    shiftId: r.shiftId || activeShiftId,
                    modul: 'SLA Vendor',
                    kodeTugas: kode,
                    aktivitas: `SLA Armada Balikan ${r.platNomor || '-'} (${r.trip || '-'}) — Status: ${r.statusSla || r.status || 'BERJALAN'}`
                });
            }
        });

        // Synthesize from troubles
        troubleList.forEach(t => {
            const incId = t.incidentId || t.id || '-';
            const synId = `SYN-TRB-${incId}`;
            if (!map.has(synId)) {
                const waktuStr = t.waktuKejadian || '-';
                const parsedDate = this.parseMonitoringDate ? this.parseMonitoringDate(waktuStr) : null;
                map.set(synId, {
                    id: synId,
                    createdAt: parsedDate ? parsedDate.getTime() : Date.now() - 1800000,
                    waktu: waktuStr,
                    operator: t.dilaporkanOleh || activeUser,
                    shiftId: t.shiftId || activeShiftId,
                    modul: 'Trouble & Laka',
                    kodeTugas: t.kodeTugas || incId,
                    aktivitas: `${t.jenis || 'Trouble'}: ${t.kategoriTrouble || t.deskripsi || '-'} di ${t.lokasiKejadian || '-'} [${t.status || 'OPEN'}]`
                });
            }
        });

        // Synthesize from shifts
        shiftList.forEach(sh => {
            const sId = sh.shiftId || sh.id || '-';
            const synId = `SYN-SHF-${sId}`;
            if (!map.has(synId)) {
                const op1 = sh.operator1 ? sh.operator1.nama : activeUser;
                const op2 = sh.operator2 ? sh.operator2.nama : '-';
                map.set(synId, {
                    id: synId,
                    createdAt: sh.createdAt ? new Date(sh.createdAt).getTime() : Date.now() - 10000000,
                    waktu: sh.handoverTime || `${sh.tanggal || ''} ${sh.jamMulai || '08:00'}`,
                    operator: op1,
                    shiftId: sId,
                    modul: 'Shift Management',
                    kodeTugas: '-',
                    aktivitas: `Penugasan Shift ${sId} (${sh.namaShift || 'Operasional'}) — Op 1: ${op1}, Op 2: ${op2} [${sh.status || 'AKTIF'}]`
                });
            }
        });

        const combined = Array.from(map.values());
        combined.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(b.waktu || '').localeCompare(String(a.waktu || '')));
        return combined;
    },

    calculateShiftMetrics(shiftId) {
        const DEMO_TRIP_IDS = new Set([
            'DBGX2610020001', 'DBGX2610020002', 'DBGX2610020003',
            'DBGX2610020004', 'DBGX2610020005', 'DBGX2610020006',
            '4234234', 'DBDBDBDB'
        ]);
        const activeShiftId = this.getActiveShiftId();
        const targetShiftId = shiftId || activeShiftId;
        const monList = (this.getLocalStore('monitoring_4h') || []).filter(m => !DEMO_TRIP_IDS.has(m.kodeTugas || m.id));
        const slaList = (this.getLocalStore('sla_outbound') || []).filter(s => !DEMO_TRIP_IDS.has(s.kodeTugas || s.id));
        const slaRetList = (this.getLocalStore('sla_return') || []).filter(r => !DEMO_TRIP_IDS.has(r.kodeTugas || r.id));
        const troubleList = (this.getLocalStore('troubles') || []).filter(t => !DEMO_TRIP_IDS.has(t.kodeTugas));
        const shiftList = this.getLocalStore('shifts') || [];
        const allLogs = this.getSynthesizedAuditLogs();

        const currentShift = shiftList.find(s => s.shiftId === targetShiftId || s.id === targetShiftId) || this.getActiveShift();
        const isTargetActive = !shiftId || targetShiftId === activeShiftId || (currentShift && currentShift.status === 'AKTIF') || shiftList.length <= 1;

        const op1Nama = currentShift && currentShift.operator1 ? currentShift.operator1.nama.toLowerCase() : '';
        const op2Nama = currentShift && currentShift.operator2 ? currentShift.operator2.nama.toLowerCase() : '';

        // Filter or use full operational dataset for active shift so it is 100% synced with Monitoring 4H & SLA Vendor
        const relevantMon = isTargetActive
            ? monList
            : monList.filter(m => m.shiftId === targetShiftId || (m.slots && Object.values(m.slots).some(s => s && s.shiftId === targetShiftId)));

        const relevantSla = isTargetActive
            ? slaList
            : slaList.filter(s => s.shiftId === targetShiftId);

        const relevantSlaRet = isTargetActive
            ? slaRetList
            : slaRetList.filter(r => r.shiftId === targetShiftId);

        const relevantTrouble = isTargetActive
            ? troubleList
            : troubleList.filter(t => t.shiftId === targetShiftId);

        const shiftLogs = isTargetActive
            ? allLogs
            : allLogs.filter(l => l.shiftId === targetShiftId);

        // 1. Monitoring 4H Breakdown
        let monFilledSlots = 0;
        let monCompletedCount = 0;
        let monOnProgressCount = 0;
        let monWaitingSlotCount = 0;
        let monKendalaCount = 0;

        const currentSlotKey = this.determineActiveSlot ? this.determineActiveSlot(new Date()) : '08:00';

        relevantMon.forEach(m => {
            let hasArrivalSlot = false;
            if (m.slots && typeof m.slots === 'object') {
                Object.values(m.slots).forEach(slot => {
                    if (slot && (slot.lokasi || slot.statusUpdate === 'SUDAH UPDATE' || slot.checkinTime || slot.jamUpdateAktual)) {
                        monFilledSlots++;
                        const lokUpper = String(slot.lokasi || '').toUpperCase().trim();
                        const ketUpper = String(slot.keterangan || '').toUpperCase();
                        if (!lokUpper.startsWith('OUT') && (lokUpper === 'IN' || lokUpper.startsWith('IN ') || lokUpper.includes('SAMPAI') || ketUpper.includes('SAMPAI') || slot.jenisUpdate === 'Sampai')) {
                            hasArrivalSlot = true;
                        }
                    }
                });
            }
            const cleanArr = (m.jamSampaiAktual && !/^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(String(m.jamSampaiAktual).trim())) ? String(m.jamSampaiAktual).trim() : '';
            const stUpper = String(m.statusPerjalanan || m.status || '').toUpperCase();
            if (stUpper === 'KENDALA' || stUpper === 'TROUBLE') {
                monKendalaCount++;
            } else if (stUpper === 'COMPLETED' || stUpper === 'SUDAH SELESAI' || stUpper === 'IN' || hasArrivalSlot || cleanArr) {
                monCompletedCount++;
            } else {
                monOnProgressCount++;
                const curSlotObj = m.slots && m.slots[currentSlotKey];
                if (!curSlotObj || !curSlotObj.lokasi) {
                    monWaitingSlotCount++;
                }
            }
        });

        const totalMon = Math.max(monFilledSlots, relevantMon.length);

        // 2. SLA Vendor Breakdown (Unified Formula with SLA Vendor & Dashboard)
        let slaOnTimeCount = 0;
        let slaLateCount = 0;
        let slaRunningCount = 0;

        relevantSla.forEach(s => {
            const st = String(s.statusSla || s.statusSLA || s.status || '').toUpperCase().trim();
            const targetH = this.resolveEffectiveTargetSLAHours ? this.resolveEffectiveTargetSLAHours(s) : (parseFloat(s.targetSLAHours || s.targetSLAOutboundHours) || 16);
            let cleanArr = (s.jamSampaiAktual && !/^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(String(s.jamSampaiAktual).trim()))
                ? String(s.jamSampaiAktual).trim()
                : '';
            if (cleanArr && this.normalizeArrivalAgainstDeparture) {
                cleanArr = this.normalizeArrivalAgainstDeparture(s.jamBerangkat, cleanArr, targetH, s.slots || null);
            }

            if (st === 'KENDALA') {
                slaLateCount++;
            } else if (cleanArr && s.jamBerangkat && window.SLACountdownEngine) {
                const state = window.SLACountdownEngine.calculateSLAState(s.jamBerangkat, targetH, cleanArr);
                if (state && state.isOverdue) slaLateCount++;
                else slaOnTimeCount++;
            } else if ((s.lateMinutes !== undefined && Number(s.lateMinutes) > 0) || st.includes('LATE') || st.includes('TERLAMBAT')) {
                slaLateCount++;
            } else if (cleanArr || st === 'ON TIME' || st === 'COMPLETED' || st === 'SUDAH SELESAI') {
                slaOnTimeCount++;
            } else if (s.jamBerangkat && window.SLACountdownEngine) {
                const state = window.SLACountdownEngine.calculateSLAState(s.jamBerangkat, targetH, '');
                if (state && state.isOverdue) slaLateCount++;
                else slaRunningCount++;
            } else {
                slaRunningCount++;
            }
        });

        const totalSla = relevantSla.length + relevantSlaRet.length;

        // 3. Trouble & Laka Breakdown
        let troubleOpenCount = 0;
        let troubleResolvedCount = 0;
        relevantTrouble.forEach(t => {
            const st = String(t.status || '').toUpperCase();
            if (st === 'SUDAH SELESAI' || st === 'SELESAI' || st === 'CLOSED') {
                troubleResolvedCount++;
            } else {
                troubleOpenCount++;
            }
        });
        const totalTrouble = relevantTrouble.length;

        // 4. Total Unique Trips across Monitoring & SLA
        const uniqueTripSet = new Set();
        relevantMon.forEach(m => { if (m.kodeTugas || m.id) uniqueTripSet.add(m.kodeTugas || m.id); });
        relevantSla.forEach(s => { if (s.kodeTugas || s.id) uniqueTripSet.add(s.kodeTugas || s.id); });
        const totalTrips = uniqueTripSet.size;

        // 5. Total Operational Transactions
        const totalTransactions = totalMon + totalSla + totalTrouble;

        // 6. Operator Attribution
        let op1Actions = 0;
        let op2Actions = 0;
        shiftLogs.forEach(l => {
            const opName = (l.operator || '').toLowerCase();
            if (op1Nama && opName.includes(op1Nama)) op1Actions++;
            else if (op2Nama && opName.includes(op2Nama)) op2Actions++;
        });

        if (op1Actions === 0 && op2Actions === 0) {
            op1Actions = totalMon + totalTrouble;
            op2Actions = totalSla;
        } else if (op2Actions === 0 && totalSla > 0) {
            op2Actions = totalSla;
        }

        return {
            shiftId: targetShiftId,
            totalTrips: totalTrips,
            totalTransactions: totalTransactions,
            monTotalTrips: relevantMon.length,
            monCheckins: totalMon,
            monFilledSlots: monFilledSlots,
            monCompleted: monCompletedCount,
            monOnProgress: monOnProgressCount,
            monWaitingSlot: monWaitingSlotCount,
            monKendala: monKendalaCount,
            slaUpdates: totalSla,
            slaOutboundCount: relevantSla.length,
            slaReturnCount: relevantSlaRet.length,
            slaOnTime: slaOnTimeCount,
            slaLate: slaLateCount,
            slaRunning: slaRunningCount,
            incidents: totalTrouble,
            incidentsOpen: troubleOpenCount,
            incidentsResolved: troubleResolvedCount,
            op1Actions: op1Actions,
            op2Actions: op2Actions,
            shiftLogs: shiftLogs
        };
    },

    subscribeAuditLogs(callback) {
        const emit = (serverLogs = null) => {
            const local = this.getLocalStore('audit_logs') || [];
            const map = new Map();
            local.forEach(i => { if (i.id) map.set(i.id, i); });
            if (Array.isArray(serverLogs)) {
                serverLogs.forEach(i => { if (i.id) map.set(i.id, { ...(map.get(i.id) || {}), ...i }); });
            }
            const rawList = Array.from(map.values());
            rawList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || (b.waktu || '').localeCompare(a.waktu || ''));
            const final100 = rawList.slice(0, 100);
            this.saveLocalStore('audit_logs', final100);
            const fullSynthesized = this.getSynthesizedAuditLogs().slice(0, 150);
            callback(fullSynthesized);
        };

        // 1. Tampilkan data lokal segera (0ms latency)
        emit();

        // 2. Ambil log terbaru dari endpoint cPanel (log_audit.php)
        const fetchServerLogs = async () => {
            try {
                const headers = {};
                if (window.auth && window.auth.currentUser && !window.auth.currentUser.isAnonymous) {
                    const tok = await window.auth.currentUser.getIdToken();
                    if (tok) headers['Authorization'] = `Bearer ${tok}`;
                }
                const res = await fetch('log_audit.php?limit=100', { headers });
                const data = await res.json();
                if (data && data.success && Array.isArray(data.logs)) {
                    emit(data.logs);
                }
            } catch (err) {
                console.debug('[AUDIT] log_audit.php notice:', err.message);
            }
        };

        fetchServerLogs();

        // 3. Listener update event lokal (untuk semua perubahan koleksi)
        const onDataUpdated = () => {
            emit();
        };
        window.addEventListener('jnt_data_updated', onDataUpdated);

        // 4. Polling ringan setiap 30 detik
        const intervalId = setInterval(fetchServerLogs, 30000);

        return () => {
            window.removeEventListener('jnt_data_updated', onDataUpdated);
            clearInterval(intervalId);
        };
    },

    async logAuditEvent(auditObj) {
        const nowMs = Date.now();
        const entry = {
            id: `AUDIT-${nowMs}-${Math.floor(Math.random() * 1000)}`,
            createdAt: auditObj.createdAt || nowMs,
            waktu: auditObj.waktu || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: auditObj.operator || "System",
            shiftId: auditObj.shiftId || this.getActiveShiftId(),
            modul: auditObj.modul || "General",
            kodeTugas: auditObj.kodeTugas || "-",
            aktivitas: auditObj.aktivitas || ""
        };

        // 1. Simpan ke Local Storage (untuk respons instan UI dan mode offline)
        try {
            const localList = this.getLocalStore('audit_logs') || [];
            localList.unshift(entry);
            if (localList.length > 200) localList.length = 200;
            this.saveLocalStore('audit_logs', localList);
            window.dispatchEvent(new CustomEvent('jnt_data_updated', { detail: { colName: 'audit_logs', docId: entry.id, data: entry } }));
        } catch (e) {
            console.warn('[AUDIT] LOCAL STORAGE WARNING:', e.message);
        }

        // 2. Simpan ke cPanel Hosting (log_audit.php) — Menghemat kuota Firestore Write
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (window.auth && window.auth.currentUser && !window.auth.currentUser.isAnonymous) {
                try {
                    const tok = await window.auth.currentUser.getIdToken();
                    if (tok) headers['Authorization'] = `Bearer ${tok}`;
                } catch (_) { }
            }
            fetch('log_audit.php', {
                method: 'POST',
                headers,
                body: JSON.stringify(entry)
            }).catch(err => {
                console.debug('[AUDIT] cPanel write notice:', err.message);
            });
        } catch (err) {
            console.debug('[AUDIT] Fetch dispatch notice:', err.message);
        }

        return entry;
    },

    // ----------------------------------------------------
    // 8. USERS CRUD & FIREBASE AUTHENTICATION IDENTITY ENGINE
    // ----------------------------------------------------
    subscribeUsers(callback) {
        const DUMMY_USERNAMES = new Set(['rina', 'rinamarlina', 'dedi', 'dedisetiawan', 'budi', 'budisantoso', 'hamdan', 'rizky', 'devoleper']);
        const DUMMY_FULLNAMES = new Set(['rina marlina', 'dedi setiawan', 'budi santoso', 'hamdan hamdani', 'rizky ramadhan', 'developer admin']);

        return this.createSub('users', (rawList) => {
            const byUname = new Map();
            (rawList || []).forEach(u => {
                if (!u) return;
                const uname = String(u.username || u.id || '').toLowerCase().trim();
                const fname = String(u.fullname || '').toLowerCase().trim();
                if (!uname) return;
                if (DUMMY_USERNAMES.has(uname) || DUMMY_FULLNAMES.has(fname)) return;
                // Skip pure UID duplicate docs that have no username field if we already have the username doc
                const key = String(u.username || '').toLowerCase().trim() || uname;
                const prev = byUname.get(key) || {};
                byUname.set(key, {
                    ...prev,
                    ...u,
                    username: key,
                    uid: u.uid || prev.uid || (u.id !== key ? u.id : prev.id) || key,
                    role: this.normalizeRole(u.role || prev.role)
                });
            });

            // Pastikan user yang sedang login saat ini selalu terdaftar & sinkron di daftar pengguna
            const activeLogin = (sessionStorage.getItem('jnt_username_login') || '').toLowerCase().trim();
            const activeFullname = (sessionStorage.getItem('jnt_active_username') || '').trim();
            if (activeLogin && !DUMMY_USERNAMES.has(activeLogin) && !byUname.has(activeLogin)) {
                byUname.set(activeLogin, {
                    id: activeLogin,
                    uid: sessionStorage.getItem('jnt_user_uid') || activeLogin,
                    username: activeLogin,
                    fullname: activeFullname || activeLogin,
                    email: sessionStorage.getItem('jnt_user_email') || `${activeLogin}@jtexpress.co.id`,
                    phone: sessionStorage.getItem('jnt_user_phone') || '-',
                    role: this.normalizeRole(sessionStorage.getItem('jnt_user_role') || 'ADMIN'),
                    tlc: sessionStorage.getItem('jnt_user_tlc') || 'Head Office Jakarta',
                    status: 'Aktif'
                });
            }

            const deduped = Array.from(byUname.values());
            this.saveLocalStore('users', deduped);
            callback(deduped);
        });
    },

    normalizeRole(roleStr) {
        if (!roleStr) return 'STAFF_VEHICLE_DISPATCH';
        const r = String(roleStr).toUpperCase().trim().replace(/[\s\-]+/g, '_');
        if (r === 'DEVELOPER' || r === 'DEV' || r.includes('DEVELOPER')) return 'DEVELOPER';
        if (r === 'OWNER' || r.includes('OWNER')) return 'OWNER';
        if (r === 'ADMIN' || r === 'ADMINISTRATOR') return 'ADMIN';
        if (r === 'ASISTEN_MANAGER' || r === 'ASSISTANT_MANAGER' || r === 'ASMEN' || r.includes('ASISTEN')) return 'ASISTEN_MANAGER';
        if (r === 'MANAGER' || r.includes('MANAGER')) return 'MANAGER';
        if (r === 'SUPERVISOR' || r === 'SPV' || r.includes('SUPERVISOR') || r.includes('SPV')) return 'SUPERVISOR';
        if (r === 'FINANCE' || r.includes('FINANCE') || r.includes('KEUANGAN')) return 'FINANCE';
        if (r === 'VENDOR' || r.includes('VENDOR') || r.includes('3PL')) return 'VENDOR';
        if (r === 'STAFF_VEHICLE_DISPATCH' || r.includes('DISPATCH') || r.includes('STAFF') || r.includes('OPERATOR') || r.includes('MONITORING') || r.includes('SLA')) {
            return 'STAFF_VEHICLE_DISPATCH';
        }
        return 'STAFF_VEHICLE_DISPATCH';
    },

    formatRoleLabel(roleStr) {
        const norm = this.normalizeRole(roleStr);
        const labels = {
            'DEVELOPER': 'Developer',
            'OWNER': 'Owner',
            'ADMIN': 'Admin',
            'MANAGER': 'Manager',
            'ASISTEN_MANAGER': 'Asisten Manager',
            'SUPERVISOR': 'Supervisor (SPV)',
            'FINANCE': 'Finance',
            'VENDOR': 'Vendor',
            'STAFF_VEHICLE_DISPATCH': 'Staff Vehicle Dispatch'
        };
        return labels[norm] || 'Staff Vehicle Dispatch';
    },

    async resolveEmailFromIdentifier(identifier) {
        if (!identifier) return '';
        const idTrim = String(identifier).trim();
        if (idTrim.includes('@')) return idTrim.toLowerCase();

        const uname = idTrim.toLowerCase();

        // ── 1. Cek cache localStorage (disimpan saat buat akun) ──
        try {
            const emailCache = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
            if (emailCache[uname]) return emailCache[uname].toLowerCase();
        } catch (_) { }

        // ── 2. Cek localStorage users ──
        const localUsers = this.getLocalStore('users') || [];
        const found = localUsers.find(u => (u.username || '').toLowerCase() === uname || (u.email || '').toLowerCase().startsWith(uname + '@'));
        if (found && (found.email || found.emailPerusahaan)) {
            return (found.email || found.emailPerusahaan).toLowerCase();
        }

        // ── 3. Cek minimal lookup doc (/user_lookup/{username}) lalu fallback users jika sudah login ──
        if (window.db) {
            try {
                const lookupSnap = await window.db.collection('user_lookup').doc(uname).get();
                if (lookupSnap.exists) {
                    const lEmail = String((lookupSnap.data() || {}).email || '').toLowerCase().trim();
                    if (lEmail && lEmail.includes('@')) {
                        try {
                            const cache = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
                            cache[uname] = lEmail;
                            localStorage.setItem('jnt_email_map', JSON.stringify(cache));
                        } catch (_) { }
                        return lEmail;
                    }
                }
            } catch (_) { }

            if (window.auth && window.auth.currentUser && !window.auth.currentUser.isAnonymous) {
                try {
                    const snapshot = await window.db.collection('users').get();
                    if (!snapshot.empty) {
                        for (const doc of snapshot.docs) {
                            const data = doc.data();
                            const docUsername = (data.username || '').toLowerCase();
                            const docId = (doc.id || '').toLowerCase();
                            const docEmail = (data.email || data.emailPerusahaan || '').toLowerCase();
                            if (docUsername === uname || docId === uname || docEmail.startsWith(uname + '@')) {
                                if (docEmail) {
                                    try {
                                        const cache = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
                                        cache[uname] = docEmail;
                                        localStorage.setItem('jnt_email_map', JSON.stringify(cache));
                                    } catch (_) { }
                                    return docEmail;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('resolveEmailFromIdentifier firestore scan failed:', e);
                }
            }
        }

        // ── 4. Fallback terakhir: pakai domain @jtexpress.co.id ──
        // (Ini hanya akan benar jika email memang pakai domain perusahaan)
        return `${uname}@jtexpress.co.id`;
    },

    async getUserProfileByUid(uid) {
        if (!uid) return null;
        let profile = null;
        if (window.db) {
            try {
                const snap = await window.db.collection('users').doc(uid).get();
                if (snap.exists) {
                    profile = snap.data();
                } else {
                    const snapshot = await window.db.collection('users').get();
                    if (!snapshot.empty) {
                        for (const doc of snapshot.docs) {
                            const data = doc.data();
                            if (data.uid === uid || data.id === uid || doc.id === uid) {
                                profile = data;
                                break;
                            }
                        }
                    }
                }
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
                const snapshot = await window.db.collection('users').get();
                if (!snapshot.empty) {
                    for (const doc of snapshot.docs) {
                        const data = doc.data();
                        const docUsername = (data.username || '').toLowerCase();
                        const docId = (doc.id || '').toLowerCase();
                        const docUid = (data.uid || '').toLowerCase();
                        if (docUsername === uname || docId === uname || docUid === uname) {
                            profile = data;
                            break;
                        }
                    }
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
                    await window.auth.signOut();
                    throw new Error("Akun belum terdaftar resmi di database sistem. Hubungi Administrator.");
                }
            }

            if ((profile.status || 'Aktif').toLowerCase() === 'nonaktif' || (profile.status || '').toLowerCase() === 'inactive') {
                await window.auth.signOut();
                throw new Error("Akun Anda berstatus Nonaktif. Silakan hubungi Administrator.");
            }

            profile.role = this.normalizeRole(profile.role);

            // Pastikan profil selalu tersinkron ke /users/{user.uid} agar Firestore Security Rules dapat membaca /users/$(request.auth.uid)
            if (window.db && user && user.uid) {
                const uidProfile = {
                    ...profile,
                    uid: user.uid,
                    id: user.uid
                };
                try {
                    await window.db.collection('users').doc(user.uid).set(uidProfile, { merge: true });
                } catch (_) { }
            }

            this.setVerifiedAuthProfile({ ...profile, uid: user.uid });

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
            console.warn('[AUTH LOGIN] Error:', err.code, '| email yang dicoba:', email, '| identifier:', identifier);
            // auth/wrong-password = email benar tapi password salah → langsung throw, bukan cek legacy
            if (err.code === 'auth/wrong-password' || err.code === 'auth/too-many-requests') {
                throw err;
            }
            // auth/user-not-found atau auth/invalid-credential = email tidak ditemukan di Auth
            // kemungkinan username → email resolve salah, ATAU akun legacy belum di-Auth
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                // Coba lagi: cari email dari Firestore langsung berdasarkan username
                const uname = identifier.includes('@') ? identifier.split('@')[0].toLowerCase() : identifier.toLowerCase();
                let retryEmail = null;
                if (window.db) {
                    try {
                        const snap = await window.db.collection('users').where('username', '==', uname).limit(1).get();
                        if (!snap.empty) {
                            const d = snap.docs[0].data();
                            retryEmail = d.email || d.emailPerusahaan;
                        }
                    } catch (_) { }
                }
                // Jika email ditemukan & berbeda dari yang sudah dicoba, retry login
                if (retryEmail && retryEmail.toLowerCase() !== email.toLowerCase()) {
                    console.log('[AUTH LOGIN] Retry dengan email dari Firestore:', retryEmail);
                    // Simpan ke cache agar lookup berikutnya langsung benar
                    try {
                        const cache = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
                        cache[uname] = retryEmail.toLowerCase();
                        localStorage.setItem('jnt_email_map', JSON.stringify(cache));
                    } catch (_) { }
                    const retryCred = await window.auth.signInWithEmailAndPassword(retryEmail.toLowerCase(), password);
                    const retryProfile = await this.getUserProfileByUid(retryCred.user.uid);
                    if (retryProfile) {
                        retryProfile.role = this.normalizeRole(retryProfile.role);
                        return { user: retryCred.user, profile: retryProfile };
                    }
                }
                // Cek apakah ini akun legacy (ada di Firestore tapi belum di Firebase Auth)
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

        let cred;
        let secondaryApp = null;
        try {
            if (typeof firebase !== 'undefined' && typeof firebase.initializeApp === 'function' && typeof firebaseConfig !== 'undefined') {
                const secondaryName = 'SecondaryCreateUserApp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                secondaryApp = firebase.initializeApp(firebaseConfig, secondaryName);
                const secondaryAuth = secondaryApp.auth();
                if (typeof useEmulator !== 'undefined' && useEmulator) {
                    try { secondaryAuth.useEmulator('http://127.0.0.1:9099'); } catch (_) { }
                }
                cred = await secondaryAuth.createUserWithEmailAndPassword(profileData.email, password);
                await secondaryAuth.signOut();
            } else {
                cred = await window.auth.createUserWithEmailAndPassword(profileData.email, password);
            }
        } catch (err) {
            console.warn("Secondary app auth creation failed, fallback to primary auth:", err);
            cred = await window.auth.createUserWithEmailAndPassword(profileData.email, password);
        } finally {
            if (secondaryApp) {
                try {
                    await secondaryApp.delete();
                } catch (_) { }
            }
        }

        const uid = cred.user.uid;
        const cleanUname = profileData.username.toLowerCase().trim();

        const normNewRole = this.normalizeRole(profileData.role);
        const resolvedVendorName = normNewRole === 'VENDOR'
            ? this.normalizeVendorName(profileData.vendorName || profileData.vendor || '')
            : '';
        const resolvedVendorShort = resolvedVendorName ? this.formatVendorShort(resolvedVendorName) : '';

        const newProfile = {
            uid: uid,
            id: uid,
            username: cleanUname,
            fullname: profileData.fullname || profileData.username,
            email: profileData.email.toLowerCase().trim(),
            emailPerusahaan: profileData.email.toLowerCase().trim(),
            phone: profileData.phone || '',
            role: normNewRole,
            tlc: profileData.tlc || 'Head Office',
            ...(resolvedVendorName ? { vendorName: resolvedVendorName, vendorShort: resolvedVendorShort } : {}),
            status: profileData.status || 'Aktif',
            createdAt: new Date().toISOString()
        };

        // Simpan dengan docId = username DAN docId = uid, serta lookup minimal email
        await this.saveDoc('users', cleanUname, newProfile, true);
        await this.saveDoc('users', uid, newProfile, true);
        if (window.db) {
            try {
                await window.db.collection('user_lookup').doc(cleanUname).set({ email: newProfile.email }, { merge: true });
            } catch (_) { }
        }

        // ── Simpan mapping username → email ke localStorage sebagai backup ──
        // Ini memastikan login dengan username tetap bisa resolve email yang benar
        // bahkan jika Firestore rules belum di-deploy atau koneksi lambat.
        try {
            const emailCache = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
            emailCache[cleanUname] = newProfile.email;
            localStorage.setItem('jnt_email_map', JSON.stringify(emailCache));
        } catch (_) { }

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
        // SECURITY: Nonaktifkan aktivasi mandiri tanpa verifikasi kredensial lama agar akun tidak bisa diambil alih pihak luar.
        throw new Error("Aktivasi akun mandiri dinonaktifkan demi keamanan. Hubungi Administrator untuk pembuatan atau reset akun resmi.");
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
        // Hapus kunci sesi aktif dari Firestore sebelum sign out
        if (typeof window.jntReleaseSessionLock === 'function') {
            try { await window.jntReleaseSessionLock(); } catch (_) { }
        }
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
        const cleanUname = String(profileData.username || username).toLowerCase().trim();
        const docId = profileData.uid || cleanUname;
        const existing = await this.getDoc('users', docId) || await this.getUserProfileByUsername(cleanUname) || {};
        const mergedProfile = {
            ...existing,
            ...profileData,
            id: docId,
            uid: profileData.uid || existing.uid || docId,
            username: cleanUname,
            role: this.normalizeRole(profileData.role || existing.role),
            updatedAt: new Date().toISOString()
        };
        const updated = await this.saveDoc('users', docId, mergedProfile, true);
        // Sinkronkan juga antara docId = username dan docId = uid agar Firestore Rules (/users/$(request.auth.uid)) selalu konsisten
        if (mergedProfile.uid && mergedProfile.uid !== cleanUname) {
            try { await this.saveDoc('users', cleanUname, { ...mergedProfile, id: cleanUname }, true); } catch (_) { }
            if (docId !== mergedProfile.uid) {
                try { await this.saveDoc('users', mergedProfile.uid, { ...mergedProfile, id: mergedProfile.uid }, true); } catch (_) { }
            }
        }

        const emailVal = String(updated.email || updated.emailPerusahaan || '').toLowerCase().trim();
        if (window.db && cleanUname && emailVal && emailVal.includes('@')) {
            try {
                await window.db.collection('user_lookup').doc(cleanUname).set({ email: emailVal }, { merge: true });
            } catch (_) { }
        }

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

    async deleteUser(username, uid = '') {
        if (!username) return false;
        const shiftId = this.getActiveShiftId();
        const cleanUname = String(username).toLowerCase().trim();

        // Cari semua dokumen terkait user ini di localStore & Firestore (baik docId = username maupun docId = uid)
        const localUsers = this.getLocalStore('users') || [];
        const idsToDelete = new Set([cleanUname]);
        let deletedFullname = cleanUname;
        if (uid) idsToDelete.add(String(uid).trim());

        localUsers.forEach(u => {
            if (!u) return;
            const uName = String(u.username || '').toLowerCase().trim();
            const uId = String(u.id || '').trim();
            const uUid = String(u.uid || '').trim();
            if (uName === cleanUname || uId.toLowerCase() === cleanUname || (uid && (uId === uid || uUid === uid))) {
                if (u.fullname) deletedFullname = u.fullname;
                if (uId) idsToDelete.add(uId);
                if (uUid) idsToDelete.add(uUid);
            }
        });

        // 1. Bersihkan dari Local Store & Cached Subscription Data
        const remainingUsers = localUsers.filter(u => {
            if (!u) return false;
            const uName = String(u.username || '').toLowerCase().trim();
            const uId = String(u.id || '').trim();
            const uUid = String(u.uid || '').trim();
            return uName !== cleanUname && !idsToDelete.has(uId) && !idsToDelete.has(uUid);
        });
        this.saveLocalStore('users', remainingUsers);
        if (this._cachedSubData && Array.isArray(this._cachedSubData['users'])) {
            this._cachedSubData['users'] = this._cachedSubData['users'].filter(u => {
                if (!u) return false;
                const uName = String(u.username || '').toLowerCase().trim();
                const uId = String(u.id || '').trim();
                const uUid = String(u.uid || '').trim();
                return uName !== cleanUname && !idsToDelete.has(uId) && !idsToDelete.has(uUid);
            });
        }

        // 2. Hapus dari Cloud Firestore (/users, /user_lookup, /active_sessions)
        if (window.db) {
            for (const docId of idsToDelete) {
                if (!docId) continue;
                try {
                    await window.db.collection('users').doc(docId).delete();
                } catch (e) {
                    console.warn('[DELETE USER] Firestore delete doc notice:', docId, e.message);
                }
            }
            try {
                const qSnap = await window.db.collection('users').where('username', '==', cleanUname).get();
                for (const d of qSnap.docs) {
                    await d.ref.delete().catch(() => { });
                }
            } catch (_) { }
            try {
                await window.db.collection('user_lookup').doc(cleanUname).delete();
            } catch (_) { }
            try {
                const sessionKey = cleanUname.replace(/[\/.#$\[\]]/g, '_');
                await window.db.collection('active_sessions').doc(sessionKey).delete();
            } catch (_) { }
        }

        // 3. Bersihkan cache email_map & local_accounts di localStorage
        try {
            const emailCache = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
            if (emailCache[cleanUname]) {
                delete emailCache[cleanUname];
                localStorage.setItem('jnt_email_map', JSON.stringify(emailCache));
            }
        } catch (_) { }
        try {
            const localAcc = JSON.parse(localStorage.getItem('jnt_local_accounts') || '[]');
            if (Array.isArray(localAcc)) {
                const filteredAcc = localAcc.filter(a => a && String(a.username || '').toLowerCase().trim() !== cleanUname);
                localStorage.setItem('jnt_local_accounts', JSON.stringify(filteredAcc));
            }
        } catch (_) { }

        // 4. Sinkronkan Shift Aktif jika operator yang dihapus sedang tercatat di Shift Aktif
        try {
            const activeShift = this.getActiveShift();
            if (activeShift) {
                const realOps = this.getRealOperatorNames();
                const activeUser = sessionStorage.getItem('jnt_active_username') || realOps[0] || 'Farizs Hakim';
                const fallbackOp2 = realOps.find(n => n.toLowerCase() !== activeUser.toLowerCase()) || realOps[0] || activeUser;
                let shiftChanged = false;
                if (activeShift.operator1 && [cleanUname, deletedFullname.toLowerCase()].includes((activeShift.operator1.nama || '').toLowerCase().trim())) {
                    activeShift.operator1.nama = activeUser;
                    shiftChanged = true;
                }
                if (activeShift.operator2 && [cleanUname, deletedFullname.toLowerCase()].includes((activeShift.operator2.nama || '').toLowerCase().trim())) {
                    activeShift.operator2.nama = fallbackOp2;
                    shiftChanged = true;
                }
                if (shiftChanged) {
                    await this.saveActiveShift(activeShift);
                }
            }
        } catch (_) { }

        await this.logAuditEvent({
            waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: sessionStorage.getItem('jnt_active_username') || "Admin",
            shiftId: shiftId,
            modul: "User Management",
            kodeTugas: "-",
            aktivitas: `Hapus Akun Pengguna Permanen: ${deletedFullname} (${cleanUname})`
        });

        this.forceRefreshSub('users');
        window.dispatchEvent(new CustomEvent('jnt_data_updated', { detail: { collection: 'users', action: 'delete', id: cleanUname } }));
        return true;
    },

    // ----------------------------------------------------
    // 9. DATABASE BACKUP & ADMIN RESTORE ENGINE
    // ----------------------------------------------------
    async exportDatabaseSnapshot() {
        await this.loadHostingArchiveData().catch(() => { });
        const collections = ['incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h', 'troubles', 'shifts', 'master_trips', 'master_fleets', 'master_vendors', 'master_drivers', 'master_reasons', 'users', 'audit_logs'];
        const backupData = {
            exportDate: new Date().toISOString(),
            version: "5.0.0",
            schemaVersion: "5.0.0",
            system: "J&T Express Transportation Monitoring System v5 (Hybrid Hosting + Firebase)",
            collections: {}
        };

        for (const colName of collections) {
            // Prioritaskan data gabungan Memory + Hosting Archive (0 extra Firestore Read!)
            let list = (this.getLocalStore(colName) || []).map(item => ({
                _docId: item.id || item.kodeTugas || item.shiftId || item.incidentId || item.code,
                ...item
            }));
            if (list.length === 0 && window.db && colName !== 'audit_logs') {
                try {
                    const snap = await window.db.collection(colName).get();
                    snap.forEach(doc => list.push({ _docId: doc.id, ...doc.data() }));
                } catch (e) {
                    console.warn(`Export Firestore warning for ${colName}:`, e.message);
                }
            }
            backupData.collections[colName] = list;
        }

        return backupData;
    },

    async restoreDatabaseFromJSON(jsonObj) {
        const normRole = this.getVerifiedRole();
        if (!['DEVELOPER', 'OWNER', 'ADMIN'].includes(normRole)) {
            throw new Error("Akses Ditolak: Hanya Developer, Owner, atau Administrator resmi yang dapat melakukan restore database!");
        }
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
        const tripCols = new Set(['incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h']);
        const sanitizePlainObj = (obj) => {
            const out = {};
            for (const k of Object.keys(obj || {})) {
                if (k === '__proto__' || k === 'constructor' || k === 'prototype' || k === '_docId') continue;
                out[k] = obj[k];
            }
            return out;
        };

        let restoredCount = 0;
        const batchOps = [];
        for (const colName of Object.keys(jsonObj.collections)) {
            if (!validCollections.includes(colName)) continue;
            const docsList = jsonObj.collections[colName];
            if (!Array.isArray(docsList)) continue;

            for (const item of docsList) {
                if (!item || typeof item !== 'object') continue;
                const rawId = item._docId || item.id || item.kodeTugas || item.shiftId || item.incidentId;
                const docId = rawId ? String(rawId).replace(/[\\/\.]{2,}|[\\/]/g, '_').trim() : '';
                const cleanItem = sanitizePlainObj(item);
                if (docId) {
                    cleanItem.id = docId;
                    if (tripCols.has(colName)) {
                        this._unmarkTripAsDeleted(docId);
                    }
                    batchOps.push({
                        type: 'set',
                        colName,
                        docId,
                        data: cleanItem,
                        merge: true
                    });
                    restoredCount++;
                }
            }
        }

        if (batchOps.length > 0) {
            await this.commitAtomicBatch(batchOps, 30000);
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
    // 10. REAL-TIME NOTIFICATION CENTER ENGINE (Trouble, Check-in Slot 4 Jam & Overdue SLA)
    // ----------------------------------------------------
    subscribeNotifications(callback) {
        const DEMO_TRIP_IDS = new Set([
            'DBGX2610020001', 'DBGX2610020002', 'DBGX2610020003',
            'DBGX2610020004', 'DBGX2610020005', 'DBGX2610020006',
            '4234234', 'DBDBDBDB'
        ]);

        const buildAlerts = () => {
            const alerts = [];
            const now = new Date();
            const currentClockSlot = this.getSlotForTime
                ? this.getSlotForTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
                : '08:00';
            const allSlotKeys = this.getMonitoringSlotKeys ? this.getMonitoringSlotKeys() : ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];

            // 1. 🚨 INCIDENT TROUBLE & LAKA AKTIF (BELUM SELESAI)
            const troubleList = this.getLocalStore('troubles') || [];
            troubleList.forEach(item => {
                if (!item || DEMO_TRIP_IDS.has(item.kodeTugas)) return;
                const st = String(item.status || '').toUpperCase();
                if (st !== 'SUDAH SELESAI' && st !== 'SELESAI' && st !== 'RESOLVED' && st !== 'CLOSED') {
                    const isCritical = item.severity === 'CRITICAL' || item.severity === 'HIGH' || String(item.jenis || '').toLowerCase().includes('laka');
                    alerts.push({
                        id: item.incidentId || item.id || `TRB-${item.kodeTugas}`,
                        category: 'TROUBLE',
                        level: isCritical ? 'critical' : 'warning',
                        type: 'CRITICAL_INCIDENT',
                        title: `🚨 ${(item.jenis || 'Trouble').toUpperCase()} AKTIF (${item.severity || 'MEDIUM'})`,
                        message: `${item.platNomor || '-'} (${item.kodeTugas || '-'}) • ${item.kategoriTrouble || item.deskripsi || '-'} di ${item.lokasiKejadian || '-'}`,
                        timestamp: item.createdAt || now.toISOString(),
                        link: `trouble.html?kodeTugas=${encodeURIComponent(item.kodeTugas || '')}`
                    });
                }
            });

            // 2. ⏱️ PERINGATAN ARMADA BELUM CHECK-IN SLOT 4 JAM SAAT INI
            const monList = this.getLocalStore('monitoring_4h') || [];
            const missingCheckinTrips = [];

            monList.forEach(m => {
                if (!m) return;
                const kode = m.kodeTugas || m.id;
                if (!kode || DEMO_TRIP_IDS.has(kode)) return;

                // Cek apakah trip sudah selesai / sudah tiba (IN)
                const stUpper = String(m.statusPerjalanan || m.status || '').toUpperCase();
                const cleanArr = (m.jamSampaiAktual && !/^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(String(m.jamSampaiAktual).trim()))
                    ? String(m.jamSampaiAktual).trim()
                    : '';
                if (stUpper === 'COMPLETED' || stUpper === 'SUDAH SELESAI' || cleanArr) return;

                let hasArrivalSlot = false;
                if (m.slots && typeof m.slots === 'object') {
                    for (const sVal of Object.values(m.slots)) {
                        if (sVal && sVal.lokasi) {
                            const locUp = String(sVal.lokasi).toUpperCase().trim();
                            if (!locUp.startsWith('OUT') && (locUp === 'IN' || locUp.startsWith('IN ') || locUp.includes('SAMPAI') || sVal.jenisUpdate === 'Sampai')) {
                                hasArrivalSlot = true;
                                break;
                            }
                        }
                    }
                }
                if (hasArrivalSlot) return;

                // Tentukan slot 4 jam yang seharusnya di-check-in saat ini
                const minSlotIdx = this.getMinCheckinSlotIndex ? this.getMinCheckinSlotIndex(m) : 1;
                let targetSlotIdx = this.getCheckinSlotIndexByTime ? this.getCheckinSlotIndexByTime(m.jamBerangkat, now) : null;
                if (targetSlotIdx === null || targetSlotIdx < 0) {
                    targetSlotIdx = allSlotKeys.indexOf(currentClockSlot);
                }
                if (targetSlotIdx >= allSlotKeys.length) {
                    targetSlotIdx = allSlotKeys.length - 1;
                }

                // Hanya ingatkan jika waktu saat ini sudah memasuki/melewati slot setelah keberangkatan (OUT JKT999)
                if (targetSlotIdx >= minSlotIdx && targetSlotIdx >= 0) {
                    const targetSlotKey = allSlotKeys[targetSlotIdx] || currentClockSlot;
                    const slotObj = m.slots && m.slots[targetSlotKey];
                    const isSlotFilled = Boolean(slotObj && (slotObj.lokasi || slotObj.statusUpdate === 'SUDAH UPDATE'));
                    if (!isSlotFilled) {
                        missingCheckinTrips.push({
                            kodeTugas: kode,
                            platNomor: m.platNomor || '-',
                            rute: m.trip || m.namaRute || m.tlc || '-',
                            vendor: this.formatVendorShort ? this.formatVendorShort(m.vendor) : (m.vendor || '-'),
                            slotKey: targetSlotKey.replace(/^D\d+_/, ''),
                            rawSlotKey: targetSlotKey
                        });
                    }
                }
            });

            if (missingCheckinTrips.length > 5) {
                alerts.push({
                    id: `MON-4H-SUMMARY-${currentClockSlot}`,
                    category: 'CHECKIN_4H',
                    level: 'warning',
                    type: 'MISSING_CHECKIN_SUMMARY',
                    title: `⏱️ ${missingCheckinTrips.length} ARMADA BELUM CHECK-IN SLOT ${currentClockSlot}`,
                    message: `Terdapat ${missingCheckinTrips.length} armada sedang berjalan yang belum di-update posisinya pada slot ${currentClockSlot} WIB. Klik untuk update di Monitoring 4 Jam.`,
                    timestamp: now.toISOString(),
                    link: 'monitoring.html'
                });
            }

            missingCheckinTrips.slice(0, 6).forEach(item => {
                alerts.push({
                    id: `MON-4H-${item.kodeTugas}-${item.rawSlotKey}`,
                    category: 'CHECKIN_4H',
                    level: 'warning',
                    type: 'MISSING_CHECKIN_4H',
                    title: `⏱️ BELUM CHECK-IN 4 JAM (SLOT ${item.slotKey})`,
                    message: `${item.platNomor} (${item.kodeTugas}) • Rute ${item.rute} [${item.vendor}] belum update posisi slot ${item.slotKey} WIB`,
                    timestamp: now.toISOString(),
                    link: `monitoring.html?kodeTugas=${encodeURIComponent(item.kodeTugas)}`
                });
            });

            // 3. ⏰ PERINGATAN SLA OVERDUE / HAMPIR HABIS PADA ARMADA BERJALAN
            const slaList = this.getLocalStore('sla_outbound') || [];
            slaList.forEach(s => {
                if (!s) return;
                const kode = s.kodeTugas || s.id;
                if (!kode || DEMO_TRIP_IDS.has(kode)) return;
                const cleanArr = (s.jamSampaiAktual && !/^(kosong|belum|nihil|onroad|on\s*road|-|—|null|undefined|n\/a)$/i.test(String(s.jamSampaiAktual).trim()))
                    ? String(s.jamSampaiAktual).trim()
                    : '';
                if (cleanArr || s.statusSla === 'COMPLETED' || s.statusSla === 'ON TIME' || s.statusSla === 'LATE' || s.status === 'SUDAH SELESAI') return;

                const targetH = this.resolveEffectiveTargetSLAHours ? this.resolveEffectiveTargetSLAHours(s) : (parseFloat(s.targetSLAHours) || 16);
                if (s.jamBerangkat && window.SLACountdownEngine) {
                    const state = window.SLACountdownEngine.calculateSLAState(s.jamBerangkat, targetH, '');
                    if (state && state.isOverdue) {
                        alerts.push({
                            id: `SLA-OVERDUE-${kode}`,
                            category: 'SLA',
                            level: 'critical',
                            type: 'SLA_OVERDUE',
                            title: `🚨 SLA MELEWATI TARGET (${targetH} Jam)`,
                            message: `${s.platNomor || '-'} (${kode}) • Rute ${s.trip || s.namaRute || '-'} belum konfirmasi tiba & sudah melewati batas SLA`,
                            timestamp: now.toISOString(),
                            link: `sla-vendor.html?kodeTugas=${encodeURIComponent(kode)}`
                        });
                    } else if (state && typeof state.remainingMs === 'number' && state.remainingMs > 0 && state.remainingMs <= 2 * 3600 * 1000) {
                        const remMin = Math.max(1, Math.round(state.remainingMs / 60000));
                        alerts.push({
                            id: `SLA-WARN-${kode}`,
                            category: 'SLA',
                            level: 'info',
                            type: 'SLA_NEAR_DEADLINE',
                            title: `⏰ SLA SISA ${remMin} MENIT`,
                            message: `${s.platNomor || '-'} (${kode}) • Rute ${s.trip || s.namaRute || '-'} mendekati batas target SLA (${targetH} Jam)`,
                            timestamp: now.toISOString(),
                            link: `sla-vendor.html?kodeTugas=${encodeURIComponent(kode)}`
                        });
                    }
                }
            });

            callback(alerts);
        };

        const unsubTroubles = this.createSub('troubles', () => {
            buildAlerts();
        });

        const onDataUpdated = () => {
            buildAlerts();
        };
        window.addEventListener('jnt_data_updated', onDataUpdated);

        // Evaluasi ulang setiap 60 detik jika pergantian jam memasuki slot 4 jam baru
        const slotTimer = setInterval(buildAlerts, 60000);

        return () => {
            if (typeof unsubTroubles === 'function') unsubTroubles();
            window.removeEventListener('jnt_data_updated', onDataUpdated);
            clearInterval(slotTimer);
        };
    }
};

// Explicit Global Attachment to Window Object
window.JNTFirebaseService = JNTFirebaseService;
window.jntFormatDateTime = (val) => JNTFirebaseService.formatStandardDateTime(val);
window.jntParseDate = (val) => JNTFirebaseService.parseStandardDate(val);

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

// Initialize retry sync when DOM is loaded (Auto-seeding DISABLED to prevent deleted data from reappearing)
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            // Disabled automatic seed on DOM load to respect manual Firebase Console document deletions
            // JNTFirebaseService.seedInitialDataIfEmpty();
            JNTFirebaseService.retrySyncPending();
        }, 500);
    });
}

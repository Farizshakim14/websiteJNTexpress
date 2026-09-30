/**
 * J&T Express - Transportation Monitoring System
 * Firebase Firestore Service Layer (v4 — SSOT, 3-Tier Architecture, 4H Audit Logs, Shift Management & Reporting Engine)
 */

const JNTFirebaseService = {
    
    // Helper to get active Shift ID
    getActiveShiftId() {
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return sessionStorage.getItem('jnt_active_shift_id') || `SHIFT-${todayStr}-01`;
    },

    // ----------------------------------------------------
    // 1. AUTO-SEED INITIAL MASTER DATA & TRANSACTIONS
    // ----------------------------------------------------
    async seedInitialDataIfEmpty() {
        if (!window.db) return;

        try {
            // A. Master Trips & SLA Targets
            const tripsSnap = await window.db.collection('master_trips').get();
            if (tripsSnap.empty) {
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
                for (const t of initialMasterTrips) {
                    await window.db.collection('master_trips').doc(t.code).set(t);
                }
            }

            // B. Master Fleets
            const fleetsSnap = await window.db.collection('master_fleets').get();
            if (fleetsSnap.empty) {
                const initialFleets = [
                    { platNomor: "B 9134 PXX", tipe: "FUSO Box", vendor: "PT. SERIKAT HANTAR EKSPEDISI (SERYU)", status: "Siap Jalan" },
                    { platNomor: "B 9041 SXX", tipe: "CDD Long", vendor: "PT. ASIA PASIFIK LOGISTIK (APL)", status: "Siap Jalan" },
                    { platNomor: "B 9812 BKN", tipe: "CDD Standard", vendor: "PT. JET TRANSPORT SERVICES (JTS)", status: "Siap Jalan" },
                    { platNomor: "B 9356 PKK", tipe: "FUSO Wingbox", vendor: "PT. SOLUSI TRANSPORTASI SEMESTA (SOLUSI)", status: "Siap Jalan" },
                    { platNomor: "B 9201 SKK", tipe: "FUSO Box", vendor: "PT. SOLUSI DUNIA EXPEDISI (SDE)", status: "Siap Jalan" }
                ];
                for (const f of initialFleets) {
                    await window.db.collection('master_fleets').doc(f.platNomor.replace(/\s+/g, '')).set(f);
                }
            }

            // B2. Master Vendors (11 Official Vendors)
            const vendorsSnap = await window.db.collection('master_vendors').get();
            if (vendorsSnap.empty) {
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
                for (const v of initialVendors) {
                    await window.db.collection('master_vendors').doc(v.code).set(v);
                }
            }

            // C. Master Drivers
            const driversSnap = await window.db.collection('master_drivers').get();
            if (driversSnap.empty) {
                const initialDrivers = [
                    { nama: "Nasrul F.", phone: "0812-1111-2222", sim: "B2 Umum", status: "Aktif" },
                    { nama: "Dian OS", phone: "0812-3333-4444", sim: "B2 Umum", status: "Aktif" },
                    { nama: "Yosep P.", phone: "0812-5555-6666", sim: "B1 Umum", status: "Aktif" },
                    { nama: "Ahmad K.", phone: "0812-7777-8888", sim: "B1 Umum", status: "Aktif" },
                    { nama: "Budi S.", phone: "0812-9999-0000", sim: "B2 Umum", status: "Aktif" }
                ];
                for (const d of initialDrivers) {
                    await window.db.collection('master_drivers').doc(d.nama.toLowerCase().replace(/\s+/g, '_')).set(d);
                }
            }

            // D. Master Alasan Keterlambatan
            const reasonsSnap = await window.db.collection('master_reasons').get();
            if (reasonsSnap.empty) {
                const initialReasons = [
                    { id: "R01", alasan: "Ban Pecah / Kerusakan Ban" },
                    { id: "R02", alasan: "Mogok / Mesin Overheat" },
                    { id: "R03", alasan: "Kemacetan Parah Jalur Tol" },
                    { id: "R04", alasan: "Antrean Panjang Pelabuhan / Penyeberangan" },
                    { id: "R05", alasan: "Cuaca Buruk / Hujan Deras & Banjir" },
                    { id: "R06", alasan: "Kendala Administrasi / Dokumen Gateway" }
                ];
                for (const r of initialReasons) {
                    await window.db.collection('master_reasons').doc(r.id).set(r);
                }
            }

            // E. Seed Users Collection
            const usersSnap = await window.db.collection('users').get();
            if (usersSnap.empty) {
                const initialUsers = [
                    { username: "Hamdan", fullname: "Hamdan Hamdani", email: "hamdan@jtexpress.co.id", phone: "0812-3456-7890", role: "Operator SLA", tlc: "Head Office", status: "Aktif" },
                    { username: "Rizky", fullname: "Rizky Ramadhan", email: "rizky@jtexpress.co.id", phone: "0812-9876-1234", role: "Operator Monitoring", tlc: "Head Office", status: "Aktif" },
                    { username: "Rina", fullname: "Rina Marlina", email: "rina@jtexpress.co.id", phone: "0813-9876-5432", role: "Supervisor", tlc: "TLC Serpong", status: "Aktif" },
                    { username: "Dedi", fullname: "Dedi Setiawan", email: "dedi@jtexpress.co.id", phone: "0815-1122-3344", role: "Admin", tlc: "Head Office", status: "Aktif" }
                ];
                for (const u of initialUsers) {
                    await window.db.collection('users').doc(u.username.toLowerCase()).set(u);
                }
            }

            // F. Seed Active Shift Data
            const shiftSnap = await window.db.collection('shifts').get();
            if (shiftSnap.empty) {
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
                await window.db.collection('shifts').doc(activeShiftObj.shiftId).set(activeShiftObj);
            }

            // G. Seed Initial Transactions & Incidents
            const incomingSnap = await window.db.collection('incoming').get();
            if (incomingSnap.empty) {
                const initialIncoming = [
                    {
                        kodeTugas: "DBGX2607220001",
                        trip: "JOG CDD",
                        tlc: "JOG CDD",
                        namaRute: "JAKARTA - YOGYA",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9134 PXX",
                        driver1: "Nasrul F.",
                        driver2: "Budi S.",
                        jamBerangkat: "22/07/2026 08:00",
                        estimasiSampai: "22/07/2026 23:00",
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
                        kodeTugas: "DBGX2607220002",
                        trip: "SRG FUSO",
                        tlc: "SRG FUSO",
                        namaRute: "JAKARTA - SEMARANG",
                        tripType: "ADD",
                        wilayah: "JAWA",
                        platNomor: "B 9041 SXX",
                        driver1: "Dian OS",
                        driver2: "Agus T.",
                        jamBerangkat: "22/07/2026 06:30",
                        estimasiSampai: "22/07/2026 21:30",
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
                        kodeTugas: "DBGX2607220004",
                        trip: "PLM FUSO",
                        tlc: "PLM FUSO",
                        namaRute: "JAKARTA - PALEMBANG",
                        tripType: "ADD",
                        wilayah: "SUMATERA",
                        platNomor: "B 9356 PKK",
                        driver1: "Yosep P.",
                        driver2: "Yuda R.",
                        jamBerangkat: "22/07/2026 09:00",
                        estimasiSampai: "23/07/2026 09:00",
                        totalAwb: 7430,
                        sisaAwb: 0,
                        status: "SUDAH SELESAI",
                        targetSLAOutboundHours: 24,
                        targetSLAReturnHours: 24,
                        targetSLARoundtripHours: 48,
                        inputBy: "Hamdan",
                        shiftId: "SHIFT-20260816-01"
                    }
                ];

                for (const item of initialIncoming) {
                    await window.db.collection('incoming').doc(item.kodeTugas).set(item);

                    // Outbound SLA
                    await window.db.collection('sla_outbound').doc(item.kodeTugas).set({
                        kodeTugas: item.kodeTugas,
                        trip: item.trip,
                        namaRute: item.namaRute,
                        platNomor: item.platNomor,
                        jamBerangkat: item.jamBerangkat,
                        jamSampaiAktual: item.status === 'SUDAH SELESAI' ? "23/07/2026 08:30" : "",
                        durasiBerangkatMinutes: item.status === 'SUDAH SELESAI' ? 1410 : 0,
                        targetSLAHours: item.targetSLAOutboundHours,
                        lateMinutes: 0,
                        statusSla: item.status === 'SUDAH SELESAI' ? "ON TIME" : "BERJALAN",
                        alasan: item.status === 'SUDAH SELESAI' ? "Lancar" : "",
                        inputBy: item.inputBy,
                        shiftId: item.shiftId
                    });

                    // Roundtrip SLA
                    await window.db.collection('sla_roundtrip').doc(item.kodeTugas).set({
                        kodeTugas: item.kodeTugas,
                        trip: item.trip,
                        wilayah: item.wilayah,
                        targetSLAPP: item.targetSLARoundtripHours,
                        totalDurasiPPMinutes: 0,
                        totalLatePPMinutes: 0,
                        statusRoundtrip: "WAITING_RETURN",
                        keterangan: "Menunggu data perjalanan balikan dari Gateway"
                    });

                    // Monitoring 4H Initial Record
                    const todayStr = "2026-07-22";
                    await window.db.collection('monitoring_4h').doc(item.kodeTugas).set({
                        kodeTugas: item.kodeTugas,
                        tanggalMonitoring: todayStr,
                        trip: item.trip,
                        namaRute: item.namaRute,
                        platNomor: item.platNomor,
                        driver1: item.driver1,
                        slots: {
                            "00:00": { lokasi: "OUT JAKARTA", keterangan: "Keberangkatan Awal", jenisUpdate: "Lokasi Normal", jamUpdateAktual: "22/07/2026 01:15", inputBy: "Hamdan", shiftId: "SHIFT-20260816-01", statusUpdate: "SUDAH UPDATE" },
                            "04:00": { lokasi: "Tol Cikarang", keterangan: "Rest Area KM 57", jenisUpdate: "Istirahat", jamUpdateAktual: "22/07/2026 05:20", inputBy: "Hamdan", shiftId: "SHIFT-20260816-01", statusUpdate: "SUDAH UPDATE" },
                            "08:00": { lokasi: "Tol Cipali KM 102", keterangan: "Perjalanan Lancar", jenisUpdate: "Lokasi Normal", jamUpdateAktual: "22/07/2026 09:17", inputBy: "Hamdan", shiftId: "SHIFT-20260816-01", statusUpdate: "SUDAH UPDATE" },
                            "12:00": null,
                            "16:00": null,
                            "20:00": null
                        },
                        lastUpdateSlot: "08:00",
                        lastUpdateLokasi: "Tol Cipali KM 102",
                        lastUpdateTime: "22/07/2026 09:17",
                        lastUpdateBy: "Hamdan",
                        statusPerjalanan: item.status === 'SUDAH SELESAI' ? 'COMPLETED' : 'ON PROGRESS'
                    });
                }
            }

            // H. Seed Audit Logs
            const auditSnap = await window.db.collection('audit_logs').get();
            if (auditSnap.empty) {
                const sampleAuditLogs = [
                    { waktu: "22/07/2026 09:17", operator: "Hamdan", shiftId: "SHIFT-20260816-01", modul: "Monitoring 4H", kodeTugas: "DBGX2607220001", aktivitas: "Check-in Posisi Slot 08:00 (Tol Cipali KM 102)" },
                    { waktu: "22/07/2026 09:35", operator: "Rizky", shiftId: "SHIFT-20260816-01", modul: "SLA Vendor", kodeTugas: "DBGX2607220004", aktivitas: "Update Jam Sampai Gateway (23/07/2026 08:30)" },
                    { waktu: "22/07/2026 10:35", operator: "Hamdan", shiftId: "SHIFT-20260816-01", modul: "Trouble & Laka", kodeTugas: "DBGX2607220004", aktivitas: "Melaporkan Incident Trouble (Ban Pecah)" },
                    { waktu: "22/07/2026 11:20", operator: "Rizky", shiftId: "SHIFT-20260816-01", modul: "Incoming SSOT", kodeTugas: "DBGX2607220002", aktivitas: "Input Transaksi Incoming Baru (SRG FUSO)" }
                ];
                for (const a of sampleAuditLogs) {
                    await window.db.collection('audit_logs').add(a);
                }
            }

            console.log("✅ Firestore v4 Master, Transactions, Shifts, & Audit Logs Seeding completed.");
        } catch (err) {
            console.error("❌ Error seeding Firestore data:", err);
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
        if (!window.db) return () => {};
        return window.db.collection('master_trips').onSnapshot(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            callback(list);
        });
    },

    async saveMasterTrip(tripData) {
        if (!window.db) return;
        return window.db.collection('master_trips').doc(tripData.code).set({ ...tripData, status: tripData.status || 'ACTIVE' }, { merge: true });
    },

    async deleteMasterTrip(tripCode) {
        if (!window.db) return;
        const incomingCheck = await window.db.collection('incoming').where('trip', '==', tripCode).limit(1).get();
        if (!incomingCheck.empty) {
            return window.db.collection('master_trips').doc(tripCode).update({ status: 'INACTIVE' });
        }
        return window.db.collection('master_trips').doc(tripCode).delete();
    },

    subscribeMasterFleets(callback) {
        if (!window.db) return () => {};
        return window.db.collection('master_fleets').onSnapshot(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            callback(list);
        });
    },

    async saveMasterFleet(fleetData) {
        if (!window.db) return;
        const docId = fleetData.platNomor.replace(/\s+/g, '');
        return window.db.collection('master_fleets').doc(docId).set(fleetData, { merge: true });
    },

    subscribeMasterDrivers(callback) {
        if (!window.db) return () => {};
        return window.db.collection('master_drivers').onSnapshot(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            callback(list);
        });
    },

    async saveMasterDriver(driverData) {
        if (!window.db) return;
        const docId = driverData.nama.toLowerCase().replace(/\s+/g, '_');
        return window.db.collection('master_drivers').doc(docId).set(driverData, { merge: true });
    },

    subscribeMasterReasons(callback) {
        if (!window.db) return () => {};
        return window.db.collection('master_reasons').onSnapshot(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            callback(list);
        });
    },

    // ----------------------------------------------------
    // 3. INCOMING TRIPS (SINGLE SOURCE OF TRUTH)
    // ----------------------------------------------------
    async checkDuplicateKodeTugas(kodeTugas) {
        if (!window.db) return false;
        const targetClean = kodeTugas.trim().toLowerCase();
        const snap = await window.db.collection('incoming').get();
        let found = false;
        snap.forEach(d => {
            if (d.id.toLowerCase() === targetClean || (d.data().kodeTugas && d.data().kodeTugas.toLowerCase() === targetClean)) {
                found = true;
            }
        });
        return found;
    },

    subscribeIncoming(callback) {
        if (!window.db) return () => {};
        return window.db.collection('incoming').onSnapshot((snapshot) => {
            const data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
            callback(data);
        }, err => console.error("Firestore incoming snapshot error:", err));
    },

    async addIncomingTrip(tripData) {
        if (!window.db) return;

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
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await window.db.collection('incoming').doc(tripData.kodeTugas).set(fullTripData);

        // Outbound SLA
        await window.db.collection('sla_outbound').doc(tripData.kodeTugas).set({
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
        });

        // Roundtrip SLA
        await window.db.collection('sla_roundtrip').doc(tripData.kodeTugas).set({
            kodeTugas: tripData.kodeTugas,
            trip: fullTripData.trip,
            wilayah: masterInfo.wilayah,
            targetSLAPP: masterInfo.targetSLARoundtripHours,
            totalDurasiPPMinutes: 0,
            totalLatePPMinutes: 0,
            statusRoundtrip: "WAITING_RETURN",
            keterangan: "Menunggu data perjalanan balikan dari Gateway"
        });

        // Monitoring 4H Record
        const todayStr = new Date().toISOString().split('T')[0];
        await window.db.collection('monitoring_4h').doc(tripData.kodeTugas).set({
            kodeTugas: tripData.kodeTugas,
            tanggalMonitoring: todayStr,
            trip: fullTripData.trip,
            namaRute: fullTripData.namaRute,
            platNomor: fullTripData.platNomor,
            driver1: fullTripData.driver1,
            slots: {
                "00:00": { lokasi: "OUT JAKARTA", keterangan: "Keberangkatan Awal", jenisUpdate: "Lokasi Normal", jamUpdateAktual: fullTripData.jamBerangkat, inputBy: fullTripData.inputBy, shiftId: shiftId, statusUpdate: "SUDAH UPDATE" },
                "04:00": null,
                "08:00": null,
                "12:00": null,
                "16:00": null,
                "20:00": null
            },
            lastUpdateSlot: "00:00",
            lastUpdateLokasi: "OUT JAKARTA",
            lastUpdateTime: fullTripData.jamBerangkat,
            lastUpdateBy: fullTripData.inputBy,
            statusPerjalanan: "ON PROGRESS"
        });

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
        if (!window.db) return;
        return window.db.collection('incoming').doc(kodeTugas).set(updateObj, { merge: true });
    },

    // ----------------------------------------------------
    // 4. SLA MONITORING 3-TAB ENGINE
    // ----------------------------------------------------
    subscribeSLAOutbound(callback) {
        if (!window.db) return () => {};
        return window.db.collection('sla_outbound').onSnapshot(snap => {
            const data = [];
            snap.forEach(d => data.push({ id: d.id, ...d.data() }));
            callback(data);
        });
    },

    async saveSLAOutbound(kodeTugas, updateObj) {
        if (!window.db) return;
        const shiftId = this.getActiveShiftId();
        await window.db.collection('sla_outbound').doc(kodeTugas).set({ ...updateObj, shiftId: shiftId }, { merge: true });
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

    subscribeSLAReturn(callback) {
        if (!window.db) return () => {};
        return window.db.collection('sla_return').onSnapshot(snap => {
            const data = [];
            snap.forEach(d => data.push({ id: d.id, ...d.data() }));
            callback(data);
        });
    },

    async saveSLAReturn(kodeTugas, returnObj) {
        if (!window.db) return;
        const shiftId = this.getActiveShiftId();
        await window.db.collection('sla_return').doc(kodeTugas).set({ ...returnObj, shiftId: shiftId }, { merge: true });
        await this.recalculateSLARoundtrip(kodeTugas);
    },

    subscribeSLARoundtrip(callback) {
        if (!window.db) return () => {};
        return window.db.collection('sla_roundtrip').onSnapshot(snap => {
            const data = [];
            snap.forEach(d => data.push({ id: d.id, ...d.data() }));
            callback(data);
        });
    },

    async recalculateSLARoundtrip(kodeTugas) {
        if (!window.db) return;

        try {
            const incDoc = await window.db.collection('incoming').doc(kodeTugas).get();
            const outDoc = await window.db.collection('sla_outbound').doc(kodeTugas).get();
            const retDoc = await window.db.collection('sla_return').doc(kodeTugas).get();

            const incData = incDoc.exists ? incDoc.data() : {};
            const outData = outDoc.exists ? outDoc.data() : {};
            const retData = retDoc.exists ? retDoc.data() : {};

            const targetSLAPP = incData.targetSLARoundtripHours || 32;

            if (!retDoc.exists || !retData.jamSampaiJKT999) {
                await window.db.collection('sla_roundtrip').doc(kodeTugas).set({
                    kodeTugas: kodeTugas,
                    trip: incData.trip || "-",
                    wilayah: incData.wilayah || "JAWA",
                    targetSLAPP: targetSLAPP,
                    totalDurasiPPMinutes: outData.durasiBerangkatMinutes || 0,
                    totalLatePPMinutes: 0,
                    statusRoundtrip: "WAITING_RETURN",
                    keterangan: "⏳ Menunggu data perjalanan balikan dari Gateway"
                }, { merge: true });
                return;
            }

            const durasiBerangkatMin = outData.durasiBerangkatMinutes || 0;
            const durasiBalikanMin = retData.durasiBalikanMinutes || 0;
            const totalPPMinutes = durasiBerangkatMin + durasiBalikanMin;

            const targetSLAPPMinutes = targetSLAPP * 60;
            const totalLatePPMinutes = Math.max(0, totalPPMinutes - targetSLAPPMinutes);

            const statusRoundtrip = totalLatePPMinutes > 0 ? "LATE PP" : "ON TIME PP";
            const keteranganPP = totalLatePPMinutes > 0 ? 
                `Terlambat ${Math.floor(totalLatePPMinutes/60)} jam ${totalLatePPMinutes%60} menit` : 
                "Tiba Tepat Waktu PP";

            await window.db.collection('sla_roundtrip').doc(kodeTugas).set({
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
            }, { merge: true });

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
        if (!window.db) return () => {};
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
        if (!window.db) return () => {};
        return window.db.collection('monitoring_4h').onSnapshot(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            callback(list);
        });
    },

    async saveMonitoringSlotUpdate(kodeTugas, slotKey, lokasi, keterangan = "", jenisUpdate = "Lokasi Normal", jamUpdateAktual = "", inputBy = "Hamdan", statusPerjalanan = "ON PROGRESS") {
        if (!window.db) return;

        const shiftId = this.getActiveShiftId();
        const docRef = window.db.collection('monitoring_4h').doc(kodeTugas);
        const docSnap = await docRef.get();
        let existing = docSnap.exists ? docSnap.data() : { slots: {} };
        if (!existing.slots) existing.slots = {};

        const oldSlotData = existing.slots[slotKey];
        const newSlotData = {
            lokasi: lokasi,
            keterangan: keterangan,
            jenisUpdate: jenisUpdate,
            jamUpdateAktual: jamUpdateAktual,
            inputBy: inputBy,
            shiftId: shiftId,
            statusUpdate: "SUDAH UPDATE"
        };

        // Audit Trail Log if Overwriting an existing slot
        if (oldSlotData && oldSlotData.lokasi && oldSlotData.lokasi !== lokasi) {
            await this.logAuditEvent({
                waktu: jamUpdateAktual || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: inputBy,
                shiftId: shiftId,
                modul: "Monitoring 4H",
                kodeTugas: kodeTugas,
                aktivitas: `Revisi Posisi Slot ${slotKey} (${oldSlotData.lokasi} ➔ ${lokasi})`
            });
        } else {
            await this.logAuditEvent({
                waktu: jamUpdateAktual || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                operator: inputBy,
                shiftId: shiftId,
                modul: "Monitoring 4H",
                kodeTugas: kodeTugas,
                aktivitas: `Check-in Posisi Slot ${slotKey} (${lokasi})`
            });
        }

        existing.slots[slotKey] = newSlotData;

        const updateObj = {
            slots: existing.slots,
            lastUpdateSlot: slotKey,
            lastUpdateLokasi: lokasi,
            lastUpdateTime: jamUpdateAktual,
            lastUpdateBy: inputBy,
            statusPerjalanan: statusPerjalanan
        };

        return docRef.set(updateObj, { merge: true });
    },

    // ----------------------------------------------------
    // 6. INCIDENT MANAGEMENT (TROUBLE & LAKA)
    // ----------------------------------------------------
    subscribeTroubles(callback) {
        if (!window.db) return () => {};
        return window.db.collection('troubles').onSnapshot((snapshot) => {
            const data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
            callback(data);
        }, err => console.error("Firestore troubles snapshot error:", err));
    },

    async addTroubleIncident(incidentData) {
        if (!window.db) return;

        const shiftId = this.getActiveShiftId();
        const fullIncident = {
            ...incidentData,
            severity: incidentData.severity || "MEDIUM",
            status: "DALAM PENANGANAN",
            shiftId: shiftId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            history: [
                {
                    time: incidentData.waktuKejadian,
                    note: `Laporan incident ${incidentData.jenis} dikirim oleh ${incidentData.dilaporkanOleh}`,
                    status: "OPEN",
                    user: incidentData.dilaporkanOleh
                }
            ]
        };

        await window.db.collection('troubles').doc(incidentData.incidentId).set(fullIncident);

        // Update status armada di Monitoring 4H menjadi KENDALA
        await window.db.collection('monitoring_4h').doc(incidentData.kodeTugas).set({
            statusPerjalanan: "KENDALA"
        }, { merge: true });

        await this.logAuditEvent({
            waktu: incidentData.waktuKejadian,
            operator: incidentData.dilaporkanOleh,
            shiftId: shiftId,
            modul: "Trouble & Laka",
            kodeTugas: incidentData.kodeTugas,
            aktivitas: `Melaporkan Incident ${incidentData.jenis} (${incidentData.kategoriTrouble} - Severity ${incidentData.severity})`
        });

        return fullIncident;
    },

    async updateIncidentStatus(incidentId, newStatus, note = "", user = "Hamdan") {
        if (!window.db) return;

        const docRef = window.db.collection('troubles').doc(incidentId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) return;

        const data = docSnap.data();
        const history = data.history || [];
        
        const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        history.push({
            time: nowStr,
            note: note || `Status diperbarui menjadi ${newStatus}`,
            status: newStatus,
            user: user
        });

        await docRef.update({
            status: newStatus,
            history: history
        });

        if (newStatus === 'SUDAH SELESAI' && data.kodeTugas) {
            await window.db.collection('monitoring_4h').doc(data.kodeTugas).set({
                statusPerjalanan: "ON PROGRESS"
            }, { merge: true });
        }
    },

    // ----------------------------------------------------
    // 7. SHIFT MANAGEMENT & AUDIT LOGS ENGINE
    // ----------------------------------------------------
    subscribeShifts(callback) {
        if (!window.db) return () => {};
        return window.db.collection('shifts').onSnapshot(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            callback(list);
        });
    },

    async saveActiveShift(shiftData) {
        if (!window.db) return;
        return window.db.collection('shifts').doc(shiftData.shiftId).set(shiftData, { merge: true });
    },

    subscribeAuditLogs(callback) {
        if (!window.db) return () => {};
        return window.db.collection('audit_logs').onSnapshot(snap => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            // Sort by latest timestamp
            list.sort((a, b) => (b.waktu || '').localeCompare(a.waktu || ''));
            callback(list);
        });
    },

    async logAuditEvent(auditObj) {
        if (!window.db) return;
        return window.db.collection('audit_logs').add({
            waktu: auditObj.waktu || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
            operator: auditObj.operator || "System",
            shiftId: auditObj.shiftId || this.getActiveShiftId(),
            modul: auditObj.modul || "General",
            kodeTugas: auditObj.kodeTugas || "-",
            aktivitas: auditObj.aktivitas || ""
        });
    },

    // ----------------------------------------------------
    // 8. USERS CRUD
    // ----------------------------------------------------
    subscribeUsers(callback) {
        if (!window.db) return () => {};
        return window.db.collection('users').onSnapshot((snapshot) => {
            const data = [];
            snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
            callback(data);
        }, err => console.error("Firestore users snapshot error:", err));
    },

    async saveUserProfile(username, profileData) {
        if (!window.db) return;
        return window.db.collection('users').doc(username.toLowerCase()).set(profileData, { merge: true });
    },

    async deleteUser(username) {
        if (!window.db) return;
        return window.db.collection('users').doc(username.toLowerCase()).delete();
    },

    // ----------------------------------------------------
    // 9. DATABASE BACKUP & ADMIN RESTORE ENGINE
    // ----------------------------------------------------
    async exportDatabaseSnapshot() {
        if (!window.db) return {};

        const collections = ['incoming', 'sla_outbound', 'sla_return', 'sla_roundtrip', 'monitoring_4h', 'troubles', 'shifts', 'master_trips', 'master_fleets', 'master_drivers', 'master_reasons', 'users', 'audit_logs'];
        const backupData = {
            exportDate: new Date().toISOString(),
            version: "1.0.0",
            collections: {}
        };

        for (const colName of collections) {
            const snap = await window.db.collection(colName).get();
            backupData.collections[colName] = [];
            snap.forEach(doc => backupData.collections[colName].push({ _docId: doc.id, ...doc.data() }));
        }

        return backupData;
    },

    async restoreDatabaseFromJSON(jsonObj) {
        if (!window.db || !jsonObj.collections) throw new Error("Format JSON Backup tidak valid!");

        for (const colName in jsonObj.collections) {
            const docsList = jsonObj.collections[colName];
            for (const item of docsList) {
                const docId = item._docId || item.id;
                delete item._docId;
                if (docId) {
                    await window.db.collection(colName).doc(docId).set(item, { merge: true });
                }
            }
        }
        return true;
    },

    // ----------------------------------------------------
    // 10. REAL-TIME NOTIFICATION CENTER ENGINE
    // ----------------------------------------------------
    subscribeNotifications(callback) {
        if (!window.db) return () => {};

        return window.db.collection('troubles').onSnapshot(snap => {
            const alerts = [];
            snap.forEach(doc => {
                const item = doc.data();
                if (item.status !== 'SUDAH SELESAI' && (item.severity === 'CRITICAL' || item.severity === 'HIGH' || item.jenis === 'Laka')) {
                    alerts.push({
                        id: doc.id,
                        type: "CRITICAL_INCIDENT",
                        title: `🚨 INCIDENT ${item.jenis.toUpperCase()} (${item.severity})`,
                        message: `${item.platNomor} - ${item.kategoriTrouble} di ${item.lokasiKejadian}`,
                        link: `trouble.html?kodeTugas=${item.kodeTugas}`
                    });
                }
            });

            // SLA Alerts
            alerts.push({
                id: "SLA-ALERT-01",
                type: "SLA_ALERT",
                title: "⏰ SLA WARNING",
                message: "DBGX2607220001 (JOG CDD) sisa SLA < 2 Jam",
                link: "sla-vendor.html"
            });

            // Monitoring Check-in Alert
            alerts.push({
                id: "MON-ALERT-01",
                type: "MONITORING_ALERT",
                title: "⚠️ CHECK-IN 4H ALERT",
                message: "7 Armada belum melakukan check-in slot 08:00 WIB",
                link: "monitoring.html"
            });

            callback(alerts);
        });
    }
};

// Initialize seeding when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.db) {
            JNTFirebaseService.seedInitialDataIfEmpty();
        }
    }, 1000);
});

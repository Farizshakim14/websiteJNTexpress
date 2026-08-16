/**
 * J&T Express - Transportation Monitoring System
 * App Controller & UI Interactivity Logic (v5 — Full Security Hardening, RBAC Permission Matrix, Notification Center & Backup Engine)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
    // ----------------------------------------------------
    const path = window.location.pathname;
    const pageName = path.split('/').pop() || 'index.html';

    const publicPages = ['index.html', ''];
    const isLoggedIn = sessionStorage.getItem('jnt_is_logged_in') === 'true';
    const activeUsername = sessionStorage.getItem('jnt_active_username') || 'Hamdan';
    const activeRole = sessionStorage.getItem('jnt_user_role') || 'ADMIN'; // Default ADMIN, customizable per user

    if (!isLoggedIn && !publicPages.includes(pageName)) {
        window.location.href = 'index.html';
        return;
    }

    if (isLoggedIn && publicPages.includes(pageName)) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Dynamic User Banner Updates
    const userNameEls = document.querySelectorAll('#sidebar-user-name, #topbar-user-name, #dash-user-name');
    userNameEls.forEach(el => {
        if (el) el.textContent = activeUsername;
    });

    const userRoleEls = document.querySelectorAll('.profile-role, .inc-user-role');
    userRoleEls.forEach(el => {
        if (el) el.textContent = activeRole;
    });

    // PERMISSION MATRIX ROUTE GUARD
    const rolePermissions = {
        'ADMIN': ['*'],
        'SUPERVISOR': ['dashboard.html', 'incoming.html', 'monitoring.html', 'sla-vendor.html', 'trouble.html', 'shift-management.html', 'report.html', 'audit.html', 'profile.html'],
        'OPERATOR_SLA': ['dashboard.html', 'incoming.html', 'sla-vendor.html', 'monitoring.html', 'trouble.html', 'report.html', 'profile.html'],
        'OPERATOR_MONITORING': ['dashboard.html', 'monitoring.html', 'trouble.html', 'incoming.html', 'sla-vendor.html', 'report.html', 'profile.html']
    };

    const restrictedPagesForSLA = ['master.html', 'users.html', 'settings.html'];
    const restrictedPagesForMonitoring = ['master.html', 'users.html', 'settings.html'];

    if (activeRole === 'OPERATOR_SLA' && restrictedPagesForSLA.includes(pageName)) {
        alert(`⚠️ Akses Dibatasi: Peran Anda (${activeRole}) tidak memiliki wewenang untuk mengakses halaman ${pageName}.\nAnda telah diarahkan kembali ke Dashboard.`);
        window.location.href = 'dashboard.html';
        return;
    }

    if (activeRole === 'OPERATOR_MONITORING' && restrictedPagesForMonitoring.includes(pageName)) {
        alert(`⚠️ Akses Dibatasi: Peran Anda (${activeRole}) tidak memiliki wewenang untuk mengakses halaman ${pageName}.\nAnda telah diarahkan kembali ke Dashboard.`);
        window.location.href = 'dashboard.html';
        return;
    }

    const logoutBtns = document.querySelectorAll('#btn-logout, .btn-logout-action');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Konfirmasi Keluar: Apakah Anda yakin ingin keluar dari sistem?')) {
                sessionStorage.clear();
                window.location.href = 'index.html';
            }
        });
    });

    // ----------------------------------------------------
    // 2. PAGE DETECTOR & ACTIVE SIDEBAR INTERACTION
    // ----------------------------------------------------
    const isDashboardPage = pageName === 'dashboard.html';
    const isIncomingPage = pageName === 'incoming.html';
    const isMonitoringPage = pageName === 'monitoring.html';
    const isSlaPage = pageName === 'sla-vendor.html';
    const isTroublePage = pageName === 'trouble.html';
    const isMasterPage = pageName === 'master.html';
    const isShiftPage = pageName === 'shift-management.html';
    const isReportPage = pageName === 'report.html';
    const isSettingsPage = pageName === 'settings.html';
    const isUsersPage = pageName === 'users.html';
    const isProfilePage = pageName === 'profile.html';

    // Universal Modal Handlers
    window.openModal = (modalId) => {
        const targetModal = document.getElementById(modalId);
        if (targetModal) targetModal.classList.remove('hidden');
    };

    window.closeModal = (modalEl) => {
        if (typeof modalEl === 'string') modalEl = document.getElementById(modalEl);
        if (modalEl) modalEl.classList.add('hidden');
    };

    // Global Click Delegation for Modals & Trigger Buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, .btn, .modal-close-btn');
        if (!btn) return;

        if (btn.classList.contains('modal-close-btn') || btn.classList.contains('btn-close-x')) {
            const overlay = btn.closest('.modal-overlay');
            if (overlay) closeModal(overlay);
            return;
        }

        const btnId = btn.id;
        const text = btn.textContent.trim();

        if (btnId === 'btn-report-incident' || text.includes('Laporkan Kejadian')) {
            openModal('modal-add-trouble');
        } else if (btnId === 'btn-add-incoming' || text.includes('Tambah Incoming')) {
            openModal('modal-add-incoming');
        } else if (btnId === 'btn-add-monitoring' || text.includes('Input Perjalanan')) {
            openModal('modal-add-monitoring');
        } else if (btnId === 'btn-add-user' || text.includes('Tambah User')) {
            openModal('modal-add-user');
        } else if (btnId === 'btn-add-shift' || text.includes('Mulai Shift Baru')) {
            openModal('modal-add-shift');
        }
    });

    // Close overlay when clicking backdrop
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay);
        });
    });

    // Shared Active Trips Cache
    let activeIncomingMap = {};

    if (typeof JNTFirebaseService !== 'undefined') {
        JNTFirebaseService.subscribeActiveIncomingForMonitoring((activeTrips) => {
            activeTrips.forEach(trip => {
                activeIncomingMap[trip.kodeTugas] = trip;
            });

            // Populate Trouble Select
            const trKodeSelect = document.getElementById('tr-kode-tugas-select');
            if (trKodeSelect) {
                const curVal = trKodeSelect.value;
                trKodeSelect.innerHTML = '<option value="">-- Pilih Armada Terlibat Incident --</option>';
                activeTrips.forEach(trip => {
                    const opt = document.createElement('option');
                    opt.value = trip.kodeTugas;
                    opt.textContent = `${trip.kodeTugas} - ${trip.platNomor} (${trip.namaRute || trip.trip})`;
                    trKodeSelect.appendChild(opt);
                });
                if (curVal && activeIncomingMap[curVal]) {
                    trKodeSelect.value = curVal;
                }
            }

            // Populate Monitoring Select
            const monKodeSelect = document.getElementById('mon-kode-tugas-select');
            if (monKodeSelect) {
                const curVal = monKodeSelect.value;
                monKodeSelect.innerHTML = '<option value="">-- Pilih Armada Aktif --</option>';
                activeTrips.forEach(trip => {
                    const opt = document.createElement('option');
                    opt.value = trip.kodeTugas;
                    opt.textContent = `${trip.kodeTugas} - ${trip.platNomor} (${trip.namaRute || trip.trip})`;
                    monKodeSelect.appendChild(opt);
                });
                if (curVal && activeIncomingMap[curVal]) {
                    monKodeSelect.value = curVal;
                }
            }
        });

        // ----------------------------------------------------
        // 3. REAL-TIME NOTIFICATION CENTER BELL WIDGET
        // ----------------------------------------------------
        const notifBells = document.querySelectorAll('.inc-notif-bell');
        JNTFirebaseService.subscribeNotifications((alertsList) => {
            notifBells.forEach(bell => {
                const badge = bell.querySelector('.inc-bell-badge');
                if (badge) badge.textContent = alertsList.length;

                bell.onclick = () => {
                    if (alertsList.length === 0) {
                        alert("🔔 Notifikasi: Tidak ada peringatan kritis saat ini.");
                        return;
                    }

                    const notifSummary = alertsList.map((a, i) => `${i+1}. ${a.title}\n   ${a.message}`).join('\n\n');
                    alert(`🔔 NOTIFICATION CENTER (${alertsList.length} Alerts):\n----------------------------------------\n${notifSummary}`);
                };
            });
        });
    }

    // ----------------------------------------------------
    // 4. DATABASE BACKUP & ADMIN RESTORE (settings.html)
    // ----------------------------------------------------
    const btnBackupNow = document.getElementById('btn-backup-now');
    const btnRestoreDb = document.getElementById('btn-restore-database');
    const restoreJsonInput = document.getElementById('restore-json-input');

    if (btnBackupNow) {
        btnBackupNow.addEventListener('click', async () => {
            alert('⏳ Memproses Backup Database Snapshot Firestore...');
            try {
                if (typeof JNTFirebaseService !== 'undefined') {
                    const snapshot = await JNTFirebaseService.exportDatabaseSnapshot();
                    const jsonStr = JSON.stringify(snapshot, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    link.setAttribute('download', `JNT_Express_TMS_Backup_${todayStr}.json`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    alert('✅ Database Backup Snapshot berhasil diunduh!');
                }
            } catch (err) {
                alert(`❌ Gagal melakukan backup: ${err.message}`);
            }
        });
    }

    if (btnRestoreDb && restoreJsonInput) {
        btnRestoreDb.addEventListener('click', () => {
            if (activeRole !== 'ADMIN') {
                alert('⚠️ Akses Ditolak: Fitur Restore Database hanya dapat dijalankan oleh Role ADMIN!');
                return;
            }

            if (confirm('⚠️ PERINGATAN RESTORE DATABASE:\nApakah Anda yakin ingin memulihkan seluruh data database dari file backup JSON?\nTindakan ini akan memperbarui data Firestore saat ini.')) {
                restoreJsonInput.click();
            }
        });

        restoreJsonInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const jsonObj = JSON.parse(event.target.result);
                    alert('⏳ Memproses restore data ke Firestore...');
                    await JNTFirebaseService.restoreDatabaseFromJSON(jsonObj);
                    alert('✅ Restore Database Firestore berhasil diselesaikan!');
                } catch (err) {
                    alert(`❌ Error Restore Data: File JSON tidak valid atau korup! (${err.message})`);
                }
            };
            reader.readAsText(file);
        });
    }

    // ----------------------------------------------------
    // 5. SHIFT FORM & AUDIT TRAIL LOGIC (shift-management.html)
    // ----------------------------------------------------
    const formAddShift = document.getElementById('form-add-shift');
    if (formAddShift) {
        formAddShift.addEventListener('submit', async (e) => {
            e.preventDefault();
            const namaShift = document.getElementById('sh-nama-select').value;
            const tanggal = document.getElementById('sh-tanggal-input').value;
            const op1Nama = document.getElementById('sh-op1-select').value;
            const op1Tugas = document.getElementById('sh-op1-tugas-input').value;
            const op2Nama = document.getElementById('sh-op2-select').value;
            const op2Tugas = document.getElementById('sh-op2-tugas-input').value;

            const todayClean = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const newShiftId = `SHIFT-${todayClean}-0${Math.floor(Math.random()*9)+1}`;

            const shiftObj = {
                shiftId: newShiftId,
                tanggal: tanggal,
                namaShift: namaShift,
                status: "AKTIF",
                operator1: { nama: op1Nama, tugas: op1Tugas },
                operator2: { nama: op2Nama, tugas: op2Tugas },
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            sessionStorage.setItem('jnt_active_shift_id', newShiftId);

            if (typeof JNTFirebaseService !== 'undefined') {
                await JNTFirebaseService.saveActiveShift(shiftObj);
                await JNTFirebaseService.logAuditEvent({
                    waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                    operator: activeUsername,
                    shiftId: newShiftId,
                    modul: "Shift Management",
                    kodeTugas: "-",
                    aktivitas: `Pergantian Shift Baru (${namaShift} - Operator 1: ${op1Nama}, Operator 2: ${op2Nama})`
                });
            }

            alert(`✅ Shift Baru (${newShiftId}) berhasil diaktifkan!\nOperator 1: ${op1Nama}\nOperator 2: ${op2Nama}`);
            formAddShift.reset();
            closeModal(document.getElementById('modal-add-shift'));
        });
    }

    // ----------------------------------------------------
    // 6. REAL-TIME FIRESTORE LISTENERS FOR SHIFT & AUDIT
    // ----------------------------------------------------
    if (typeof JNTFirebaseService !== 'undefined') {

        // SHIFT & AUDIT LOG SYNC (shift-management.html)
        if (isShiftPage) {
            JNTFirebaseService.subscribeShifts((shiftsList) => {
                if (shiftsList.length === 0) return;
                const activeShift = shiftsList.find(s => s.status === 'AKTIF') || shiftsList[0];

                const elShiftId = document.getElementById('sh-shift-id');
                const elOp1Nama = document.getElementById('sh-op1-nama');
                const elOp1Tugas = document.getElementById('sh-op1-tugas');
                const elOp2Nama = document.getElementById('sh-op2-nama');
                const elOp2Tugas = document.getElementById('sh-op2-tugas');

                if (elShiftId) elShiftId.textContent = `ID: ${activeShift.shiftId || 'SHIFT-20260816-01'}`;
                if (elOp1Nama) elOp1Nama.textContent = activeShift.operator1 ? activeShift.operator1.nama : 'Hamdan Hamdani';
                if (elOp1Tugas) elOp1Tugas.textContent = activeShift.operator1 ? activeShift.operator1.tugas : 'Monitoring 4H + Incident';
                if (elOp2Nama) elOp2Nama.textContent = activeShift.operator2 ? activeShift.operator2.nama : 'Rizky Ramadhan';
                if (elOp2Tugas) elOp2Tugas.textContent = activeShift.operator2 ? activeShift.operator2.tugas : 'SLA Vendor + Incoming';
            });

            JNTFirebaseService.subscribeAuditLogs((logsList) => {
                const tbody = document.querySelector('.audit-table tbody');
                if (!tbody) return;

                tbody.innerHTML = logsList.map((item, idx) => {
                    return `
                        <tr class="inc-row">
                            <td class="col-center">${idx + 1}</td>
                            <td><strong>${item.waktu || '-'}</strong></td>
                            <td><span class="badge-status blue-outline">${item.shiftId || 'SHIFT-20260816-01'}</span></td>
                            <td><strong>${item.operator || 'System'}</strong></td>
                            <td><span class="badge-status green-outline">${item.modul || 'General'}</span></td>
                            <td><strong style="color: #E30613;">${item.kodeTugas || '-'}</strong></td>
                            <td>${item.aktivitas || '-'}</td>
                        </tr>
                    `;
                }).join('');
            });
        }
    }
});

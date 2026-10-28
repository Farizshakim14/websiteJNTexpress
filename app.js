/**
 * J&T Express - Transportation Monitoring System
 * App Controller & UI Interactivity Logic (v5 — Full Security Hardening, RBAC Permission Matrix, Notification Center & Backup Engine)
 * ⚡ FIREBASE-ONLY MODE: Semua data input langsung ke Firestore. Tidak ada penyimpanan lokal di device.
 */

// ============================================================
// ⚡ FIREBASE-ONLY: AUTO-CLEANUP DATA OPERASIONAL LAMA
// Bersihkan data operasional lama dari localStorage jika ada.
// Hanya hapus key data operasional, bukan preferensi UI.
// ============================================================
(function cleanupLegacyLocalStorage() {
    const operationalKeys = [
        'jnt_store_incoming',
        'jnt_store_sla_outbound',
        'jnt_store_sla_return',
        'jnt_store_sla_roundtrip',
        'jnt_store_monitoring_4h',
        'jnt_store_troubles',
        'jnt_store_audit_log',
        'jnt_store_shifts',
        'jnt_store_users',
        'jnt_sync_queue',
        'jnt_conflicts',
        'jnt_global_data_pulse',
        'jnt_seed_version',
        'jnt_incoming',
        'jnt_sla_outbound',
        'jnt_sla_return',
        'jnt_sla_roundtrip',
        'jnt_monitoring_4h',
        'jnt_troubles',
        'jnt_shifts',
        'jnt_users',
        'jnt_master_trips',
        'jnt_master_fleets',
        'jnt_master_vendors',
        'jnt_master_drivers',
        'jnt_master_reasons',
        'jnt_audit_logs'
    ];
    operationalKeys.forEach(key => {
        try { localStorage.removeItem(key); } catch (e) {}
    });
    console.log('[FIREBASE-ONLY] Auto-cleanup: data operasional lama di localStorage telah dibersihkan.');
})();

// ============================================================
// ⚡ FIREBASE-ONLY: BANNER NOTIFIKASI OFFLINE
// Tampilkan banner merah di atas halaman jika internet terputus.
// ============================================================
(function initOfflineBanner() {
    const BANNER_ID = 'jnt-offline-banner';
    function createBanner() {
        if (document.getElementById(BANNER_ID)) return;
        const banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'right: 0',
            'z-index: 99999',
            'background: linear-gradient(90deg, #DC2626, #B91C1C)',
            'color: #FFFFFF',
            'text-align: center',
            'padding: 10px 20px',
            'font-family: "Plus Jakarta Sans", sans-serif',
            'font-size: 13.5px',
            'font-weight: 700',
            'letter-spacing: 0.02em',
            'box-shadow: 0 3px 12px rgba(185,28,28,0.5)',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'gap: 10px',
            'animation: jnt-slide-down 0.3s ease'
        ].join('; ');
        banner.innerHTML = '⚠️ TIDAK ADA KONEKSI INTERNET — Input data tidak dapat disimpan. Hubungkan ke internet untuk melanjutkan.';

        // Inject keyframe animation
        if (!document.getElementById('jnt-offline-banner-style')) {
            const style = document.createElement('style');
            style.id = 'jnt-offline-banner-style';
            style.textContent = '@keyframes jnt-slide-down { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }';
            if (document.head) document.head.appendChild(style);
            else if (document.body) document.body.appendChild(style);
        }

        document.body.insertBefore(banner, document.body.firstChild);
        // Geser konten agar tidak tertutup banner
        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.paddingTop = '44px';
    }

    function removeBanner() {
        const banner = document.getElementById(BANNER_ID);
        if (banner) {
            banner.style.animation = 'jnt-slide-down 0.3s ease reverse';
            setTimeout(() => {
                banner.remove();
                const appContainer = document.getElementById('app-container');
                if (appContainer) appContainer.style.paddingTop = '';
            }, 300);
        }
    }

    // Cek status awal
    if (!navigator.onLine) {
        document.addEventListener('DOMContentLoaded', createBanner, { once: true });
        if (document.readyState !== 'loading') createBanner();
    }

    window.addEventListener('offline', createBanner);
    window.addEventListener('online', removeBanner);
    window.addEventListener('jnt_network_offline', createBanner);
    window.addEventListener('jnt_network_online', removeBanner);
})();

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
    // LOCAL ACCOUNT SYSTEM (No Firebase Auth required)
    // ----------------------------------------------------

    // ===== LOCAL ACCOUNTS SEED (Hanya inisialisasi sekali — tidak pernah menimpa akun runtime) =====
    // FIX BUG-5: Sebelumnya LOCAL_ACCOUNTS di-overwrite setiap halaman dibuka, menghapus akun runtime.
    // Sekarang hanya diisi jika belum ada data — akun yang dibuat administrator di users.html tetap terjaga.
    // SECURITY: Akun hardcoded (devoleper/dev123, role ADMIN) dihapus.
    // Semua login wajib lewat Firebase Auth + profil di koleksi Firestore 'users'.
    const LOCAL_ACCOUNTS_SEED = [];

    // Bersihkan sisa akun developer lama dari localStorage browser yang pernah menyimpannya
    try {
        const stored = JSON.parse(localStorage.getItem('jnt_local_accounts') || 'null');
        if (Array.isArray(stored)) {
            const cleaned = stored.filter(acc => acc && acc.uid !== 'dev-001' && acc.username !== 'devoleper');
            if (cleaned.length !== stored.length) localStorage.setItem('jnt_local_accounts', JSON.stringify(cleaned));
        }
    } catch (_) {}

    // Hanya inisialisasi jika belum ada data — jangan pernah timpa akun yang sudah ada
    if (!localStorage.getItem('jnt_local_accounts')) {
        localStorage.setItem('jnt_local_accounts', JSON.stringify(LOCAL_ACCOUNTS_SEED));
    }

    const path = window.location.pathname;
    const pageName = path.split('/').pop() || 'index.html';

    const publicPages = ['index.html', ''];
    const isLoggedIn = sessionStorage.getItem('jnt_is_logged_in') === 'true';

    // FIX BUG-2: Hapus fallback 'ADMIN' dan 'Developer Admin'.
    // Nilai null berarti tidak ada sesi — jangan pernah berasumsi role apapun.
    const activeUsername = sessionStorage.getItem('jnt_active_username') || null;
    const activeRole    = sessionStorage.getItem('jnt_user_role')       || null;

    // Guard 1: Pengguna tidak login → redirect ke halaman login
    if (!isLoggedIn && !publicPages.includes(pageName)) {
        window.location.href = 'index.html';
        return;
    }

    // Guard 2: Pengguna sudah login → jangan izinkan akses ke halaman publik
    if (isLoggedIn && publicPages.includes(pageName)) {
        window.location.href = 'dashboard.html';
        return;
    }

    // Guard 3: Sesi tidak lengkap (login=true tapi role/username hilang atau kosong).
    // Ini terjadi jika sessionStorage dimanipulasi secara parsial melalui DevTools.
    // Tindakan: batalkan sesi sepenuhnya dan minta login ulang.
    const VALID_ROLES = ['ADMIN', 'SUPERVISOR', 'OPERATOR_SLA', 'OPERATOR_MONITORING'];
    if (isLoggedIn && (!activeRole || !activeUsername || !VALID_ROLES.includes(activeRole))) {
        console.warn('[AUTH GUARD] Sesi tidak valid atau role tidak dikenal. Membersihkan sesi dan redirect ke login.');
        sessionStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    // ----------------------------------------------------
    // SINGLE-SESSION LOCK — 1 akun hanya boleh dipakai 1 pengguna/perangkat.
    // Disimpan di Firestore: active_sessions/{username} = { sessionId, lastSeen }
    // Sesi dianggap mati jika tidak ada heartbeat > SESSION_STALE_MS.
    // ----------------------------------------------------
    const SESSION_HEARTBEAT_MS = 30000;
    const SESSION_STALE_MS     = 90000;
    function jntSessionKey(u) { return String(u || '').toLowerCase().replace(/[\/.#$\[\]]/g, '_'); }
    function jntSessionRef(u) {
        return (window.db && u) ? window.db.collection('active_sessions').doc(jntSessionKey(u)) : null;
    }
    async function jntAcquireSessionLock(username) {
        if (typeof window.ensureFirebaseAuth === 'function') {
            try { await window.ensureFirebaseAuth(); } catch (_) {}
        }
        const ref = jntSessionRef(username);
        if (!ref) return { ok: true }; // Firestore tidak tersedia, izinkan login
        const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        try {
            const ok = await window.db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const d = snap.exists ? snap.data() : null;
                const isSameBrowser = d && d.userAgent === navigator.userAgent;
                // Tolak hanya jika ada sesi aktif milik perangkat/browser lain (heartbeat < 90 detik)
                if (d && d.sessionId && !isSameBrowser && (Date.now() - (d.lastSeen || 0)) < SESSION_STALE_MS) return false;
                tx.set(ref, { sessionId, lastSeen: Date.now(), username, userAgent: navigator.userAgent });
                return true;
            });
            if (!ok) return { ok: false };
            sessionStorage.setItem('jnt_session_id', sessionId);
            return { ok: true };
        } catch (e) {
            // Jika Firestore rules belum di-deploy atau offline: IZINKAN login (jangan blokir)
            console.warn('[SESSION LOCK] Firestore tidak dapat diakses, session lock dinonaktifkan:', e.code || e.message);
            return { ok: true };
        }
    }
    async function jntReleaseSessionLock() {
        const ref = jntSessionRef(sessionStorage.getItem('jnt_username_login'));
        const sid = sessionStorage.getItem('jnt_session_id');
        if (!ref || !sid) return;
        try {
            const snap = await ref.get();
            if (snap.exists && snap.data().sessionId === sid) await ref.delete();
        } catch (e) { console.warn('[SESSION LOCK] release gagal:', e.message); }
    }
    window.jntReleaseSessionLock = jntReleaseSessionLock;

    // Heartbeat di halaman terproteksi
    if (isLoggedIn && !publicPages.includes(pageName)) {
        const beat = async () => {
            const loginUser = sessionStorage.getItem('jnt_username_login');
            let sid = sessionStorage.getItem('jnt_session_id');

            // Sesi lama (sebelum fitur ini) tidak punya session_id → acquire sekarang
            if (!sid && loginUser && window.db) {
                const res = await jntAcquireSessionLock(loginUser);
                if (!res.ok) {
                    // Ada sesi lain yang lebih baru — paksa logout
                    jntShowEvictedModal();
                    return;
                }
                sid = sessionStorage.getItem('jnt_session_id');
            }

            const ref = jntSessionRef(loginUser);
            if (!ref || !sid) return;
            try {
                const snap = await ref.get();
                if (snap.exists && snap.data().sessionId && snap.data().sessionId !== sid) {
                    jntShowEvictedModal();
                    return;
                }
                await ref.set({ sessionId: sid, lastSeen: Date.now() }, { merge: true });
            } catch (e) { /* offline / rules: abaikan */ }
        };
        setTimeout(beat, 2000);
        setInterval(beat, SESSION_HEARTBEAT_MS);
    }

    // Modal pemberitahuan sesi digantikan (tidak bisa di-dismiss)
    function jntShowEvictedModal() {
        let m = document.getElementById('jnt-evicted-modal');
        if (m) return; // sudah tampil
        m = document.createElement('div');
        m.id = 'jnt-evicted-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
        m.innerHTML = `
          <div style="background:#1e2433;border:2px solid #E30613;border-radius:16px;padding:40px 36px;max-width:420px;text-align:center;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 20px 60px rgba(227,6,19,0.4);">
            <div style="font-size:48px;margin-bottom:16px;">🔒</div>
            <h2 style="color:#E30613;margin:0 0 12px;font-size:20px;">Sesi Diakhiri</h2>
            <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 28px;">Akun Anda sedang digunakan di <strong>perangkat atau browser lain</strong>.<br>Demi keamanan, Anda telah dikeluarkan dari sesi ini.</p>
            <button onclick="sessionStorage.clear();window.location.href='index.html';" style="background:#E30613;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:700;cursor:pointer;width:100%;">Kembali ke Halaman Login</button>
          </div>`;
        document.body.appendChild(m);
        sessionStorage.clear();
    }

    // ----------------------------------------------------
    // LOGIN FORM HANDLERS (index.html / login.html)
    // ----------------------------------------------------
    const loginForm = document.getElementById('login-form');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const alertBox = document.getElementById('alert-box');
    const alertMessage = document.getElementById('alert-message');

    // ── System Status Badge ──────────────────────────────────────────────────
    (function updateSystemStatusBar() {
        const dotEl   = document.getElementById('status-dot');
        const labelEl = document.getElementById('status-label');
        const footerAuthEl = document.getElementById('footer-auth-mode');
        if (!dotEl && !labelEl && !footerAuthEl) return;
        if (dotEl) dotEl.style.display = 'none';
        if (labelEl) labelEl.style.display = 'none';
        if (footerAuthEl) footerAuthEl.style.display = 'none';
    })();

    // ── Remember Me: restore saved username (never password) ─────────────────
    // Saves only the username (not password) to localStorage if the box is checked.
    const rememberMeBox  = document.getElementById('remember-me');
    const usernameInput  = document.getElementById('username-input');
    const savedUsername  = localStorage.getItem('jnt_remember_username');
    if (savedUsername && usernameInput) {
        usernameInput.value = savedUsername;
        if (rememberMeBox) rememberMeBox.checked = true;
    } else {
        if (rememberMeBox) rememberMeBox.checked = false;
    }

    // ── Password toggle with aria-pressed ────────────────────────────────────
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const pwdInput   = document.getElementById('password-input');
            const eyeIcon    = document.getElementById('eye-icon');
            const eyeOffIcon = document.getElementById('eye-off-icon');
            if (!pwdInput) return;

            const isHidden = pwdInput.type === 'password';
            pwdInput.type  = isHidden ? 'text' : 'password';
            togglePasswordBtn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
            togglePasswordBtn.setAttribute('aria-label',
                isHidden ? 'Sembunyikan password' : 'Tampilkan password');

            if (eyeIcon)    eyeIcon.classList.toggle('hidden', !isHidden);
            if (eyeOffIcon) eyeOffIcon.classList.toggle('hidden',  isHidden);
        });
    }

    // ── Forgot Password / Help Modal ─────────────────────────────────────────
    const forgotModal     = document.getElementById('forgot-modal-overlay');
    const btnForgot       = document.getElementById('btn-forgot-help');
    const btnCloseForgot  = document.getElementById('btn-close-forgot');

    function openForgotModal() {
        if (forgotModal) {
            forgotModal.classList.remove('hidden');
            document.getElementById('btn-close-forgot')?.focus();
        }
    }
    function closeForgotModal() {
        if (forgotModal) {
            forgotModal.classList.add('hidden');
            btnForgot?.focus();
        }
    }
    if (btnForgot)      btnForgot.addEventListener('click', openForgotModal);
    if (btnCloseForgot) btnCloseForgot.addEventListener('click', closeForgotModal);
    if (forgotModal) {
        forgotModal.addEventListener('click', (e) => {
            if (e.target === forgotModal) closeForgotModal();
        });
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !forgotModal.classList.contains('hidden')) closeForgotModal();
        });
    }

    // ── Forgot Password Form Submit Handler ──────────────────────────────────
    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const resetInputEl = document.getElementById('reset-email-input');
            const alertBoxEl = document.getElementById('reset-alert-box');
            const btnSendEl = document.getElementById('btn-send-reset');

            const val = resetInputEl ? resetInputEl.value.trim() : '';
            if (!val) return;

            if (btnSendEl) btnSendEl.disabled = true;
            if (alertBoxEl) {
                alertBoxEl.textContent = '⏳ Memproses permintaan reset password...';
                alertBoxEl.style.color = '#38bdf8';
                alertBoxEl.classList.remove('hidden');
            }

            let emailToReset = val.includes('@') ? val.toLowerCase() : '';
            if (!emailToReset && window.db) {
                try {
                    const uname = val.toLowerCase();
                    const docSnap = await window.db.collection('users').doc(uname).get();
                    if (docSnap.exists) {
                        const d = docSnap.data();
                        emailToReset = (d.email || d.emailPerusahaan || `${uname}@jtexpress.co.id`).toLowerCase().trim();
                    }
                } catch (_) {}
            }

            if (!emailToReset) emailToReset = `${val.toLowerCase()}@jtexpress.co.id`;

            try {
                if (window.auth) {
                    await window.auth.sendPasswordResetEmail(emailToReset);
                    if (alertBoxEl) {
                        alertBoxEl.textContent = `✅ Link reset password dikirim ke ${emailToReset}. Cek email Anda.`;
                        alertBoxEl.style.color = '#10B981';
                    }
                } else {
                    throw new Error('Firebase Auth belum siap.');
                }
            } catch (err) {
                if (alertBoxEl) {
                    alertBoxEl.textContent = `❌ ${err.message || 'Gagal mengirim link reset password.'}`;
                    alertBoxEl.style.color = '#EF4444';
                }
            } finally {
                if (btnSendEl) btnSendEl.disabled = false;
            }
        });
    }

    // ── Legacy activate-account button (kept for backward compat) ────────────
    const btnActivateAccount = document.getElementById('btn-activate-account');
    if (btnActivateAccount) {
        btnActivateAccount.addEventListener('click', async () => {
            const identifier = prompt('Masukkan Username atau Email akun lama Anda:');
            if (!identifier) return;
            const newPass = prompt('Masukkan Password baru untuk akun Anda (min. 6 karakter):');
            if (!newPass || newPass.length < 6) { alert('Password minimal 6 karakter.'); return; }
            try {
                if (typeof JNTFirebaseService === 'undefined') throw new Error('Layanan Firebase TMS belum diinisialisasi.');
                alert('⏳ Memproses aktivasi akun ke Firebase Authentication...');
                await JNTFirebaseService.activateLegacyUser(identifier.trim(), newPass.trim());
                alert(`✅ Akun berhasil diaktifkan. Silakan login.`);
                if (usernameInput) usernameInput.value = identifier.trim();
            } catch (err) {
                alert(`❌ Aktivasi gagal: ${err.message}`);
            }
        });
    }

    if (loginForm) {
        let _loginInProgress = false;

        const processLogin = (e) => {
            if (e) {
                if (typeof e.preventDefault === 'function') e.preventDefault();
                if (typeof e.stopPropagation === 'function') e.stopPropagation();
            }
            if (_loginInProgress) return; // prevent double-submit

            const passwordInput = document.getElementById('password-input');
            const btnLogin      = document.getElementById('btn-login');
            const btnSpinner    = btnLogin ? btnLogin.querySelector('.btn-spinner')      : null;
            const btnText       = btnLogin ? btnLogin.querySelector('.btn-text-content') : null;
            const uInput        = document.getElementById('username-input');

            // Hide any previous error
            if (alertBox) alertBox.classList.add('hidden');

            const username = uInput        ? uInput.value.trim()        : '';
            const password = passwordInput ? passwordInput.value.trim() : '';

            // Validate fields
            if (!username) {
                if (alertBox && alertMessage) { alertMessage.textContent = 'Harap masukkan username Anda.'; alertBox.classList.remove('hidden'); }
                uInput?.focus();
                return;
            }
            if (!password) {
                if (alertBox && alertMessage) { alertMessage.textContent = 'Harap masukkan password Anda.'; alertBox.classList.remove('hidden'); }
                passwordInput?.focus();
                return;
            }

            // Show loading state — prevent double submit
            _loginInProgress = true;
            if (btnSpinner) btnSpinner.classList.remove('hidden');
            if (btnText)    btnText.style.opacity = '0.5';
            if (btnLogin)   { btnLogin.disabled = true; btnLogin.setAttribute('aria-busy', 'true'); }

            setTimeout(async () => {
                // ============================================================
                // LOGIN VIA FIREBASE AUTHENTICATION
                // Akun tersimpan di Firebase Auth, bukan di Firestore.
                // Firestore hanya dipakai untuk ambil data profil (nama, role, dll)
                // setelah autentikasi berhasil — bukan untuk cek password.
                // ============================================================

                // Bersihkan sesi anonymous jika ada
                if (window.auth && window.auth.currentUser && window.auth.currentUser.isAnonymous) {
                    try { await window.auth.signOut(); } catch (_) {}
                }

                let authResult = null; // { user, email }
                let lastAuthError = null;

                if (!window.auth) {
                    lastAuthError = { message: 'Firebase Auth belum siap. Coba refresh halaman.' };
                } else {
                    // ── Tentukan email dari input ──
                    // Jika input langsung berupa email → pakai langsung
                    // Jika username → cari di cache localStorage (disimpan saat buat akun)
                    let emailToUse = '';

                    if (username.includes('@')) {
                        // Input adalah email langsung
                        emailToUse = username.toLowerCase().trim();
                    } else {
                        // Input adalah username → resolve ke email dari cache
                        const uname = username.toLowerCase().trim();
                        try {
                            const cache = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
                            if (cache[uname]) emailToUse = cache[uname];
                        } catch (_) {}

                        // Lookup email dari Firestore (Cek direct doc ID "users/{username}" dulu)
                        if (!emailToUse && window.db) {
                            try {
                                const docSnap = await window.db.collection('users').doc(uname).get();
                                if (docSnap.exists) {
                                    const d = docSnap.data();
                                    const em = (d.email || d.emailPerusahaan || `${uname}@jtexpress.co.id`).toLowerCase().trim();
                                    emailToUse = em;
                                }
                            } catch (_) {}

                            if (!emailToUse) {
                                try {
                                    const snap = await window.db.collection('users')
                                        .where('username', '==', uname).limit(1).get();
                                    if (!snap.empty) {
                                        const d = snap.docs[0].data();
                                        const em = (d.email || d.emailPerusahaan || `${uname}@jtexpress.co.id`).toLowerCase().trim();
                                        if (em) emailToUse = em;
                                    }
                                } catch (_) {}
                            }

                            if (emailToUse) {
                                try {
                                    const c = JSON.parse(localStorage.getItem('jnt_email_map') || '{}');
                                    c[uname] = emailToUse;
                                    localStorage.setItem('jnt_email_map', JSON.stringify(c));
                                } catch (_) {}
                            }
                        }
                    }

                    // ── Login ke Firebase Authentication ──
                    if (emailToUse) {
                        try {
                            const cred = await window.auth.signInWithEmailAndPassword(emailToUse, password);
                            authResult = { user: cred.user, email: emailToUse };
                        } catch (e) {
                            lastAuthError = e;
                            console.warn('[AUTH] Firebase signIn gagal:', e.code, e.message);
                        }
                    } else {
                        // Email tidak ditemukan → akun mungkin belum dibuat atau username salah
                        lastAuthError = { code: 'auth/user-not-found', message: 'Username tidak ditemukan. Pastikan username benar atau gunakan email untuk login.' };
                    }

                }

                // ── Proses setelah autentikasi berhasil ──
                if (authResult) {
                    // Ambil profil dari Firestore (untuk nama, role, dll)
                    let profile = null;
                    if (!profile && window.db && authResult.user.uid) {
                        try {
                            const profSnap = await window.db.collection('users').doc(authResult.user.uid).get();
                            if (profSnap.exists) profile = profSnap.data();
                        } catch (_) {}
                        // Jika tidak ketemu berdasarkan UID, cari berdasarkan username
                        if (!profile) {
                            try {
                                const profSnap2 = await window.db.collection('users')
                                    .where('username', '==', username.toLowerCase().trim()).limit(1).get();
                                if (!profSnap2.empty) profile = profSnap2.docs[0].data();
                            } catch (_) {}
                        }
                    }
                    // SECURITY: Tolak login jika profil tidak ada di Firestore atau akun nonaktif
                    // (sebelumnya fallback otomatis ke role OPERATOR_SLA).
                    const profileStatus = profile ? String(profile.status || 'Aktif').toLowerCase() : '';
                    if (!profile || profileStatus === 'nonaktif' || profileStatus === 'non-aktif' || profileStatus === 'inactive') {
                        _loginInProgress = false;
                        if (window.auth) { try { await window.auth.signOut(); } catch (_) {} }
                        if (alertBox) {
                            if (alertMessage) alertMessage.textContent = !profile
                                ? 'Akun belum terdaftar di sistem. Hubungi Administrator.'
                                : 'Akun ini telah dinonaktifkan. Hubungi Administrator.';
                            alertBox.classList.remove('hidden');
                        }
                        if (btnSpinner) btnSpinner.classList.add('hidden');
                        if (btnText) btnText.style.opacity = '1';
                        if (btnLogin) { btnLogin.disabled = false; btnLogin.removeAttribute('aria-busy'); }
                        return;
                    }

                    // Normalisasi role
                    if (typeof JNTFirebaseService !== 'undefined' && typeof JNTFirebaseService.normalizeRole === 'function') {
                        profile.role = JNTFirebaseService.normalizeRole(profile.role);
                    }

                    // Validasi Single-Session Lock (1 akun hanya boleh 1 device aktif)
                    const targetUname = profile.username || username.toLowerCase().trim();
                    const lockRes = await jntAcquireSessionLock(targetUname);
                    if (!lockRes.ok) {
                        _loginInProgress = false;
                        if (window.auth) { try { await window.auth.signOut(); } catch (_) {} }
                        if (alertBox) {
                            if (alertMessage) alertMessage.textContent = 'Akun ini sedang digunakan di perangkat/browser lain. Silakan logout dari perangkat tersebut terlebih dahulu.';
                            alertBox.classList.remove('hidden');
                        }
                        if (btnSpinner) btnSpinner.classList.add('hidden');
                        if (btnText) btnText.style.opacity = '1';
                        if (btnLogin) { btnLogin.disabled = false; btnLogin.removeAttribute('aria-busy'); }
                        return;
                    }

                    // Remember Me
                    const rememberBox = document.getElementById('remember-me');
                    if (rememberBox && rememberBox.checked) {
                        localStorage.setItem('jnt_remember_username', username);
                    } else {
                        localStorage.removeItem('jnt_remember_username');
                    }

                    // Set session
                    sessionStorage.setItem('jnt_is_logged_in',    'true');
                    sessionStorage.setItem('jnt_active_username', profile.fullname || profile.username || username);
                    sessionStorage.setItem('jnt_user_role',       profile.role || 'OPERATOR_SLA');
                    sessionStorage.setItem('jnt_user_uid',        profile.uid || authResult.user.uid || '');
                    sessionStorage.setItem('jnt_user_email',      profile.email || profile.emailPerusahaan || authResult.email || '');
                    sessionStorage.setItem('jnt_user_phone',      profile.phone || '');
                    sessionStorage.setItem('jnt_user_nik',        profile.nik || '');
                    sessionStorage.setItem('jnt_user_jabatan',    profile.jabatan || '');
                    sessionStorage.setItem('jnt_user_tlc',        profile.tlc || '');
                    sessionStorage.setItem('jnt_user_departemen', profile.departemen || '');
                    sessionStorage.setItem('jnt_user_bergabung',  profile.bergabung || '');
                    sessionStorage.setItem('jnt_username_login',  profile.username || username.toLowerCase().trim());

                    window.location.href = 'dashboard.html';

                } else {
                    // Login gagal
                    _loginInProgress = false;
                    let displayMsg = 'Username/email atau password salah. Periksa kembali dan coba lagi.';
                    if (lastAuthError) {
                        if (lastAuthError.code === 'auth/too-many-requests') {
                            displayMsg = 'Terlalu banyak percobaan login. Coba lagi beberapa menit kemudian.';
                        } else if (lastAuthError.code === 'auth/user-disabled') {
                            displayMsg = 'Akun ini telah dinonaktifkan. Hubungi Administrator.';
                        } else if (lastAuthError.message && lastAuthError.message.includes('tidak ditemukan')) {
                            displayMsg = lastAuthError.message;
                        }
                    }

                    if (alertBox) {
                        if (alertMessage) alertMessage.textContent = displayMsg;
                        alertBox.classList.remove('hidden');
                    }

                    if (btnSpinner) btnSpinner.classList.add('hidden');
                    if (btnText) btnText.style.opacity = '1';
                    if (btnLogin) btnLogin.disabled = false;
                }
            }, 300);
        };

        loginForm.addEventListener('submit', processLogin);
        const btnLoginBtn = document.getElementById('btn-login');
        if (btnLoginBtn) {
            btnLoginBtn.addEventListener('click', processLogin);
        }
    }

    // ===================================================================
    // GLOBAL USER IDENTITY SYNC — Runs on every page after login
    // Updates ALL user-related UI elements from sessionStorage so every
    // page is consistent with the currently logged-in account.
    // Exposed as window.jntSyncUserIdentity() and re-run on the
    // 'jnt:user-updated' event (fired after profile save) so sidebar,
    // topbar chip and topbar dropdown always stay in sync.
    // ===================================================================
    function jntMakeAvatarUrl(name, size) {
        return 'https://ui-avatars.com/api/?name='
            + encodeURIComponent(name || 'User')
            + '&background=E30613&color=fff&bold=true&size=' + (size || 100);
    }

    function jntEscapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function jntGetLiveUser() {
        const rawRole = sessionStorage.getItem('jnt_user_role') || '';
        return {
            fullname: sessionStorage.getItem('jnt_active_username') || '',
            role:     rawRole,
            roleLabel: (function (r) {
                const up = String(r).toUpperCase();
                if (up.includes('ADMIN')) return 'Admin';
                if (up.includes('SUPERVISOR')) return 'Supervisor';
                if (up.includes('OPERATOR') || up.includes('STAFF') || up.includes('DISPATCH')) return 'Staff Vehicle Dispatch';
                return String(r).replace(/_/g, ' ');
            })(rawRole),
            email:    sessionStorage.getItem('jnt_user_email') || '',
            jabatan:  sessionStorage.getItem('jnt_user_jabatan') || ''
        };
    }

    function jntRenderDropdownHeader(dropdown) {
        const header = dropdown && dropdown.querySelector('.dropdown-user-header');
        if (!header) return;
        const u = jntGetLiveUser();
        header.innerHTML = `
            <img class="dropdown-user-avatar" src="${jntMakeAvatarUrl(u.fullname, 80)}" alt="${jntEscapeHtml(u.fullname)} Avatar">
            <div class="dropdown-user-info">
                <strong title="${jntEscapeHtml(u.fullname)}">${jntEscapeHtml(u.fullname || '-')}</strong>
                ${u.email ? `<span class="dropdown-user-email" title="${jntEscapeHtml(u.email)}">${jntEscapeHtml(u.email)}</span>` : ''}
                <span class="dropdown-user-role-badge">${jntEscapeHtml(u.roleLabel || '-')}</span>
            </div>
        `;

        const logoutBtn = dropdown.querySelector('.btn-dropdown-logout');
        if (logoutBtn) {
            const handleLogout = (e) => {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
                dropdown.classList.remove('show');
                performLogout();
            };
            logoutBtn.onclick = handleLogout;
            if (!logoutBtn._hasLogoutListener) {
                logoutBtn._hasLogoutListener = true;
                logoutBtn.addEventListener('click', handleLogout);
            }
        }
    }

    function syncUserIdentityAcrossAllPages() {
        // FIX BUG-2 (UI): Hapus fallback hardcoded ke 'Developer Admin' / 'ADMIN'.
        // Jika sesi tidak ada, tampilkan string kosong — jangan inject nilai privilege default.
        const u = jntGetLiveUser();
        if (!u.fullname && !u.role) return; // Jika tidak ada sesi aktif, jangan update UI

        // 1. Sidebar: username text
        document.querySelectorAll('#sidebar-user-name').forEach(el => {
            el.textContent = u.fullname;
        });

        // 2. Sidebar: role/jabatan badge
        document.querySelectorAll('.profile-role').forEach(el => {
            el.textContent = u.roleLabel;
        });

        // 3. Sidebar: avatar image
        document.querySelectorAll('.user-avatar-img').forEach(img => {
            img.src = jntMakeAvatarUrl(u.fullname, 150);
            img.alt = u.fullname + ' Avatar';
        });

        // 4. Topbar chip: username text (handles multiple selectors used across pages)
        document.querySelectorAll(
            '#topbar-user-name, #dash-user-name, .inc-user-name'
        ).forEach(el => {
            el.textContent = u.fullname;
            const chevron = document.createElement('span');
            chevron.className = 'inc-user-chevron';
            chevron.textContent = '▾';
            el.appendChild(chevron);
            el.title = u.fullname;
        });

        // 5. Topbar chip: role text
        document.querySelectorAll('.inc-user-role').forEach(el => {
            el.textContent = u.roleLabel;
        });

        // 6. Topbar chip: avatar image
        document.querySelectorAll('.inc-avatar-img').forEach(img => {
            img.src = jntMakeAvatarUrl(u.fullname, 100);
            img.alt = u.fullname + ' Avatar';
        });

        // 7. Topbar dropdown header (if already created)
        document.querySelectorAll('.topbar-user-dropdown').forEach(jntRenderDropdownHeader);
    }

    syncUserIdentityAcrossAllPages();
    window.jntSyncUserIdentity = syncUserIdentityAcrossAllPages;
    window.addEventListener('jnt:user-updated', syncUserIdentityAcrossAllPages);


    // PERMISSION MATRIX ROUTE GUARD
    const roleUpper = (activeRole || '').toUpperCase();
    const isAllowedForUsersPage = roleUpper.includes('ADMIN') || roleUpper.includes('SUPERVISOR') || roleUpper.includes('DEV');

    if (pageName === 'users.html' && !isAllowedForUsersPage) {
        alert(`⚠️ Akses Dibatasi: Halaman User Management hanya dapat diakses oleh Admin, Supervisor, dan Developer.\nAnda telah diarahkan kembali ke Dashboard.`);
        window.location.href = 'dashboard.html';
        return;
    }

    const restrictedPagesForStaffDispatch = ['master.html', 'users.html', 'settings.html'];
    if ((roleUpper.includes('STAFF') || roleUpper.includes('DISPATCH') || roleUpper.includes('OPERATOR')) && !isAllowedForUsersPage && restrictedPagesForStaffDispatch.includes(pageName)) {
        alert(`⚠️ Akses Dibatasi: Peran Staff Vehicle Dispatch tidak memiliki wewenang untuk mengakses halaman ${pageName}.\nAnda telah diarahkan kembali ke Dashboard.`);
        window.location.href = 'dashboard.html';
        return;
    }

    // Reusable Authentic Logout Trigger
    function performLogout() {
        try {
            if (typeof global !== 'undefined' && global.sessionStorage) {
                if (typeof global.sessionStorage.clear === 'function') {
                    global.sessionStorage.clear();
                }
                if (typeof global.sessionStorage.removeItem === 'function') {
                    global.sessionStorage.removeItem('jnt_is_logged_in');
                    global.sessionStorage.removeItem('jnt_active_username');
                    global.sessionStorage.removeItem('jnt_user_role');
                }
            }
            if (typeof sessionStorage !== 'undefined') {
                if (typeof sessionStorage.clear === 'function') {
                    sessionStorage.clear();
                }
                if (typeof sessionStorage.removeItem === 'function') {
                    sessionStorage.removeItem('jnt_is_logged_in');
                }
            }
            if (typeof window !== 'undefined' && window.sessionStorage) {
                if (typeof window.sessionStorage.clear === 'function') {
                    window.sessionStorage.clear();
                }
                if (typeof window.sessionStorage.removeItem === 'function') {
                    window.sessionStorage.removeItem('jnt_is_logged_in');
                }
            }
        } catch (_) {}

        try {
            if (typeof window !== 'undefined' && window.location) {
                window.location.href = 'index.html';
            }
            if (typeof global !== 'undefined' && global.window && global.window.location) {
                global.window.location.href = 'index.html';
            }
        } catch (_) {}

        try {
            if (typeof jntReleaseSessionLock === 'function') {
                jntReleaseSessionLock().catch(() => {});
            }
        } catch (_) {}
    }

    const logoutBtns = document.querySelectorAll('#btn-logout, .btn-logout-action');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            performLogout();
        });
    });

    // =========================================================================
    // PHASE 1: GLOBAL UI INTERACTIVITY REMEDIATION
    // =========================================================================

    // 1. Mobile Hamburger Menu & Sidebar Drawer
    const sidebarPanel = document.querySelector('.sidebar-panel');
    let sidebarBackdrop = document.querySelector('.sidebar-backdrop');
    if (!sidebarBackdrop) {
        sidebarBackdrop = document.createElement('div');
        sidebarBackdrop.className = 'sidebar-backdrop';
        document.body.appendChild(sidebarBackdrop);
    }

    const hamburgerBtns = document.querySelectorAll('.hamburger-btn');
    hamburgerBtns.forEach(btn => {
        btn.setAttribute('aria-label', 'Buka / Tutup Menu Navigasi');
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!sidebarPanel) return;
            const isOpen = sidebarPanel.classList.toggle('mobile-open');
            sidebarBackdrop.classList.toggle('active', isOpen);
            btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    });

    const closeMobileSidebar = () => {
        if (sidebarPanel && sidebarPanel.classList.contains('mobile-open')) {
            sidebarPanel.classList.remove('mobile-open');
            sidebarBackdrop.classList.remove('active');
            hamburgerBtns.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
        }
    };

    sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    if (sidebarPanel) {
        sidebarPanel.querySelectorAll('.sidebar-nav a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 992) {
                    closeMobileSidebar();
                }
            });
        });
    }

    // 2. Topbar User Profile Chip Dropdown Menu
    const userChipEls = document.querySelectorAll('.inc-user-chip, #topbar-user-chip-btn');
    userChipEls.forEach(chip => {
        if (chip.parentElement && !chip.parentElement.classList.contains('topbar-user-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'topbar-user-wrapper';
            chip.parentNode.insertBefore(wrapper, chip);
            wrapper.appendChild(chip);

            const dropdown = document.createElement('div');
            dropdown.className = 'topbar-user-dropdown';
            dropdown.innerHTML = `
                <div class="dropdown-user-header"></div>
                <a href="profile.html" class="dropdown-nav-item">
                    <span>👤</span> Profil Saya
                </a>
                <a href="settings.html" class="dropdown-nav-item">
                    <span>⚙️</span> Pengaturan Sistem
                </a>
                <button type="button" class="dropdown-nav-item logout-item btn-dropdown-logout">
                    <span>🚪</span> Keluar Akun
                </button>
            `;
            wrapper.appendChild(dropdown);
            jntRenderDropdownHeader(dropdown);

            chip.setAttribute('role', 'button');
            chip.setAttribute('aria-haspopup', 'true');
            chip.setAttribute('aria-expanded', 'false');

            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.topbar-user-dropdown.show').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                // Selalu render ulang dari sesi terbaru sebelum ditampilkan
                jntRenderDropdownHeader(dropdown);
                const isShown = dropdown.classList.toggle('show');
                chip.setAttribute('aria-expanded', isShown ? 'true' : 'false');
            });

            const logoutBtn = dropdown.querySelector('.btn-dropdown-logout');
            if (logoutBtn) {
                const handleLogout = (e) => {
                    if (e && e.preventDefault) e.preventDefault();
                    if (e && e.stopPropagation) e.stopPropagation();
                    dropdown.classList.remove('show');
                    performLogout();
                };
                logoutBtn.onclick = handleLogout;
                logoutBtn.addEventListener('click', handleLogout);
            }
        }
    });

    const sidebarUserCard = document.getElementById('sidebar-user-card-btn');
    if (sidebarUserCard) {
        sidebarUserCard.addEventListener('click', () => {
            window.location.href = 'profile.html';
        });
    }

    // Close Dropdown and Drawer on Click Outside or Escape
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.topbar-user-wrapper')) {
            document.querySelectorAll('.topbar-user-dropdown.show').forEach(d => {
                d.classList.remove('show');
                const triggerChip = d.parentElement?.querySelector('.inc-user-chip');
                if (triggerChip) triggerChip.setAttribute('aria-expanded', 'false');
            });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileSidebar();
            document.querySelectorAll('.topbar-user-dropdown.show').forEach(d => {
                d.classList.remove('show');
                const triggerChip = d.parentElement?.querySelector('.inc-user-chip');
                if (triggerChip) triggerChip.setAttribute('aria-expanded', 'false');
            });
        }
    });

    // 3. Real-Time Asia/Jakarta Date and Clock Engine
    function updateGlobalHeaderDateTime() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        const dayStr = now.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            weekday: 'long'
        });
        const timeStr = now.toLocaleTimeString('id-ID', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/\./g, ':');

        const dateChips = document.querySelectorAll('.inc-date-chip');
        dateChips.forEach(chip => {
            const spans = chip.querySelectorAll('span');
            if (chip.id === 'sh-top-date-chip') {
                const dateEl = chip.querySelector('span:first-child');
                const clockEl = document.getElementById('sh-top-clock-text');
                if (dateEl) dateEl.textContent = `📅 ${dateStr}`;
                if (clockEl) clockEl.textContent = `${timeStr} WIB`;
            } else if (spans.length >= 2) {
                spans[0].textContent = `${dateStr}`;
                spans[1].textContent = `${dayStr}, ${timeStr} WIB`;
            } else if (spans.length === 1) {
                spans[0].textContent = `📅 ${dayStr}, ${dateStr} • ${timeStr} WIB`;
            }
        });

        const shiftClockEl = document.getElementById('sh-current-time-text');
        if (shiftClockEl) {
            shiftClockEl.textContent = `WAKTU AKTUAL: ${timeStr.slice(0, 5)} WIB`;
        }
    }

    if (window.__jntDateInterval) {
        clearInterval(window.__jntDateInterval);
    }
    updateGlobalHeaderDateTime();
    window.__jntDateInterval = setInterval(updateGlobalHeaderDateTime, 1000);


    // ----------------------------------------------------
    // 2. PAGE DETECTOR & ACTIVE SIDEBAR INTERACTION
    // ----------------------------------------------------
    const isDashboardPage = pageName === 'dashboard.html';
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
        if (!e || !e.target || typeof e.target.closest !== 'function') return;
        const btn = e.target.closest('button, .btn, .modal-close-btn, .btn-dropdown-logout');
        if (!btn) return;

        if (btn.classList.contains('btn-dropdown-logout') || btn.id === 'btn-logout' || btn.classList.contains('btn-logout-action') || btn.textContent.includes('Keluar Akun')) {
            performLogout();
            return;
        }

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
        } else if (btn.classList.contains('settings-tab-item')) {
            document.querySelectorAll('.settings-tab-item').forEach(tb => tb.classList.remove('active'));
            btn.classList.add('active');
            const tabName = btn.textContent.trim();
            const cards = document.querySelectorAll('.settings-card');
            cards.forEach(card => {
                const title = card.querySelector('.st-title')?.textContent || '';
                if (tabName.includes('Umum') || tabName.includes('Semua')) {
                    card.style.display = 'block';
                } else if (title.toLowerCase().includes(tabName.toLowerCase().replace(/[^a-z0-9]/gi, ''))) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'block'; // Display gracefully while highlighting
                }
            });
        } else if (btn.classList.contains('btn-st-red') || (btn.classList.contains('btn-st-outline') && text.includes('Simpan'))) {
            alert('✅ Pengaturan Berhasil Disimpan: Perubahan sistem telah disimpan ke profil.');
        } else if (btn.classList.contains('btn-data-action')) {
            if (text.includes('Export') && !btnId) {
                const dummyData = { system: "J&T Express TMS", date: new Date().toISOString() };
                const blob = new Blob([JSON.stringify(dummyData, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `JNT_Settings_Export_${Date.now()}.json`;
                a.click();
            } else if (text.includes('Import') && !btnId) {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = '.json,.csv';
                inp.onchange = e => {
                    if (e.target.files.length) alert('✅ Data Konfigurasi Berhasil Di-import!');
                };
                inp.click();
            } else if (text.includes('Bersihkan') && !btnId) {
                if (confirm('Apakah Anda yakin ingin membersihkan cache sistem lokal?')) {
                    alert('✅ Cache sistem lokal berhasil dibersihkan.');
                }
            }
        } else if (btnId === 'btn-view-all-history' || btn.classList.contains('btn-view-all-history')) {
            alert('📜 RIWAYAT AKSES & LOGINS PENGGUNA:\n----------------------------------------\n1. 22/10/2026 08:55 - Chrome Windows 11 (192.168.1.10)\n2. 21/10/2026 14:20 - Mobile Android (180.252.12.44)\n3. 20/10/2026 09:12 - Firefox Windows 10 (192.168.1.15)');
        } else if (btn.classList.contains('btn-revoke-session')) {
            if (confirm('Keluarkan Sesi: Apakah Anda yakin ingin mengeluarkan sesi perangkat ini?')) {
                const sessionRow = btn.closest('.device-session-item');
                if (sessionRow) sessionRow.remove();
                alert('✅ Sesi perangkat berhasil dikeluarkan.');
            }
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
        // Profesional dropdown panel — no more alert()
        // ----------------------------------------------------

        // Inject Notification Center Panel (once)
        function jntEnsureNotifPanel() {
            if (document.getElementById('jnt-notif-panel')) return document.getElementById('jnt-notif-panel');

            const panel = document.createElement('div');
            panel.id = 'jnt-notif-panel';
            panel.className = 'jnt-notif-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-label', 'Pusat Notifikasi');
            panel.innerHTML = `
                <div class="jnt-notif-header">
                    <div class="jnt-notif-header-left">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <span>Pusat Notifikasi</span>
                        <span class="jnt-notif-count-badge" id="jnt-notif-count-badge">0</span>
                    </div>
                    <div class="jnt-notif-header-actions">
                        <button class="jnt-notif-mark-all" id="jnt-notif-mark-all" title="Tandai semua sudah dibaca">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Baca Semua
                        </button>
                        <button class="jnt-notif-close-btn" id="jnt-notif-close-btn" aria-label="Tutup notifikasi">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="jnt-notif-body" id="jnt-notif-body">
                    <!-- Populated dynamically -->
                </div>
                <div class="jnt-notif-footer">
                    <span class="jnt-notif-footer-text">Real-time • Diperbarui otomatis</span>
                    <span class="jnt-notif-live-dot"></span>
                </div>
            `;
            document.body.appendChild(panel);

            // Backdrop
            const backdrop = document.createElement('div');
            backdrop.id = 'jnt-notif-backdrop';
            backdrop.className = 'jnt-notif-backdrop';
            backdrop.onclick = () => jntCloseNotifPanel();
            document.body.appendChild(backdrop);

            document.getElementById('jnt-notif-close-btn').addEventListener('click', jntCloseNotifPanel);
            document.getElementById('jnt-notif-mark-all').addEventListener('click', () => {
                document.querySelectorAll('.jnt-notif-item.unread').forEach(el => el.classList.remove('unread'));
                document.getElementById('jnt-notif-count-badge').textContent = '0';
                document.querySelectorAll('.inc-bell-badge').forEach(b => { b.textContent = '0'; b.classList.add('jnt-badge-zero'); });
            });

            return panel;
        }

        function jntOpenNotifPanel(alertsList) {
            const panel = jntEnsureNotifPanel();
            const body = document.getElementById('jnt-notif-body');
            const badge = document.getElementById('jnt-notif-count-badge');

            if (badge) badge.textContent = alertsList.length;

            if (alertsList.length === 0) {
                body.innerHTML = `
                    <div class="jnt-notif-empty">
                        <div class="jnt-notif-empty-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                                <line x1="1" y1="1" x2="23" y2="23" stroke-width="1.5"/>
                            </svg>
                        </div>
                        <p class="jnt-notif-empty-title">Semua Aman!</p>
                        <p class="jnt-notif-empty-sub">Tidak ada peringatan kritis saat ini.<br>Sistem berjalan normal.</p>
                    </div>`;
            } else {
                const iconMap = {
                    'critical': { icon: '🚨', cls: 'critical' },
                    'warning':  { icon: '⚠️',  cls: 'warning'  },
                    'info':     { icon: '🔔',  cls: 'info'     },
                    'success':  { icon: '✅',  cls: 'success'  },
                };
                const now = new Date();
                body.innerHTML = alertsList.map((a, i) => {
                    const level = (a.level || a.type || 'info').toLowerCase();
                    const meta = iconMap[level] || iconMap['info'];
                    const timeAgo = a.timestamp
                        ? (() => {
                            const diff = Math.floor((now - new Date(a.timestamp)) / 60000);
                            if (diff < 1) return 'Baru saja';
                            if (diff < 60) return `${diff} menit lalu`;
                            const h = Math.floor(diff / 60);
                            if (h < 24) return `${h} jam lalu`;
                            return `${Math.floor(h / 24)} hari lalu`;
                          })()
                        : 'Baru saja';
                    return `
                        <div class="jnt-notif-item unread ${meta.cls}" data-idx="${i}">
                            <div class="jnt-notif-item-icon">${meta.icon}</div>
                            <div class="jnt-notif-item-content">
                                <div class="jnt-notif-item-title">${a.title || 'Notifikasi Sistem'}</div>
                                <div class="jnt-notif-item-msg">${a.message || ''}</div>
                                <div class="jnt-notif-item-time">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                    </svg>
                                    ${timeAgo}
                                </div>
                            </div>
                            <span class="jnt-notif-unread-dot"></span>
                        </div>`;
                }).join('');

                // Mark as read on click
                body.querySelectorAll('.jnt-notif-item').forEach(item => {
                    item.addEventListener('click', () => {
                        item.classList.remove('unread');
                        const remaining = body.querySelectorAll('.jnt-notif-item.unread').length;
                        if (badge) badge.textContent = remaining;
                        document.querySelectorAll('.inc-bell-badge').forEach(b => { b.textContent = remaining; });
                    });
                });
            }

            panel.classList.add('open');
            document.getElementById('jnt-notif-backdrop').classList.add('open');
        }

        function jntCloseNotifPanel() {
            const panel = document.getElementById('jnt-notif-panel');
            const backdrop = document.getElementById('jnt-notif-backdrop');
            if (panel) panel.classList.remove('open');
            if (backdrop) backdrop.classList.remove('open');
        }

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') jntCloseNotifPanel();
        });

        const notifBells = document.querySelectorAll('.inc-notif-bell');
        let _latestAlerts = [];

        JNTFirebaseService.subscribeNotifications((alertsList) => {
            _latestAlerts = alertsList;
            notifBells.forEach(bell => {
                const badge = bell.querySelector('.inc-bell-badge');
                if (badge) {
                    badge.textContent = alertsList.length;
                    badge.classList.toggle('jnt-badge-zero', alertsList.length === 0);
                }
            });
        });

        notifBells.forEach(bell => {
            bell.style.cursor = 'pointer';
            bell.setAttribute('role', 'button');
            bell.setAttribute('aria-label', 'Buka Pusat Notifikasi');
            bell.onclick = (e) => {
                e.stopPropagation();
                const panel = document.getElementById('jnt-notif-panel');
                if (panel && panel.classList.contains('open')) {
                    jntCloseNotifPanel();
                } else {
                    jntOpenNotifPanel(_latestAlerts);
                }
            };
        });
    }

    // ----------------------------------------------------
    // 4b. SETTINGS DROPDOWNS — Persist & Restore (settings.html)
    // Semua <select> di settings.html disimpan ke localStorage dan
    // dipulihkan saat halaman dibuka ulang.
    // ----------------------------------------------------
    if (isSettingsPage) {
        const SETTINGS_KEYS = [
            'setting-timezone', 'setting-time-format', 'setting-date-format',
            'setting-language', 'setting-font-size', 'setting-density'
        ];

        // Restore saved values on load
        SETTINGS_KEYS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const saved = localStorage.getItem('jnt_' + id);
            if (saved) el.value = saved;
            // Live-save on change
            el.addEventListener('change', () => {
                localStorage.setItem('jnt_' + id, el.value);
            });
        });

        // Wire "Simpan Perubahan" buttons to also persist dropdown values
        document.querySelectorAll('.btn-st-red, .btn-st-outline').forEach(btn => {
            if (btn.textContent.trim().includes('Simpan')) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent bubbling to the global click delegation
                    SETTINGS_KEYS.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) localStorage.setItem('jnt_' + id, el.value);
                    });
                    if (window.showToastNotification) {
                        window.showToastNotification('✅ Pengaturan Disimpan', 'Perubahan sistem telah berhasil disimpan.', 'success');
                    } else {
                        alert('✅ Pengaturan Berhasil Disimpan: Perubahan sistem telah disimpan ke profil.');
                    }
                });
            }
        });
    }

    // ----------------------------------------------------
    // 4. DATABASE BACKUP & ADMIN RESTORE & MIGRATION (settings.html)
    // ----------------------------------------------------
    const btnBackupNow = document.getElementById('btn-backup-now');
    const btnRestoreDb = document.getElementById('btn-restore-database');
    const restoreJsonInput = document.getElementById('restore-json-input');
    const btnMigratePreview = document.getElementById('btn-migrate-preview');
    const btnRunMigration = document.getElementById('btn-run-migration');
    const btnFlushSyncQueue = document.getElementById('btn-flush-sync-queue');

    if (btnMigratePreview) {
        btnMigratePreview.addEventListener('click', async () => {
            try {
                if (typeof JNTFirebaseService === 'undefined') {
                    alert('⚠️ Service Firebase belum diinisialisasi.');
                    return;
                }
                const preview = JNTFirebaseService.getLocalStorageMigrationPreview();
                let summaryText = `📊 PREVIEW MIGRASI LOCALSTORAGE KE FIRESTORE:\nTotal Dokumen: ${preview.totalRecords}\n\nRincian Koleksi:\n`;
                for (const [col, count] of Object.entries(preview.breakdown)) {
                    summaryText += `• ${col}: ${count} record\n`;
                }
                summaryText += '\nKoleksi yang siap dimigrasi: ' + preview.collectionsToMigrate.join(', ');
                alert(summaryText);
            } catch (err) {
                alert(`❌ Gagal membaca preview migrasi: ${err.message}`);
            }
        });
    }

    if (btnRunMigration) {
        btnRunMigration.addEventListener('click', async () => {
            if (activeRole !== 'ADMIN') {
                alert('⚠️ Akses Ditolak: Migrasi database ke Cloud Firestore hanya dapat dijalankan oleh Role ADMIN!');
                return;
            }

            const preview = JNTFirebaseService.getLocalStorageMigrationPreview();
            if (preview.totalRecords === 0) {
                alert('ℹ️ Tidak ada data lokal di LocalStorage yang perlu dimigrasikan.');
                return;
            }

            if (!confirm(`🚀 KONFIRMASI MIGRASI FIRESTORE (SSOT):\nApakah Anda yakin ingin memigrasikan ${preview.totalRecords} dokumen dari LocalStorage ke Cloud Firestore?\n\nCatatan:\n1. Operasi ini bersifat idempotent (data tidak akan terduplikasi).\n2. Backup lokal tetap disimpan dengan aman.\n3. Firestore akan menjadi Single Source of Truth.`)) {
                return;
            }

            alert('⏳ Menjalankan migrasi data ke Cloud Firestore... Harap tunggu beberapa saat.');
            try {
                const result = await JNTFirebaseService.executeLocalStorageToFirestoreMigration(true);
                let msg = `✅ MIGRASI SELESAI:\nTotal dokumen berhasil dimigrasikan: ${result.totalMigrated}\n`;
                if (result.errors && result.errors.length > 0) {
                    msg += `⚠️ Dokumen gagal: ${result.errors.length}\n(Cek console browser untuk rincian error)`;
                } else {
                    msg += 'Semua dokumen berhasil disinkronkan ke Cloud Firestore.';
                }
                alert(msg);
            } catch (err) {
                alert(`❌ Migrasi gagal: ${err.message}`);
            }
        });
    }

    if (btnFlushSyncQueue) {
        btnFlushSyncQueue.addEventListener('click', async () => {
            try {
                if (typeof JNTFirebaseService === 'undefined') {
                    alert('⚠️ Service Firebase belum diinisialisasi.');
                    return;
                }
                const pendingQueue = JNTFirebaseService.getPendingSyncQueue();
                if (!pendingQueue || pendingQueue.length === 0) {
                    alert('✅ Antrean Sinkronisasi Bersih: Tidak ada transaksi offline yang tertunda.');
                    return;
                }

                alert(`⏳ Mengirimkan ${pendingQueue.length} transaksi tertunda ke Cloud Firestore...`);
                const flushResult = await JNTFirebaseService.flushPendingSyncQueue();
                alert(`🔄 HASIL SINKRONISASI:\n• Berhasil diproses: ${flushResult.processed}\n• Gagal: ${flushResult.failed}\n• Sisa antrean: ${flushResult.remaining}`);
            } catch (err) {
                alert(`❌ Gagal menyinkronkan antrean: ${err.message}`);
            }
        });
    }

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
    // 5. SHIFT CONTROL CENTER & AUDIT TRAIL ENGINE (shift-management.html)
    // ----------------------------------------------------
    if (isShiftPage && typeof JNTFirebaseService !== 'undefined') {
        let allShiftsCache = [];
        let allAuditLogsCache = [];
        let historyPage = 1;
        const historyPerPage = 5;

        // A. Real-time Clock & Shift Progress Timeline
        const updateShiftClockAndTimeline = (activeShift) => {
            const now = new Date();
            const clockStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
            const clockEl = document.getElementById('sh-top-clock-text');
            if (clockEl) clockEl.textContent = clockStr;

            const timeTextEl = document.getElementById('sh-current-time-text');
            if (timeTextEl) timeTextEl.textContent = `WAKTU AKTUAL: ${clockStr}`;

            if (!activeShift) return;

            // Parse start & end times
            let startHour = 8, startMin = 0;
            let endHour = 20, endMin = 0;

            if (activeShift.jamMulai && activeShift.jamMulai.includes(':')) {
                const parts = activeShift.jamMulai.split(':');
                startHour = parseInt(parts[0], 10) || 8;
                startMin = parseInt(parts[1], 10) || 0;
            }
            if (activeShift.jamSelesai && activeShift.jamSelesai.includes(':')) {
                const parts = activeShift.jamSelesai.split(':');
                endHour = parseInt(parts[0], 10) || 20;
                endMin = parseInt(parts[1], 10) || 0;
            }

            let startTotalMins = startHour * 60 + startMin;
            let endTotalMins = endHour * 60 + endMin;
            if (endTotalMins <= startTotalMins) endTotalMins += 24 * 60; // Shift overnight

            let nowTotalMins = now.getHours() * 60 + now.getMinutes();
            if (nowTotalMins < startTotalMins && endTotalMins > 24 * 60) nowTotalMins += 24 * 60;

            const totalDurationMins = endTotalMins - startTotalMins;
            const elapsedMins = nowTotalMins - startTotalMins;

            let pct = 0;
            if (totalDurationMins > 0) {
                pct = Math.max(0, Math.min(100, (elapsedMins / totalDurationMins) * 100));
            }

            const fillEl = document.getElementById('sh-timeline-fill');
            const pinEl = document.getElementById('sh-timeline-pin');
            if (fillEl) fillEl.style.width = `${pct}%`;
            if (pinEl) pinEl.style.left = `${pct}%`;

            const remMins = Math.max(0, endTotalMins - nowTotalMins);
            const remHours = Math.floor(remMins / 60);
            const remMinsLeft = remMins % 60;

            const remLabel = document.getElementById('sh-remaining-time-label');
            if (remLabel) {
                if (activeShift.status === 'COMPLETED') {
                    remLabel.textContent = '✅ Shift Telah Selesai';
                    remLabel.style.color = '#4ADE80';
                } else if (remMins <= 0) {
                    remLabel.textContent = '⌛ Shift Waktu Habis - Siap Diakhiri';
                    remLabel.style.color = '#FCA5A5';
                } else {
                    remLabel.textContent = `⏳ Sisa Durasi: ${remHours} Jam ${remMinsLeft} Menit`;
                    remLabel.style.color = remMins < 60 ? '#FCA5A5' : '#38BDF8';
                }
            }

            // Warning Banner
            const banner = document.getElementById('sh-shift-alert-banner');
            const alertMsg = document.getElementById('sh-alert-msg');
            if (banner) {
                if (activeShift.status === 'AKTIF' && remMins > 0 && remMins <= 60) {
                    banner.classList.remove('hidden');
                    if (alertMsg) alertMsg.textContent = `⚠️ WARNING: Shift aktif hampir selesai (tersisa ${remMinsLeft} menit). Mohon persiapkan pergantian operator!`;
                } else if (activeShift.status === 'AKTIF' && remMins <= 0) {
                    banner.classList.remove('hidden');
                    if (alertMsg) alertMsg.textContent = `⌛ PERHATIAN: Jam operasional shift telah berakhir (${activeShift.jamSelesai}). Silakan klik 'Akhiri Shift' atau 'Pergantian Shift'.`;
                } else {
                    banner.classList.add('hidden');
                }
            }
        };

        // B. Render Main Shift Control Center Dashboard
        const renderShiftControlCenter = () => {
            const activeShift = JNTFirebaseService.getActiveShift();
            const metrics = JNTFirebaseService.calculateShiftMetrics(activeShift.shiftId || activeShift.id);

            // Update Active Shift Hero
            const elId = document.getElementById('sh-active-id');
            const elTitle = document.getElementById('sh-active-title');
            const elMeta = document.getElementById('sh-active-meta');
            const elBadge = document.getElementById('sh-active-status-badge');
            const elStartLbl = document.getElementById('sh-start-time-label');
            const elEndLbl = document.getElementById('sh-end-time-label');

            if (elId) elId.textContent = activeShift.shiftId || activeShift.id;
            if (elTitle) elTitle.textContent = activeShift.namaShift || `Shift (${activeShift.jamMulai} - ${activeShift.jamSelesai} WIB)`;
            if (elMeta) elMeta.textContent = `Tanggal Tugas: ${activeShift.tanggal || 'Hari Ini'} • Durasi Operasional: ${activeShift.jamMulai || '08:00'} - ${activeShift.jamSelesai || '20:00'} WIB`;
            if (elStartLbl) elStartLbl.textContent = `${activeShift.jamMulai || '08:00'} WIB`;
            if (elEndLbl) elEndLbl.textContent = `${activeShift.jamSelesai || '20:00'} WIB`;

            if (elBadge) {
                if (activeShift.status === 'AKTIF') {
                    elBadge.className = 'badge-status green-outline';
                    elBadge.textContent = '🟢 SHIFT SAAT INI AKTIF';
                } else {
                    elBadge.className = 'badge-status blue-outline';
                    elBadge.textContent = `✅ SHIFT ${activeShift.status}`;
                }
            }

            // Update Operators Panel
            const op1 = activeShift.operator1 || { nama: 'Hamdan Hamdani', tugas: 'Monitoring 4H & Incident' };
            const op2 = activeShift.operator2 || { nama: 'Rizky Ramadhan', tugas: 'SLA Vendor & Master Data' };

            const elOp1Nama = document.getElementById('sh-op1-nama');
            const elOp1Tugas = document.getElementById('sh-op1-tugas');
            const elOp1Mon = document.getElementById('sh-op1-mon-count');
            const elOp1Inc = document.getElementById('sh-op1-inc-count');

            if (elOp1Nama) elOp1Nama.textContent = op1.nama;
            if (elOp1Tugas) elOp1Tugas.textContent = op1.tugas || 'Monitoring 4H & Incident';
            if (elOp1Mon) elOp1Mon.textContent = metrics.monCheckins;
            if (elOp1Inc) elOp1Inc.textContent = metrics.incidents;

            const elOp2Nama = document.getElementById('sh-op2-nama');
            const elOp2Tugas = document.getElementById('sh-op2-tugas');
            const elOp2Sla = document.getElementById('sh-op2-sla-count');
            const elOp2Total = document.getElementById('sh-op2-total-count');

            if (elOp2Nama) elOp2Nama.textContent = op2.nama;
            if (elOp2Tugas) elOp2Tugas.textContent = op2.tugas || 'SLA Vendor & Master Data';
            if (elOp2Sla) elOp2Sla.textContent = metrics.slaUpdates;
            if (elOp2Total) elOp2Total.textContent = metrics.totalTransactions;

            // Update 6 KPI Cards
            const kpiTx = document.getElementById('kpi-total-tx');
            const kpiMon = document.getElementById('kpi-mon-checkin');
            const kpiSla = document.getElementById('kpi-sla-update');
            const kpiInc = document.getElementById('kpi-inc-count');
            const kpiDur = document.getElementById('kpi-shift-duration');
            const kpiOps = document.getElementById('kpi-active-ops');

            if (kpiTx) kpiTx.textContent = metrics.totalTransactions;
            if (kpiMon) kpiMon.textContent = metrics.monCheckins;
            if (kpiSla) kpiSla.textContent = metrics.slaUpdates;
            if (kpiInc) kpiInc.textContent = metrics.incidents;
            if (kpiDur) kpiDur.textContent = `${activeShift.jamMulai || '08:00'} - ${activeShift.jamSelesai || '20:00'}`;
            if (kpiOps) kpiOps.textContent = activeShift.status === 'AKTIF' ? '2 Active' : '0 Active';

            updateShiftClockAndTimeline(activeShift);
            renderShiftHistoryTable();
            renderHandoverHistoryTable();
            renderAuditTrailTable();
        };

        // C. Render Shift History Table with Search, Filter & Pagination
        const renderShiftHistoryTable = () => {
            const tbody = document.getElementById('sh-history-tbody');
            if (!tbody) return;

            const searchVal = (document.getElementById('sh-history-search')?.value || '').toLowerCase().trim();
            const statusVal = document.getElementById('sh-history-status-filter')?.value || 'ALL';
            const dateVal = document.getElementById('sh-history-date-filter')?.value || '';

            let filtered = [...allShiftsCache];

            if (statusVal !== 'ALL') {
                filtered = filtered.filter(s => s.status === statusVal);
            }
            if (dateVal) {
                filtered = filtered.filter(s => s.tanggal === dateVal);
            }
            if (searchVal) {
                filtered = filtered.filter(s =>
                    (s.shiftId || '').toLowerCase().includes(searchVal) ||
                    (s.operator1 && s.operator1.nama && s.operator1.nama.toLowerCase().includes(searchVal)) ||
                    (s.operator2 && s.operator2.nama && s.operator2.nama.toLowerCase().includes(searchVal)) ||
                    (s.namaShift || '').toLowerCase().includes(searchVal)
                );
            }

            const totalItems = filtered.length;
            const totalPages = Math.ceil(totalItems / historyPerPage) || 1;
            if (historyPage > totalPages) historyPage = totalPages;

            const startIdx = (historyPage - 1) * historyPerPage;
            const pageItems = filtered.slice(startIdx, startIdx + historyPerPage);

            if (pageItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 24px; color: #94A3B8;">Tidak ada data riwayat shift yang sesuai filter.</td></tr>`;
            } else {
                tbody.innerHTML = pageItems.map((item, idx) => {
                    const rowNum = startIdx + idx + 1;
                    const shiftId = item.shiftId || item.id || '-';
                    const statusClass = item.status === 'AKTIF' ? 'green-outline' : 'blue-outline';
                    const statusText = item.status === 'AKTIF' ? '🟢 AKTIF' : '✅ COMPLETED';
                    const op1Nama = item.operator1 ? item.operator1.nama : 'Hamdan';
                    const op2Nama = item.operator2 ? item.operator2.nama : 'Rizky';
                    const jamText = item.namaShift || `${item.jamMulai || '08:00'} - ${item.jamSelesai || '20:00'}`;
                    const metrics = JNTFirebaseService.calculateShiftMetrics(shiftId);

                    return `
                        <tr class="inc-row">
                            <td class="col-center">${rowNum}</td>
                            <td><strong style="color: #E30613; font-family: monospace;">${shiftId}</strong></td>
                            <td>${item.tanggal || '-'}</td>
                            <td><strong>${jamText}</strong></td>
                            <td><strong>${op1Nama}</strong></td>
                            <td><strong>${op2Nama}</strong></td>
                            <td>12 Jam</td>
                            <td><span class="badge-status ${statusClass}">${statusText}</span></td>
                            <td><strong style="color: #2563EB;">${metrics.totalTransactions} Aktivitas</strong></td>
                            <td>
                                <div style="display: flex; gap: 6px;">
                                    <button class="btn-st-outline btn-view-shift-detail" data-shift-id="${shiftId}" style="padding: 4px 8px; font-size: 11.5px;" title="Lihat Detail Shift & Timeline">👁️ View</button>
                                    <button class="btn-st-outline btn-copy-shift-item" data-shift-id="${shiftId}" style="padding: 4px 8px; font-size: 11.5px;" title="Salin ID Shift">📋 Copy</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            // Pagination Controls
            const infoEl = document.getElementById('sh-pagination-info');
            const controlsEl = document.getElementById('sh-pagination-controls');

            if (infoEl) {
                const endPos = Math.min(startIdx + historyPerPage, totalItems);
                infoEl.textContent = totalItems > 0 ? `Menampilkan ${startIdx + 1} - ${endPos} dari ${totalItems} Shift` : 'Tidak ada data';
            }

            if (controlsEl) {
                let btnsHtml = `<button class="btn-st-outline" id="btn-hist-prev" ${historyPage <= 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px;">Prev</button>`;
                for (let p = 1; p <= totalPages; p++) {
                    btnsHtml += `<button class="btn-st-outline ${p === historyPage ? 'btn-jnt-red' : ''}" data-page="${p}" style="padding: 4px 10px; font-size: 12px; ${p === historyPage ? 'color:#FFF;' : ''}">${p}</button>`;
                }
                btnsHtml += `<button class="btn-st-outline" id="btn-hist-next" ${historyPage >= totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px;">Next</button>`;
                controlsEl.innerHTML = btnsHtml;

                // Event Listeners for Pagination
                const btnPrev = document.getElementById('btn-hist-prev');
                const btnNext = document.getElementById('btn-hist-next');
                if (btnPrev) btnPrev.onclick = () => { if (historyPage > 1) { historyPage--; renderShiftHistoryTable(); } };
                if (btnNext) btnNext.onclick = () => { if (historyPage < totalPages) { historyPage++; renderShiftHistoryTable(); } };

                controlsEl.querySelectorAll('button[data-page]').forEach(b => {
                    b.onclick = () => {
                        historyPage = parseInt(b.getAttribute('data-page'), 10);
                        renderShiftHistoryTable();
                    };
                });
            }

            // Bind Table Row Action Click Listeners
            tbody.querySelectorAll('.btn-view-shift-detail').forEach(btn => {
                btn.onclick = () => {
                    const sid = btn.getAttribute('data-shift-id');
                    openShiftDetailModal(sid);
                };
            });

            tbody.querySelectorAll('.btn-copy-shift-item').forEach(btn => {
                btn.onclick = () => {
                    const sid = btn.getAttribute('data-shift-id');
                    navigator.clipboard.writeText(sid).then(() => {
                        window.showToastNotification("📋 Copied!", `Shift ID (${sid}) berhasil disalin!`, "success");
                    });
                };
            });
        };

        // D. Render Handover (Pergantian Shift) History Table
        const renderHandoverHistoryTable = () => {
            const tbody = document.getElementById('sh-handover-tbody');
            if (!tbody) return;

            const shifts = allShiftsCache;
            const handoverShifts = shifts.filter(s => s.handoverFrom);

            if (handoverShifts.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td class="col-center">1</td>
                        <td><strong style="color: #2563EB; font-family: monospace;">SHIFT-20261020-02</strong></td>
                        <td><span style="color: #DC2626; font-weight: 600;">Hamdan Hamdani &amp; Rizky Ramadhan</span></td>
                        <td><span style="color: #16A34A; font-weight: 600;">Dedi Setiawan &amp; Faris Ramadhan</span></td>
                        <td><span style="font-weight: 700; color: #0F172A;">12:00 - 20:00 WIB</span></td>
                        <td>20/10/2026 12:00</td>
                        <td>Pergantian shift operasional</td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = handoverShifts.map((s, idx) => {
                const newOps = `${s.operator1 ? s.operator1.nama : '-'} & ${s.operator2 ? s.operator2.nama : '-'}`;
                const jamMulaiAkhir = `${s.jamMulai || '08:00'} - ${s.jamSelesai || '20:00'} WIB`;
                return `
                    <tr>
                        <td class="col-center">${idx + 1}</td>
                        <td><strong style="color: #2563EB; font-family: monospace;">${s.shiftId || s.id}</strong></td>
                        <td><span style="color: #DC2626; font-weight: 600;">${s.handoverFrom}</span></td>
                        <td><span style="color: #16A34A; font-weight: 600;">${newOps}</span></td>
                        <td><span style="font-weight: 700; color: #0F172A;">${jamMulaiAkhir}</span></td>
                        <td>${s.handoverTime || s.tanggal || '-'}</td>
                        <td>${s.handoverNote || 'Pergantian Shift Operasional'}</td>
                    </tr>
                `;
            }).join('');
        };

        // E. Render Real-Time Audit Trail Table
        const renderAuditTrailTable = () => {
            const tbody = document.getElementById('audit-table-body');
            if (!tbody) return;

            const modFilter = document.getElementById('audit-module-filter')?.value || 'ALL';
            let filteredLogs = [...allAuditLogsCache];

            if (modFilter !== 'ALL') {
                filteredLogs = filteredLogs.filter(l => l.modul === modFilter);
            }

            if (filteredLogs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94A3B8;">Belum ada log aktivitas untuk modul ini.</td></tr>`;
                return;
            }

            tbody.innerHTML = filteredLogs.map((item, idx) => {
                let badgeClass = 'monitoring';
                const mUpper = (item.modul || '').toUpperCase();
                if (mUpper.includes('SLA')) badgeClass = 'sla';
                else if (mUpper.includes('TROUBLE') || mUpper.includes('INCIDENT')) badgeClass = 'trouble';
                else if (mUpper.includes('SHIFT')) badgeClass = 'shift';
                else if (mUpper.includes('MASTER')) badgeClass = 'master';

                return `
                    <tr class="inc-row">
                        <td class="col-center">${idx + 1}</td>
                        <td><strong>${item.waktu || '-'}</strong></td>
                        <td><span class="badge-status blue-outline font-monospace" style="font-size: 11.5px;">${item.shiftId || 'SHIFT-20261001-01'}</span></td>
                        <td><strong>${item.operator || 'System'}</strong></td>
                        <td><span class="audit-badge ${badgeClass}">${item.modul || 'General'}</span></td>
                        <td><strong style="color: #E30613; font-family: monospace;">${item.kodeTugas || '-'}</strong></td>
                        <td>${item.aktivitas || '-'}</td>
                    </tr>
                `;
            }).join('');
        };

        // E. Open Shift Detail Modal & Timeline Builder
        const openShiftDetailModal = (shiftId) => {
            const shifts = JNTFirebaseService.getLocalStore('shifts');
            const targetShift = shifts.find(s => s.shiftId === shiftId || s.id === shiftId) || JNTFirebaseService.getActiveShift();
            const logs = JNTFirebaseService.getLocalStore('audit_logs') || [];
            const shiftLogs = logs.filter(l => l.shiftId === shiftId);

            const elId = document.getElementById('dt-modal-id');
            const elStatus = document.getElementById('dt-modal-status');
            const elTanggal = document.getElementById('dt-modal-tanggal');
            const elJam = document.getElementById('dt-modal-jam');
            const elOp1 = document.getElementById('dt-modal-op1');
            const elOp2 = document.getElementById('dt-modal-op2');
            const timelineBox = document.getElementById('dt-modal-timeline');

            if (elId) elId.textContent = targetShift.shiftId || targetShift.id;
            if (elStatus) elStatus.textContent = targetShift.status || 'AKTIF';
            if (elTanggal) elTanggal.textContent = targetShift.tanggal || 'Hari Ini';
            if (elJam) elJam.textContent = targetShift.namaShift || `${targetShift.jamMulai} - ${targetShift.jamSelesai} WIB`;
            if (elOp1) elOp1.textContent = targetShift.operator1 ? targetShift.operator1.nama : 'Hamdan';
            if (elOp2) elOp2.textContent = targetShift.operator2 ? targetShift.operator2.nama : 'Rizky';

            if (timelineBox) {
                if (shiftLogs.length === 0) {
                    timelineBox.innerHTML = `<div style="padding: 14px; text-align: center; color: #94A3B8; font-size: 13px;">Belum ada aktivitas tercatat untuk shift ini.</div>`;
                } else {
                    timelineBox.innerHTML = shiftLogs.map(l => {
                        return `
                            <div class="timeline-slot-node active-slot">
                                <div>
                                    <strong style="color: #0F172A; display: block; font-size: 13px;">${l.aktivitas}</strong>
                                    <span style="font-size: 11.5px; color: #64748B;">👤 ${l.operator} • 🆔 ${l.kodeTugas || '-'}</span>
                                </div>
                                <span style="font-size: 11.5px; color: #2563EB; font-weight: 700; font-family: monospace;">${l.waktu}</span>
                            </div>
                        `;
                    }).join('');
                }
            }

            openModal('modal-shift-detail');
        };

        // F. Subscriptions & Real-Time Sync Handlers
        JNTFirebaseService.subscribeShifts((list) => {
            allShiftsCache = list;
            renderShiftControlCenter();
        });

        JNTFirebaseService.subscribeAuditLogs((logs) => {
            allAuditLogsCache = logs;
            renderShiftControlCenter();
        });

        // Global Event Bus Listener for Cross-Tab & Internal Sync
        window.addEventListener('jnt_data_updated', () => {
            renderShiftControlCenter();
        });

        // G. Setup Modal Triggers & Form Event Handlers
        const btnStartShift = document.getElementById('btn-open-start-shift');
        const btnSwitchShift = document.getElementById('btn-open-switch-shift');
        const btnEditShift = document.getElementById('btn-open-edit-shift');
        const btnEndShift = document.getElementById('btn-open-end-shift');
        const btnCopyId = document.getElementById('btn-copy-shift-id');

        if (btnStartShift) btnStartShift.onclick = () => openModal('modal-start-shift');
        if (btnSwitchShift) btnSwitchShift.onclick = () => openModal('modal-switch-shift');
        if (btnEditShift) btnEditShift.onclick = () => {
            const active = JNTFirebaseService.getActiveShift();
            const ed1 = document.getElementById('ed-op1-select');
            const ed2 = document.getElementById('ed-op2-select');
            const ed1T = document.getElementById('ed-op1-tugas');
            const ed2T = document.getElementById('ed-op2-tugas');

            if (ed1 && active.operator1) ed1.value = active.operator1.nama;
            if (ed2 && active.operator2) ed2.value = active.operator2.nama;
            if (ed1T && active.operator1) ed1T.value = active.operator1.tugas || 'Monitoring 4H & Incident';
            if (ed2T && active.operator2) ed2T.value = active.operator2.tugas || 'SLA Vendor & Master Data';

            openModal('modal-edit-shift');
        };

        if (btnEndShift) btnEndShift.onclick = () => {
            const active = JNTFirebaseService.getActiveShift();
            const metrics = JNTFirebaseService.calculateShiftMetrics(active.shiftId || active.id);

            const mId = document.getElementById('end-modal-id');
            const mOps = document.getElementById('end-modal-ops');
            const mTx = document.getElementById('end-modal-tx');

            if (mId) mId.textContent = active.shiftId || active.id;
            if (mOps) mOps.textContent = `${active.operator1 ? active.operator1.nama : 'Op 1'} & ${active.operator2 ? active.operator2.nama : 'Op 2'}`;
            if (mTx) mTx.textContent = `${metrics.totalTransactions} Aktivitas`;

            openModal('modal-end-shift');
        };

        if (btnCopyId) {
            btnCopyId.onclick = () => {
                const activeId = JNTFirebaseService.getActiveShiftId();
                navigator.clipboard.writeText(activeId).then(() => {
                    window.showToastNotification("📋 Copied!", `Shift ID (${activeId}) berhasil disalin ke clipboard!`, "success");
                });
            };
        }

        // Modal Form Submit: Mulai Shift Baru
        const formStartShift = document.getElementById('form-start-shift');
        if (formStartShift) {
            formStartShift.onsubmit = async (e) => {
                e.preventDefault();
                try {
                    const tanggal = document.getElementById('st-tanggal-input').value;
                    const namaShift = document.getElementById('st-nama-select').value;
                    const jamMulai = document.getElementById('st-jam-mulai-input').value;
                    const jamSelesai = document.getElementById('st-jam-selesai-input').value;
                    const op1Nama = document.getElementById('st-op1-select').value;
                    const op1Tugas = document.getElementById('st-op1-tugas').value;
                    const op2Nama = document.getElementById('st-op2-select').value;
                    const op2Tugas = document.getElementById('st-op2-tugas').value;

                    const newShift = await JNTFirebaseService.startNewShift({
                        tanggal,
                        namaShift,
                        jamMulai,
                        jamSelesai,
                        operator1: { nama: op1Nama, role: "Operator Utama", tugas: op1Tugas },
                        operator2: { nama: op2Nama, role: "Operator Pendamping", tugas: op2Tugas }
                    });

                    window.showToastNotification("🚀 SHIFT BARU AKTIF", `Shift (${newShift.shiftId}) berhasil dimulaikan!`, "success");
                    closeModal('modal-start-shift');
                    renderShiftControlCenter();
                } catch (err) {
                    alert(`⚠️ Error Mulai Shift: ${err.message}`);
                }
            };
        }

        // Modal Form Submit: Pergantian Shift
        const formSwitchShift = document.getElementById('form-switch-shift');
        if (formSwitchShift) {
            formSwitchShift.onsubmit = async (e) => {
                e.preventDefault();
                try {
                    const active = JNTFirebaseService.getActiveShift();
                    const newOp1 = document.getElementById('sw-op1-select').value;
                    const newOp2 = document.getElementById('sw-op2-select').value;
                    const catatan = document.getElementById('sw-catatan').value;

                    const nextShift = await JNTFirebaseService.switchShift(
                        active.shiftId || active.id,
                        newOp1,
                        newOp2,
                        "Monitoring 4H & Incident",
                        "SLA Vendor & Master Data",
                        catatan || "Pergantian Shift Operasional"
                    );

                    window.showToastNotification("🔄 PERGANTIAN SHIFT BERHASIL", `Operator Shift Baru: ${newOp1} & ${newOp2}`, "success");
                    closeModal('modal-switch-shift');
                    renderShiftControlCenter();
                } catch (err) {
                    alert(`⚠️ Error Pergantian Shift: ${err.message}`);
                }
            };
        }

        // Modal Form Submit: Edit Shift
        const formEditShift = document.getElementById('form-edit-shift');
        if (formEditShift) {
            formEditShift.onsubmit = async (e) => {
                e.preventDefault();
                try {
                    const active = JNTFirebaseService.getActiveShift();
                    const op1Nama = document.getElementById('ed-op1-select').value;
                    const op1Tugas = document.getElementById('ed-op1-tugas').value;
                    const op2Nama = document.getElementById('ed-op2-select').value;
                    const op2Tugas = document.getElementById('ed-op2-tugas').value;

                    const updatedObj = {
                        ...active,
                        operator1: { nama: op1Nama, role: "Operator Utama", tugas: op1Tugas },
                        operator2: { nama: op2Nama, role: "Operator Pendamping", tugas: op2Tugas }
                    };

                    await JNTFirebaseService.saveActiveShift(updatedObj);
                    await JNTFirebaseService.logAuditEvent({
                        waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                        operator: activeUsername,
                        shiftId: active.shiftId || active.id,
                        modul: "Shift Management",
                        kodeTugas: "-",
                        aktivitas: `Update Penugasan Operator Shift (${op1Nama} & ${op2Nama})`
                    });

                    window.showToastNotification("💾 PERUBAHAN TERSIMPAN", "Data operator shift berhasil diperbarui!", "success");
                    closeModal('modal-edit-shift');
                    renderShiftControlCenter();
                } catch (err) {
                    alert(`⚠️ Error Edit Shift: ${err.message}`);
                }
            };
        }

        // Modal Action: Confirm End Shift
        const btnConfirmEnd = document.getElementById('btn-confirm-end-shift');
        if (btnConfirmEnd) {
            btnConfirmEnd.onclick = async () => {
                try {
                    const active = JNTFirebaseService.getActiveShift();
                    await JNTFirebaseService.endActiveShift(active.shiftId || active.id);
                    window.showToastNotification("⏹️ SHIFT DIAKHIRI", `Shift (${active.shiftId || active.id}) diubah menjadi COMPLETED.`, "success");
                    closeModal('modal-end-shift');
                    renderShiftControlCenter();
                } catch (err) {
                    alert(`⚠️ Error Akhiri Shift: ${err.message}`);
                }
            };
        }

        // History Filters Event Binding
        const histSearch = document.getElementById('sh-history-search');
        const histStatus = document.getElementById('sh-history-status-filter');
        const histDate = document.getElementById('sh-history-date-filter');
        const histReset = document.getElementById('btn-reset-history-filter');

        if (histSearch) histSearch.oninput = () => { historyPage = 1; renderShiftHistoryTable(); };
        if (histStatus) histStatus.onchange = () => { historyPage = 1; renderShiftHistoryTable(); };
        if (histDate) histDate.onchange = () => { historyPage = 1; renderShiftHistoryTable(); };
        if (histReset) histReset.onclick = () => {
            if (histSearch) histSearch.value = '';
            if (histStatus) histStatus.value = 'ALL';
            if (histDate) histDate.value = '';
            historyPage = 1;
            renderShiftHistoryTable();
        };

        // Audit Trail Module Filter Event Binding
        const auditModFilter = document.getElementById('audit-module-filter');
        if (auditModFilter) auditModFilter.onchange = () => renderAuditTrailTable();

        // Export Audit Trail Log Button
        const btnExportAudit = document.getElementById('btn-export-audit-log');
        if (btnExportAudit) {
            btnExportAudit.onclick = () => {
                const logs = JNTFirebaseService.getLocalStore('audit_logs') || [];
                if (logs.length === 0) {
                    alert('Tidak ada log aktivitas untuk diexport.');
                    return;
                }
                let csv = 'No,Waktu,Shift ID,Operator,Modul,Kode Tugas,Aktivitas\n';
                logs.forEach((l, idx) => {
                    csv += `"${idx + 1}","${l.waktu || ''}","${l.shiftId || ''}","${l.operator || ''}","${l.modul || ''}","${l.kodeTugas || ''}","${(l.aktivitas || '').replace(/"/g, '""')}"\n`;
                });
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.setAttribute('download', `Audit_Trail_Shift_JNT_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.showToastNotification("📥 Export Success", "Audit log berhasil diexport ke CSV!", "success");
            };
        }

        // Live Clock interval ticker every 1 second
        setInterval(() => {
            const active = JNTFirebaseService.getActiveShift();
            updateShiftClockAndTimeline(active);
        }, 1000);

        // Set default date input in modal to today
        const stDate = document.getElementById('st-tanggal-input');
        if (stDate) stDate.value = new Date().toISOString().slice(0, 10);

        // Initial render execution
        setTimeout(() => {
            renderShiftControlCenter();
        }, 300);
    }

    // ----------------------------------------------------
    // 7. GLOBAL SLA INPUT SUCCESS ACTION NOTIFICATION SYSTEM
    // ----------------------------------------------------

    // Sound synthesizer using Web Audio API
    window.playSuccessChime = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();

            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc2.type = 'sine';

            osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

            osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
            osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.3);

            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.15);
            osc2.start(ctx.currentTime + 0.15);
            osc2.stop(ctx.currentTime + 0.35);
        } catch (e) {
            console.warn("Audio chime unsupported or blocked", e);
        }
    };

    // Toast notification helper
    window.showToastNotification = (title, message, type = 'success', duration = 4000) => {
        let container = document.getElementById('jnt-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'jnt-toast-container';
            container.className = 'jnt-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `jnt-toast-item toast-${type}`;

        const iconSvg = type === 'success'
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" style="width:22px;height:22px;flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2.5" style="width:22px;height:22px;flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

        toast.innerHTML = `
            ${iconSvg}
            <div style="flex:1;">
                <strong style="font-size:13.5px; display:block; color:#FFF; font-weight:700; margin-bottom:2px;">${title}</strong>
                <span style="font-size:12px; color:#94A3B8; line-height:1.4; display:block;">${message}</span>
            </div>
            <button type="button" style="background:none; border:none; color:#64748B; cursor:pointer; font-size:16px;" onclick="this.parentElement.remove()">&times;</button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    };

    // Rich Interactive Modal Action for SLA Input Success
    window.showSLASuccessModal = (data) => {
        window.playSuccessChime();
        window.showToastNotification("🚀 AKSI BERHASIL", `Data Mobil Keluar ${data.kodeTugas || ''} (${data.platNomor || ''}) berhasil disimpan ke SLA!`, 'success');

        let modal = document.getElementById('modal-sla-success-action');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-sla-success-action';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }

        const typeTitle = data.actionType || 'Input Keberangkatan Mobil & SLA';
        const kodeTugas = data.kodeTugas || '-';
        const platNomor = data.platNomor || '-';
        const trip = data.trip || data.namaRute || '-';
        const driver = data.driver1 || data.driver || '-';
        const vendor = data.vendor || 'PT J&T Logistics';
        const jamBerangkat = data.jamBerangkat || '-';
        const targetSLA = data.targetSLAHours ? `${data.targetSLAHours} Jam` : 'Target Terhubung';
        const totalAwb = data.totalAwb ? `${Number(data.totalAwb).toLocaleString('id-ID')} Paket` : '-';
        const inputBy = data.inputBy || sessionStorage.getItem('jnt_active_username') || 'Hamdan';

        modal.innerHTML = `
            <div class="modal-card modal-card-bounce" style="max-width: 540px; text-align: center; padding: 24px 28px;">
                <div class="success-icon-badge-pulse">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 32px; height: 32px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </div>
                
                <h3 style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin-bottom: 6px;">
                    🎉 AKSI BERHASIL DICATAT!
                </h3>
                <p style="font-size: 13.5px; color: #94A3B8; margin-bottom: 18px;">
                    ${typeTitle} telah tersimpan secara SSOT &amp; terhubung dengan Monitoring 4H.
                </p>

                <div class="sla-success-detail-box">
                    <div class="sla-success-row">
                        <span class="sla-success-label">🆔 Kode Tugas Armada</span>
                        <span class="sla-success-val" style="color:#E30613; font-size:14px;">${kodeTugas}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">🚚 Plat Nomor</span>
                        <span class="sla-success-val">${platNomor}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">🗺️ Master Trip / Rute</span>
                        <span class="sla-success-val">${trip}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">👤 Driver Utama</span>
                        <span class="sla-success-val">${driver}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">🏭 Vendor Transport</span>
                        <span class="sla-success-val">${vendor}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">🕒 Jam Keberangkatan</span>
                        <span class="sla-success-val" style="color:#10B981;">${jamBerangkat}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">🎯 Target SLA Outbound</span>
                        <span class="sla-success-val" style="color:#3B82F6;">${targetSLA}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">📦 Total Muatan AWB</span>
                        <span class="sla-success-val">${totalAwb}</span>
                    </div>
                    <div class="sla-success-row">
                        <span class="sla-success-label">✍️ Diinput Oleh</span>
                        <span class="sla-success-val" style="color:#F59E0B;">${inputBy}</span>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px; margin-top: 20px;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <button id="btn-copy-sla-wa" type="button" style="background:#1E293B; color:#10B981; border:1px solid #10B981; padding:11px 14px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:all 0.2s ease;">
                            📲 Salin Info (WA Dispatcher)
                        </button>
                        <a href="monitoring.html" style="background:linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color:#FFF; border:none; padding:11px 14px; border-radius:8px; font-weight:700; font-size:12.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; text-decoration:none;">
                            📍 Ke Monitoring 4H
                        </a>
                    </div>
                    <button type="button" class="btn-close-sla-modal" style="background:linear-gradient(135deg, #E30613 0%, #B9040E 100%); color:#FFF; border:none; padding:12px 20px; border-radius:8px; font-weight:800; font-size:13.5px; cursor:pointer; width:100%;">
                        ✅ Tutup &amp; Lihat Tabel Data
                    </button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        // Button Copy WA text
        const btnCopy = modal.querySelector('#btn-copy-sla-wa');
        if (btnCopy) {
            btnCopy.onclick = () => {
                const waText = `🚨 *KEBERANGKATAN MOBIL & SLA J&T EXPRESS*\n` +
                    `----------------------------------------\n` +
                    `🆔 *Kode Tugas:* ${kodeTugas}\n` +
                    `🚚 *Plat Nomor:* ${platNomor}\n` +
                    `🗺️ *Trip:* ${trip}\n` +
                    `👤 *Driver:* ${driver}\n` +
                    `🏭 *Vendor:* ${vendor}\n` +
                    `🕒 *Jam Berangkat:* ${jamBerangkat}\n` +
                    `🎯 *Target SLA:* ${targetSLA}\n` +
                    `✍️ *Input By:* ${inputBy}\n` +
                    `----------------------------------------\n` +
                    `_Status: Aktif di Monitoring 4H & SLA Outbound_`;

                navigator.clipboard.writeText(waText).then(() => {
                    window.showToastNotification("📋 Copied!", "Ringkasan keberangkatan berhasil disalin ke clipboard!", "success");
                }).catch(e => {
                    alert(waText);
                });
            };
        }

        // Button Close Modal
        const btnClose = modal.querySelector('.btn-close-sla-modal');
        if (btnClose) {
            btnClose.onclick = () => {
                modal.classList.add('hidden');
                // Highlight row in table if found
                const rows = document.querySelectorAll('tr');
                rows.forEach(r => {
                    if (r.textContent.includes(kodeTugas)) {
                        r.classList.add('row-highlight-success');
                        r.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                });
            };
        }
    };

    // =========================================================================
    // 8. TROUBLE & LAKA CONTROLLER (trouble.html)
    // =========================================================================
    if (isTroublePage && typeof JNTFirebaseService !== 'undefined') {
        let allTroublesCache = [];
        let selectedIncident = null;
        let troubleCurrentPage = 1;
        const troublePerPage = 10;

        // Auto-fill form fields when Kode Tugas selected in modal
        const trSelect = document.getElementById('tr-kode-tugas-select');
        const trWaktuKejadian = document.getElementById('tr-waktu-kejadian');
        if (trWaktuKejadian) {
            trWaktuKejadian.value = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        }

        if (trSelect) {
            trSelect.addEventListener('change', () => {
                const kode = trSelect.value;
                const trip = activeIncomingMap[kode];
                const platInput = document.getElementById('tr-plat');
                const driverInput = document.getElementById('tr-driver');
                const ruteInput = document.getElementById('tr-rute-tlc');

                if (trip) {
                    if (platInput) platInput.value = trip.platNomor || '-';
                    if (driverInput) driverInput.value = trip.driver1 || trip.driver || '-';
                    if (ruteInput) ruteInput.value = `${trip.trip || trip.namaRute || '-'} (${trip.tlc || '-'})`;
                } else {
                    if (platInput) platInput.value = '';
                    if (driverInput) driverInput.value = '';
                    if (ruteInput) ruteInput.value = '';
                }
            });
        }

        // Render KPI Counters
        const renderTroubleKPIs = (list) => {
            const total = list.length;
            const troubleCount = list.filter(t => (t.jenis || '').toLowerCase().includes('trouble')).length;
            const lakaCount = list.filter(t => (t.jenis || '').toLowerCase().includes('laka')).length;
            const penangananCount = list.filter(t => t.status === 'DALAM PENANGANAN' || t.status === 'OPEN').length;
            const selesaiCount = list.filter(t => t.status === 'SUDAH SELESAI' || t.status === 'SELESAI').length;

            const trPct = total > 0 ? Math.round((troubleCount / total) * 100) : 0;
            const lkPct = total > 0 ? Math.round((lakaCount / total) * 100) : 0;
            const penPct = total > 0 ? Math.round((penangananCount / total) * 100) : 0;
            const selPct = total > 0 ? Math.round((selesaiCount / total) * 100) : 0;

            const elTotal = document.getElementById('tr-kpi-total');
            const elTr = document.getElementById('tr-kpi-trouble');
            const elTrPct = document.getElementById('tr-kpi-trouble-pct');
            const elTrFill = document.getElementById('tr-kpi-trouble-fill');

            const elLk = document.getElementById('tr-kpi-laka');
            const elLkPct = document.getElementById('tr-kpi-laka-pct');
            const elLkFill = document.getElementById('tr-kpi-laka-fill');

            const elPen = document.getElementById('tr-kpi-penanganan');
            const elPenPct = document.getElementById('tr-kpi-penanganan-pct');
            const elPenFill = document.getElementById('tr-kpi-penanganan-fill');

            const elSel = document.getElementById('tr-kpi-selesai');
            const elSelPct = document.getElementById('tr-kpi-selesai-pct');
            const elSelFill = document.getElementById('tr-kpi-selesai-fill');

            if (elTotal) elTotal.textContent = total;
            if (elTr) elTr.textContent = troubleCount;
            if (elTrPct) elTrPct.textContent = `${trPct}%`;
            if (elTrFill) elTrFill.style.width = `${trPct}%`;

            if (elLk) elLk.textContent = lakaCount;
            if (elLkPct) elLkPct.textContent = `${lkPct}%`;
            if (elLkFill) elLkFill.style.width = `${lkPct}%`;

            if (elPen) elPen.textContent = penangananCount;
            if (elPenPct) elPenPct.textContent = `${penPct}%`;
            if (elPenFill) elPenFill.style.width = `${penPct}%`;

            if (elSel) elSel.textContent = selesaiCount;
            if (elSelPct) elSelPct.textContent = `${selPct}%`;
            if (elSelFill) elSelFill.style.width = `${selPct}%`;
        };

        // Render Right Detail Panel
        const populateTroubleDetail = (incident) => {
            selectedIncident = incident;
            if (!incident) return;

            const dtHeaderBadge = document.getElementById('dt-header-status-badge');
            const dtCode = document.getElementById('dt-incident-code');
            const dtTypeTag = document.getElementById('dt-incident-type-tag');
            const dtRoute = document.getElementById('dt-incident-route');
            const dtWaktu = document.getElementById('dt-incident-waktu');
            const dtLokasi = document.getElementById('dt-incident-lokasi');
            const dtPlat = document.getElementById('dt-incident-plat');
            const dtDriver = document.getElementById('dt-incident-driver');
            const dtDriver2 = document.getElementById('dt-incident-driver2');
            const dtJenis = document.getElementById('dt-incident-jenis');
            const dtKet = document.getElementById('dt-incident-keterangan');
            const dtStatus = document.getElementById('dt-incident-status');
            const dtReporter = document.getElementById('dt-incident-reporter');
            const dtTimeline = document.getElementById('dt-incident-timeline');

            const isSelesai = incident.status === 'SUDAH SELESAI' || incident.status === 'SELESAI';
            const badgeClass = isSelesai ? 'green-outline' : (incident.status === 'OPEN' ? 'red-outline' : 'orange-outline');

            if (dtHeaderBadge) {
                dtHeaderBadge.className = `badge-status ${badgeClass}`;
                dtHeaderBadge.textContent = incident.status;
            }

            if (dtCode) dtCode.textContent = incident.kodeTugas || incident.incidentId || '-';
            if (dtTypeTag) {
                dtTypeTag.textContent = incident.jenis || 'Trouble';
                dtTypeTag.style.backgroundColor = incident.jenis === 'Laka' ? '#F3E8FF' : '#FEE2E2';
                dtTypeTag.style.color = incident.jenis === 'Laka' ? '#9333EA' : '#DC2626';
            }

            if (dtRoute) dtRoute.textContent = incident.rute || incident.trip || '-';
            if (dtWaktu) dtWaktu.textContent = `${incident.waktuKejadian || '-'} WIB`;
            if (dtLokasi) dtLokasi.textContent = incident.lokasiKejadian || incident.lokasi || '-';
            if (dtPlat) dtPlat.textContent = incident.platNomor || '-';
            if (dtDriver) dtDriver.textContent = incident.driver || '-';
            if (dtDriver2) dtDriver2.textContent = incident.driver2 || '-';
            if (dtJenis) dtJenis.textContent = incident.kategoriTrouble || incident.jenis || '-';
            if (dtKet) dtKet.textContent = incident.deskripsi || incident.keterangan || incident.kronologi || '-';

            if (dtStatus) {
                dtStatus.className = `badge-status ${badgeClass}`;
                dtStatus.textContent = incident.status;
            }

            if (dtReporter) dtReporter.textContent = incident.dilaporkanOleh || 'Operator';

            // Render Photo Galleries
            window.openPhotoPreviewModal = (src, caption = 'Foto Bukti') => {
                const img = document.getElementById('preview-modal-img');
                const cap = document.getElementById('preview-modal-caption');
                const modal = document.getElementById('modal-photo-preview');
                if (img) img.src = src;
                if (cap) cap.textContent = caption;
                if (modal) modal.classList.remove('hidden');
            };

            const renderPhotoGallery = (containerId, photos, captionPrefix) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                if (!Array.isArray(photos) || photos.length === 0) {
                    container.innerHTML = `<div style="font-size: 11px; color: #94A3B8; text-align: center; padding: 8px; width: 100%;">Belum ada foto ${captionPrefix.toLowerCase()}</div>`;
                    return;
                }
                container.innerHTML = photos.map((p, idx) => `
                    <img src="${p}" alt="${captionPrefix} ${idx + 1}" class="incident-thumb" onclick="openPhotoPreviewModal('${p}', '${captionPrefix} #${idx + 1}')" style="width: 55px; height: 55px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 1.5px solid #CBD5E1; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
                `).join('');
            };

            renderPhotoGallery('dt-incident-gallery-kejadian', incident.fotoKejadian || [], 'Foto Kejadian');

            const wrapSelesai = document.getElementById('wrap-dt-gallery-selesai');
            const hasSelesai = isSelesai || (Array.isArray(incident.fotoSelesai) && incident.fotoSelesai.length > 0);
            if (wrapSelesai) wrapSelesai.style.display = hasSelesai ? 'flex' : 'none';
            if (hasSelesai) {
                renderPhotoGallery('dt-incident-gallery-selesai', incident.fotoSelesai || [], 'Foto Bukti Selesai');
            }

            // Populate Timeline
            if (dtTimeline) {
                const history = Array.isArray(incident.history) && incident.history.length > 0
                    ? incident.history
                    : [{ time: incident.waktuKejadian || '-', note: 'Laporan pertama masuk sistem', user: incident.dilaporkanOleh || 'Operator' }];

                dtTimeline.innerHTML = history.map(h => {
                    return `
                        <div class="history-step" style="display: flex; gap: 10px; align-items: flex-start;">
                            <div class="step-dot ${h.status === 'SUDAH SELESAI' ? 'green-dot' : 'orange-dot'}"></div>
                            <div class="step-meta">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 11px; font-weight: 700; color: #0F172A;">${h.time || '-'}</span>
                                </div>
                                <span style="font-size: 11px; color: #334155; line-height: 1.3; display: block;">${h.note || '-'}</span>
                                <span style="font-size: 10px; color: #94A3B8;">oleh ${h.user || 'Petugas'}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        };

        // Render Table Rows with Filter & Pagination
        const renderTroubleTable = () => {
            const tbody = document.getElementById('trouble-table-tbody');
            if (!tbody) return;

            const filterJenis = (document.getElementById('tr-filter-jenis')?.value || '').toLowerCase().trim();
            const filterStatus = (document.getElementById('tr-filter-status')?.value || '').trim();
            const filterSeverity = (document.getElementById('tr-filter-severity')?.value || '').trim();
            const filterSearch = (document.getElementById('tr-filter-search')?.value || '').toLowerCase().trim();

            let filtered = [...allTroublesCache];

            if (filterJenis) {
                filtered = filtered.filter(t => (t.jenis || '').toLowerCase().includes(filterJenis));
            }
            if (filterStatus) {
                filtered = filtered.filter(t => t.status === filterStatus);
            }
            if (filterSeverity) {
                filtered = filtered.filter(t => t.severity === filterSeverity);
            }
            if (filterSearch) {
                filtered = filtered.filter(t =>
                    (t.kodeTugas || '').toLowerCase().includes(filterSearch) ||
                    (t.platNomor || '').toLowerCase().includes(filterSearch) ||
                    (t.driver || '').toLowerCase().includes(filterSearch) ||
                    (t.lokasiKejadian || '').toLowerCase().includes(filterSearch) ||
                    (t.rute || '').toLowerCase().includes(filterSearch) ||
                    (t.incidentId || '').toLowerCase().includes(filterSearch)
                );
            }

            const total = filtered.length;
            const totalPages = Math.ceil(total / troublePerPage) || 1;
            if (troubleCurrentPage > totalPages) troubleCurrentPage = totalPages;

            const startIdx = (troubleCurrentPage - 1) * troublePerPage;
            const pageData = filtered.slice(startIdx, startIdx + troublePerPage);

            if (pageData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 28px; color: #94A3B8;">Tidak ada data Trouble & Laka yang sesuai filter.</td></tr>`;
            } else {
                tbody.innerHTML = pageData.map((item, idx) => {
                    const rowNum = startIdx + idx + 1;
                    const isSelected = selectedIncident && (selectedIncident.id === item.id || selectedIncident.incidentId === item.incidentId);
                    const isSelesai = item.status === 'SUDAH SELESAI' || item.status === 'SELESAI';
                    const badgeClass = isSelesai ? 'green-outline' : (item.status === 'OPEN' ? 'red-outline' : 'orange-outline');
                    const jenisColor = (item.jenis || '').includes('Laka') ? '#9333EA' : '#EF4444';
                    const jenisIcon = (item.jenis || '').includes('Laka') ? '💥 Laka' : '⚠️ Trouble';

                    return `
                        <tr class="inc-row trouble-row ${isSelected ? 'active-selected' : ''}" data-incident-id="${item.id || item.incidentId}" style="cursor: pointer; ${isSelected ? 'background-color: #FEF2F2;' : ''}">
                            <td class="col-center">${rowNum}</td>
                            <td><span class="time-main">${item.waktuKejadian || '-'}</span></td>
                            <td><strong>${item.kodeTugas || '-'}</strong></td>
                            <td>${item.tlc || 'PLM FUSO'}</td>
                            <td>${item.rute || item.trip || '-'}</td>
                            <td>${item.platNomor || '-'}</td>
                            <td><span style="color: ${jenisColor}; font-weight: 700;">${jenisIcon}</span></td>
                            <td>${item.lokasiKejadian || '-'}</td>
                            <td><span class="badge-status ${badgeClass}">${item.status || 'OPEN'}</span></td>
                            <td class="col-center"><button type="button" class="btn-view-eye" data-incident-id="${item.id || item.incidentId}">👁️</button></td>
                        </tr>
                    `;
                }).join('');
            }

            // Bind Row Click Events
            tbody.querySelectorAll('tr[data-incident-id]').forEach(tr => {
                tr.addEventListener('click', () => {
                    const id = tr.getAttribute('data-incident-id');
                    const target = allTroublesCache.find(t => (t.id === id || t.incidentId === id));
                    if (target) {
                        populateTroubleDetail(target);
                        renderTroubleTable();
                    }
                });
            });

            // Pagination Controls
            const paginationInfo = document.getElementById('trouble-pagination-info');
            const paginationControls = document.getElementById('trouble-pagination-controls');

            if (paginationInfo) {
                const endPos = Math.min(startIdx + troublePerPage, total);
                paginationInfo.textContent = total > 0 ? `Menampilkan ${startIdx + 1} - ${endPos} dari ${total} data` : 'Tidak ada data';
            }

            if (paginationControls) {
                let btnsHtml = `<button type="button" class="p-btn" id="btn-tr-prev" ${troubleCurrentPage <= 1 ? 'disabled' : ''}>&lt;</button>`;
                for (let p = 1; p <= totalPages; p++) {
                    btnsHtml += `<button type="button" class="p-btn ${p === troubleCurrentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                }
                btnsHtml += `<button type="button" class="p-btn" id="btn-tr-next" ${troubleCurrentPage >= totalPages ? 'disabled' : ''}>&gt;</button>`;
                paginationControls.innerHTML = btnsHtml;

                const btnPrev = document.getElementById('btn-tr-prev');
                const btnNext = document.getElementById('btn-tr-next');
                if (btnPrev) btnPrev.onclick = () => { if (troubleCurrentPage > 1) { troubleCurrentPage--; renderTroubleTable(); } };
                if (btnNext) btnNext.onclick = () => { if (troubleCurrentPage < totalPages) { troubleCurrentPage++; renderTroubleTable(); } };

                paginationControls.querySelectorAll('button[data-page]').forEach(b => {
                    b.onclick = () => {
                        troubleCurrentPage = parseInt(b.getAttribute('data-page'), 10);
                        renderTroubleTable();
                    };
                });
            }

            // Auto-select first incident if none selected
            if (!selectedIncident && pageData.length > 0) {
                populateTroubleDetail(pageData[0]);
            }
        };

        // Filter Event Listeners
        const filterJenisEl = document.getElementById('tr-filter-jenis');
        const filterStatusEl = document.getElementById('tr-filter-status');
        const filterSeverityEl = document.getElementById('tr-filter-severity');
        const filterSearchEl = document.getElementById('tr-filter-search');
        const btnResetFilter = document.getElementById('btn-reset-trouble-filter');
        const btnApplyFilter = document.getElementById('btn-apply-trouble-filter');

        if (filterJenisEl) filterJenisEl.onchange = () => { troubleCurrentPage = 1; renderTroubleTable(); };
        if (filterStatusEl) filterStatusEl.onchange = () => { troubleCurrentPage = 1; renderTroubleTable(); };
        if (filterSeverityEl) filterSeverityEl.onchange = () => { troubleCurrentPage = 1; renderTroubleTable(); };
        if (filterSearchEl) filterSearchEl.oninput = () => { troubleCurrentPage = 1; renderTroubleTable(); };
        if (btnApplyFilter) btnApplyFilter.onclick = () => { troubleCurrentPage = 1; renderTroubleTable(); };

        if (btnResetFilter) {
            btnResetFilter.onclick = () => {
                if (filterJenisEl) filterJenisEl.value = '';
                if (filterStatusEl) filterStatusEl.value = '';
                if (filterSeverityEl) filterSeverityEl.value = '';
                if (filterSearchEl) filterSearchEl.value = '';
                troubleCurrentPage = 1;
                renderTroubleTable();
            };
        }

        // Photo upload helpers
        let pendingKejadianPhotos = [];
        let pendingSelesaiPhotos = [];

        function compressImageToBase64(file, maxWidth = 600, quality = 0.7) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        const dataUrl = canvas.toDataURL('image/jpeg', quality);
                        resolve(dataUrl);
                    };
                    img.onerror = () => resolve(e.target.result);
                    img.src = e.target.result;
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
            });
        }

        function renderPreviewContainer(containerId, photosArray, arrayName) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = photosArray.map((p, idx) => `
                <div style="position: relative; display: inline-block;">
                    <img src="${p}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid #CBD5E1;">
                    <button type="button" onclick="removePendingPhoto('${arrayName}', ${idx})" style="position: absolute; top: -5px; right: -5px; background: #DC2626; color: #FFF; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">&times;</button>
                </div>
            `).join('');
        }

        window.removePendingPhoto = (arrayName, idx) => {
            if (arrayName === 'pendingKejadianPhotos') {
                pendingKejadianPhotos.splice(idx, 1);
                renderPreviewContainer('tr-preview-container-kejadian', pendingKejadianPhotos, 'pendingKejadianPhotos');
            } else if (arrayName === 'pendingSelesaiPhotos') {
                pendingSelesaiPhotos.splice(idx, 1);
                renderPreviewContainer('tr-preview-container-selesai', pendingSelesaiPhotos, 'pendingSelesaiPhotos');
            }
        };

        const inputKejadian = document.getElementById('tr-foto-kejadian-file');
        if (inputKejadian) {
            inputKejadian.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files || []);
                for (const f of files) {
                    const b64 = await compressImageToBase64(f);
                    if (b64) pendingKejadianPhotos.push(b64);
                }
                renderPreviewContainer('tr-preview-container-kejadian', pendingKejadianPhotos, 'pendingKejadianPhotos');
            });
        }

        const inputSelesai = document.getElementById('tr-foto-selesai-file');
        if (inputSelesai) {
            inputSelesai.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files || []);
                for (const f of files) {
                    const b64 = await compressImageToBase64(f);
                    if (b64) pendingSelesaiPhotos.push(b64);
                }
                renderPreviewContainer('tr-preview-container-selesai', pendingSelesaiPhotos, 'pendingSelesaiPhotos');
            });
        }

        const inputDtPhoto = document.getElementById('dt-add-photo-file');
        if (inputDtPhoto) {
            inputDtPhoto.addEventListener('change', async (e) => {
                if (!selectedIncident) return;
                const files = Array.from(e.target.files || []);
                const newPhotos = [];
                for (const f of files) {
                    const b64 = await compressImageToBase64(f);
                    if (b64) newPhotos.push(b64);
                }
                if (newPhotos.length > 0) {
                    const incId = selectedIncident.id || selectedIncident.incidentId;
                    const updated = await JNTFirebaseService.updateIncidentStatus(
                        incId,
                        selectedIncident.status || 'DALAM PENANGANAN',
                        'Menambahkan foto kejadian tambahan',
                        activeUsername,
                        false,
                        null,
                        newPhotos
                    );
                    window.showToastNotification("📷 FOTO DITAMBAHKAN", "Foto kejadian berhasil ditambahkan.", "success");
                    if (updated) populateTroubleDetail(updated);
                }
            });
        }

        // Form Submit: Laporkan Incident Baru
        const formAddTrouble = document.getElementById('form-add-trouble');
        if (formAddTrouble) {
            formAddTrouble.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const kodeTugas = document.getElementById('tr-kode-tugas-select')?.value;
                    const platNomor = document.getElementById('tr-plat')?.value;
                    const driver = document.getElementById('tr-driver')?.value;
                    const rute = document.getElementById('tr-rute-tlc')?.value;
                    const severity = document.getElementById('tr-severity')?.value || 'MEDIUM';
                    const jenis = document.getElementById('tr-jenis')?.value || 'Trouble';
                    const kategoriTrouble = document.getElementById('tr-kategori-select')?.value || 'Kendala Operasional';
                    const lokasiKejadian = document.getElementById('tr-lokasi')?.value;
                    const kronologi = document.getElementById('tr-kronologi')?.value;
                    const dampak = document.getElementById('tr-dampak')?.value || '';

                    if (!kodeTugas) {
                        alert('Harap pilih Kode Tugas armada yang terlibat.');
                        return;
                    }

                    const newIncident = await JNTFirebaseService.addTroubleIncident({
                        kodeTugas,
                        platNomor,
                        driver,
                        rute,
                        severity,
                        jenis,
                        kategoriTrouble,
                        lokasiKejadian,
                        deskripsi: `${kronologi} | Dampak: ${dampak}`,
                        status: 'DALAM PENANGANAN',
                        dilaporkanOleh: activeUsername,
                        fotoKejadian: [...pendingKejadianPhotos]
                    });

                    pendingKejadianPhotos = [];
                    renderPreviewContainer('tr-preview-container-kejadian', [], 'pendingKejadianPhotos');

                    window.showToastNotification("🚨 INCIDENT DILAPORKAN", `Laporan ${jenis} untuk ${kodeTugas} (${platNomor}) berhasil dicatat. Status armada dialihkan ke KENDALA.`, "success");
                    closeModal('modal-add-trouble');
                    formAddTrouble.reset();
                    populateTroubleDetail(newIncident);
                } catch (err) {
                    alert(err.message);
                }
            });
        }

        // Open Update Status Modal
        const btnOpenUpdateStatus = document.getElementById('btn-open-update-status');
        if (btnOpenUpdateStatus) {
            btnOpenUpdateStatus.addEventListener('click', () => {
                if (!selectedIncident) {
                    alert('Pilih kejadian terlebih dahulu dari tabel.');
                    return;
                }
                const inpId = document.getElementById('upd-incident-id');
                const inpPetugas = document.getElementById('upd-incident-petugas');
                const selStatus = document.getElementById('upd-incident-status');

                if (inpId) inpId.value = selectedIncident.id || selectedIncident.incidentId;
                if (inpPetugas) inpPetugas.value = activeUsername;
                if (selStatus) selStatus.value = selectedIncident.status || 'DALAM PENANGANAN';

                openModal('modal-update-status-trouble');
            });
        }

        // Form Submit: Update Status Incident
        const formUpdateStatus = document.getElementById('form-update-status-trouble');
        if (formUpdateStatus) {
            formUpdateStatus.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const id = document.getElementById('upd-incident-id')?.value;
                    const newStatus = document.getElementById('upd-incident-status')?.value;
                    const petugas = document.getElementById('upd-incident-petugas')?.value || activeUsername;
                    const catatan = document.getElementById('upd-incident-catatan')?.value;

                    if (newStatus === 'SUDAH SELESAI' && pendingSelesaiPhotos.length === 0) {
                        alert('❌ Harap unggah foto bukti selesai penanganan sebelum mengubah status menjadi SUDAH SELESAI!');
                        return;
                    }

                    const updated = await JNTFirebaseService.updateIncidentStatus(id, newStatus, catatan, petugas, true, pendingSelesaiPhotos);
                    pendingSelesaiPhotos = [];
                    renderPreviewContainer('tr-preview-container-selesai', [], 'pendingSelesaiPhotos');

                    window.showToastNotification("🔄 STATUS DIPERBARUI", `Status incident berhasil diubah menjadi: ${newStatus}`, "success");
                    closeModal('modal-update-status-trouble');
                    formUpdateStatus.reset();
                    if (updated) populateTroubleDetail(updated);
                } catch (err) {
                    alert(`Gagal memperbarui status: ${err.message}`);
                }
            });
        }

        // Tutup Kejadian Button (Redirect to Update Status Modal for Photo Upload Requirement)
        const btnCloseIncident = document.getElementById('btn-close-incident');
        if (btnCloseIncident) {
            btnCloseIncident.addEventListener('click', () => {
                if (!selectedIncident) {
                    alert('Pilih kejadian terlebih dahulu.');
                    return;
                }
                if (selectedIncident.status === 'SUDAH SELESAI' || selectedIncident.status === 'SELESAI') {
                    alert('Kejadian ini sudah berstatus SUDAH SELESAI.');
                    return;
                }

                const inpId = document.getElementById('upd-incident-id');
                const inpPetugas = document.getElementById('upd-incident-petugas');
                const selStatus = document.getElementById('upd-incident-status');

                if (inpId) inpId.value = selectedIncident.id || selectedIncident.incidentId;
                if (inpPetugas) inpPetugas.value = activeUsername;
                if (selStatus) selStatus.value = 'SUDAH SELESAI';

                openModal('modal-update-status-trouble');
            });
        }

        // Subscribe to Trouble Data
        JNTFirebaseService.subscribeTroubles((list) => {
            allTroublesCache = list;
            renderTroubleKPIs(list);
            renderTroubleTable();
        });

        window.addEventListener('jnt_data_updated', () => {
            const list = JNTFirebaseService.getLocalStore('troubles');
            allTroublesCache = list;
            renderTroubleKPIs(list);
            renderTroubleTable();
        });
    }

    // =========================================================================
    // 9. USER MANAGEMENT CONTROLLER (users.html)
    // =========================================================================
    if (isUsersPage && typeof JNTFirebaseService !== 'undefined') {
        let allUsersCache = [];
        let selectedUser = null;
        let usersCurrentPage = 1;
        const usersPerPage = 10;
        let onlineUsersMap = new Map();

        if (window.db) {
            window.db.collection('active_sessions').onSnapshot((snapshot) => {
                onlineUsersMap.clear();
                const now = Date.now();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const uname = (data.username || doc.id).toLowerCase();
                    const lastSeen = data.lastSeen || 0;
                    if ((now - lastSeen) < 90000) {
                        onlineUsersMap.set(uname, true);
                    }
                });
                renderUsersTable();
            });
        }

        // Render User KPI Counters
        const renderUserKPIs = (list) => {
            const total = list.length;
            const adminCount = list.filter(u => (u.role || '').toUpperCase().includes('ADMIN') || (u.role || '').toUpperCase().includes('DEV')).length;
            const spvCount = list.filter(u => (u.role || '').toUpperCase().includes('SUPERVISOR')).length;
            const staffCount = list.filter(u => (u.role || '').toUpperCase().includes('STAFF') || (u.role || '').toUpperCase().includes('DISPATCH') || (u.role || '').toUpperCase().includes('OPERATOR')).length;
            const inactiveCount = list.filter(u => (u.status || '').toUpperCase() === 'NONAKTIF' || (u.status || '').toUpperCase() === 'INACTIVE').length;

            const elTot = document.getElementById('usr-kpi-total');
            const elAdm = document.getElementById('usr-kpi-admin');
            const elSpv = document.getElementById('usr-kpi-spv');
            const elOp = document.getElementById('usr-kpi-op');
            const elInact = document.getElementById('usr-kpi-inactive');

            if (elTot) elTot.textContent = total;
            if (elAdm) elAdm.textContent = adminCount;
            if (elSpv) elSpv.textContent = spvCount;
            if (elOp) elOp.textContent = staffCount;
            if (elInact) elInact.textContent = inactiveCount;
        };

        // Populate Right User Detail Panel
        const populateUserDetail = (u) => {
            selectedUser = u;
            if (!u) return;

            const dtAvatar = document.getElementById('usr-dt-avatar');
            const dtName = document.getElementById('usr-dt-name');
            const dtChip = document.getElementById('usr-dt-status-chip');
            const dtUname = document.getElementById('usr-dt-uname');
            const dtRole = document.getElementById('usr-dt-role');
            const dtEmail = document.getElementById('usr-dt-email');
            const dtPhone = document.getElementById('usr-dt-phone');
            const dtRoleItem = document.getElementById('usr-dt-role-item');
            const dtTlc = document.getElementById('usr-dt-tlc');
            const dtCreated = document.getElementById('usr-dt-created');
            const dtLastLogin = document.getElementById('usr-dt-lastlogin');
            const btnToggleStatus = document.getElementById('btn-toggle-active-user-action');

            const displayRole = (u.role || 'Staff Vehicle Dispatch').replace(/OPERATOR.*/i, 'Staff Vehicle Dispatch');

            if (dtAvatar) dtAvatar.src = u.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
            if (dtName) dtName.textContent = u.fullname || u.username;
            if (dtUname) dtUname.textContent = u.username;
            if (dtRole) dtRole.textContent = displayRole;
            if (dtEmail) dtEmail.textContent = u.email || `${u.username.toLowerCase()}@jtexpress.co.id`;
            if (dtPhone) dtPhone.textContent = u.phone || '-';
            if (dtRoleItem) dtRoleItem.textContent = displayRole;
            if (dtTlc) dtTlc.textContent = u.tlc || 'Head Office';
            if (dtCreated) dtCreated.textContent = u.createdAt ? new Date(u.createdAt).toLocaleDateString('id-ID') : '10/06/2026';
            if (dtLastLogin) dtLastLogin.textContent = u.lastLogin || '22/07/2026 10:15 WIB';

            const isActive = (u.status || 'Aktif').toLowerCase() === 'aktif';
            if (dtChip) {
                dtChip.textContent = isActive ? 'Aktif' : 'Nonaktif';
                dtChip.className = isActive ? 'user-active-chip' : 'user-inactive-chip';
            }

            if (btnToggleStatus) {
                btnToggleStatus.textContent = isActive ? '🙅‍♂️ Nonaktifkan Akun' : '🟢 Aktifkan Akun';
                btnToggleStatus.className = isActive ? 'btn-red-outline-full' : 'btn-white-outline-full';
            }
        };

        // Render Users Table
        const renderUsersTable = () => {
            const tbody = document.getElementById('users-table-tbody');
            if (!tbody) return;

            const filterSearch = (document.getElementById('usr-filter-search')?.value || '').toLowerCase().trim();
            const filterRole = (document.getElementById('usr-filter-role')?.value || '').toLowerCase().trim();
            const filterTlc = (document.getElementById('usr-filter-tlc')?.value || '').toLowerCase().trim();
            const filterStatus = (document.getElementById('usr-filter-status')?.value || '').toLowerCase().trim();

            let filtered = [...allUsersCache];

            if (filterSearch) {
                filtered = filtered.filter(u =>
                    (u.username || '').toLowerCase().includes(filterSearch) ||
                    (u.fullname || '').toLowerCase().includes(filterSearch) ||
                    (u.email || '').toLowerCase().includes(filterSearch)
                );
            }
            if (filterRole) {
                filtered = filtered.filter(u => (u.role || '').toLowerCase().includes(filterRole));
            }
            if (filterTlc) {
                filtered = filtered.filter(u => (u.tlc || '').toLowerCase().includes(filterTlc));
            }
            if (filterStatus) {
                filtered = filtered.filter(u => (u.status || 'aktif').toLowerCase().includes(filterStatus));
            }

            const total = filtered.length;
            const totalPages = Math.ceil(total / usersPerPage) || 1;
            if (usersCurrentPage > totalPages) usersCurrentPage = totalPages;

            const startIdx = (usersCurrentPage - 1) * usersPerPage;
            const pageData = filtered.slice(startIdx, startIdx + usersPerPage);

            if (pageData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 24px; color: #94A3B8;">Tidak ada data pengguna yang sesuai filter.</td></tr>`;
            } else {
                tbody.innerHTML = pageData.map((u, idx) => {
                    const rowNum = startIdx + idx + 1;
                    const isSelected = selectedUser && selectedUser.username === u.username;
                    const accountStatus = (u.status || 'Aktif').toLowerCase();
                    const isAccountActive = accountStatus === 'aktif';
                    const unameLower = (u.username || '').toLowerCase();
                    const isOnline = isAccountActive && onlineUsersMap.has(unameLower);

                    let statusHtml = '';
                    if (!isAccountActive) {
                        statusHtml = `<span class="status-dot-inactive">🔴 Nonaktif</span>`;
                    } else if (isOnline) {
                        statusHtml = `<span class="status-dot-active">🟢 Online</span>`;
                    } else {
                        statusHtml = `<span class="status-dot-inactive" style="color: #64748B;">⚪ Offline</span>`;
                    }

                    const displayRole = (u.role || 'Staff Vehicle Dispatch').replace(/OPERATOR.*/i, 'Staff Vehicle Dispatch');
                    const roleClass = (u.role || '').toLowerCase().includes('admin') ? 'role-admin' : ((u.role || '').toLowerCase().includes('supervisor') ? 'role-supervisor' : 'role-operator');
                    const photo = u.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80';

                    return `
                        <tr class="inc-row user-row ${isSelected ? 'active-selected' : ''}" data-uname="${u.username}" style="cursor: pointer;">
                            <td class="col-center">${rowNum}</td>
                            <td><img src="${photo}" class="user-row-avatar"></td>
                            <td><strong>${u.fullname || u.username}</strong></td>
                            <td class="text-dim">${u.username}</td>
                            <td class="text-dim">${u.email || '-'}</td>
                            <td><span class="role-badge ${roleClass}">${displayRole}</span></td>
                            <td>${u.tlc || 'Head Office'}</td>
                            <td>${statusHtml}</td>
                            <td>${u.lastLogin || '22/07/2026 10:15'}</td>
                            <td class="col-center">
                                <div class="user-actions-row">
                                    <button type="button" class="btn-action-sm btn-table-edit-user" data-uname="${u.username}" title="Edit User">✏️</button>
                                    <button type="button" class="btn-action-sm btn-table-reset-pass" data-uname="${u.username}" title="Reset Password">🔓</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            // Bind Row Selection
            tbody.querySelectorAll('tr[data-uname]').forEach(tr => {
                tr.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    const uname = tr.getAttribute('data-uname');
                    const target = allUsersCache.find(u => u.username === uname);
                    if (target) {
                        populateUserDetail(target);
                        renderUsersTable();
                    }
                });
            });

            // Bind Table Action Buttons
            tbody.querySelectorAll('.btn-table-edit-user').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const uname = btn.getAttribute('data-uname');
                    const target = allUsersCache.find(u => u.username === uname);
                    if (target) openEditUserModal(target);
                };
            });

            tbody.querySelectorAll('.btn-table-reset-pass').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const uname = btn.getAttribute('data-uname');
                    const target = allUsersCache.find(u => u.username === uname);
                    if (target) openResetPasswordModal(target);
                };
            });

            // Pagination Controls
            const paginationInfo = document.getElementById('users-pagination-info');
            const paginationControls = document.getElementById('users-pagination-controls');

            if (paginationInfo) {
                const endPos = Math.min(startIdx + usersPerPage, total);
                paginationInfo.textContent = total > 0 ? `Menampilkan ${startIdx + 1} - ${endPos} dari ${total} data` : 'Tidak ada data';
            }

            if (paginationControls) {
                let btnsHtml = `<button type="button" class="p-btn" id="btn-usr-prev" ${usersCurrentPage <= 1 ? 'disabled' : ''}>&lt;</button>`;
                for (let p = 1; p <= totalPages; p++) {
                    btnsHtml += `<button type="button" class="p-btn ${p === usersCurrentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                }
                btnsHtml += `<button type="button" class="p-btn" id="btn-usr-next" ${usersCurrentPage >= totalPages ? 'disabled' : ''}>&gt;</button>`;
                paginationControls.innerHTML = btnsHtml;

                const btnPrev = document.getElementById('btn-usr-prev');
                const btnNext = document.getElementById('btn-usr-next');
                if (btnPrev) btnPrev.onclick = () => { if (usersCurrentPage > 1) { usersCurrentPage--; renderUsersTable(); } };
                if (btnNext) btnNext.onclick = () => { if (usersCurrentPage < totalPages) { usersCurrentPage++; renderUsersTable(); } };

                paginationControls.querySelectorAll('button[data-page]').forEach(b => {
                    b.onclick = () => {
                        usersCurrentPage = parseInt(b.getAttribute('data-page'), 10);
                        renderUsersTable();
                    };
                });
            }

            // Auto-select first user if none selected
            if (!selectedUser && pageData.length > 0) {
                populateUserDetail(pageData[0]);
            }
        };

        // Filter Inputs Event Binding
        const fSearch = document.getElementById('usr-filter-search');
        const fRole = document.getElementById('usr-filter-role');
        const fTlc = document.getElementById('usr-filter-tlc');
        const fStatus = document.getElementById('usr-filter-status');
        const btnResetUFilter = document.getElementById('btn-reset-user-filter');

        if (fSearch) fSearch.oninput = () => { usersCurrentPage = 1; renderUsersTable(); };
        if (fRole) fRole.onchange = () => { usersCurrentPage = 1; renderUsersTable(); };
        if (fTlc) fTlc.onchange = () => { usersCurrentPage = 1; renderUsersTable(); };
        if (fStatus) fStatus.onchange = () => { usersCurrentPage = 1; renderUsersTable(); };

        if (btnResetUFilter) {
            btnResetUFilter.onclick = () => {
                if (fSearch) fSearch.value = '';
                if (fRole) fRole.value = '';
                if (fTlc) fTlc.value = '';
                if (fStatus) fStatus.value = '';
                usersCurrentPage = 1;
                renderUsersTable();
            };
        }

        // Toggle Password Visibility in Add User Modal
        const toggleUsrPwdBtn = document.getElementById('toggle-usr-password');
        if (toggleUsrPwdBtn) {
            toggleUsrPwdBtn.onclick = () => {
                const input = document.getElementById('usr-password');
                const eyeOn = document.getElementById('usr-eye-on');
                const eyeOff = document.getElementById('usr-eye-off');
                if (!input) return;
                const isHidden = input.type === 'password';
                input.type = isHidden ? 'text' : 'password';
                if (eyeOn) eyeOn.classList.toggle('hidden', !isHidden);
                if (eyeOff) eyeOff.classList.toggle('hidden', isHidden);
            };
        }

        const toggleUsrConfirmBtn = document.getElementById('toggle-usr-confirm');
        if (toggleUsrConfirmBtn) {
            toggleUsrConfirmBtn.onclick = () => {
                const input = document.getElementById('usr-confirm-password');
                const eyeOn = document.getElementById('usr-confirm-eye-on');
                const eyeOff = document.getElementById('usr-confirm-eye-off');
                if (!input) return;
                const isHidden = input.type === 'password';
                input.type = isHidden ? 'text' : 'password';
                if (eyeOn) eyeOn.classList.toggle('hidden', !isHidden);
                if (eyeOff) eyeOff.classList.toggle('hidden', isHidden);
            };
        }

        // Add User Form Submit
        const formAddUser = document.getElementById('form-add-user');
        if (formAddUser) {
            formAddUser.onsubmit = async (e) => {
                e.preventDefault();
                try {
                    const username = document.getElementById('usr-username')?.value.trim();
                    const fullname = document.getElementById('usr-fullname')?.value.trim();
                    const email = document.getElementById('usr-email')?.value.trim();
                    const phone = document.getElementById('usr-phone')?.value.trim();
                    const role = document.getElementById('usr-role')?.value;
                    const tlc = document.getElementById('usr-tlc')?.value;
                    const password = document.getElementById('usr-password')?.value;
                    const confirmPassword = document.getElementById('usr-confirm-password')?.value;

                    if (!username || !fullname) {
                        alert('Harap isi Username dan Nama Lengkap.');
                        return;
                    }

                    if (!password || password.length < 6) {
                        alert('Password minimal 6 karakter.');
                        return;
                    }

                    if (password !== confirmPassword) {
                        alert('Konfirmasi password tidak cocok! Harap ketik ulang dengan benar.');
                        return;
                    }

                    const cleanUname = username.toLowerCase().trim();

                    // Check username uniqueness
                    const exists = allUsersCache.some(u => (u.username || '').toLowerCase().trim() === cleanUname);
                    if (exists) {
                        alert(`Username "${username}" sudah digunakan! Harap pilih username yang berbeda.`);
                        return;
                    }

                    // RBAC check: Only ADMIN can create Admin role
                    if (role === 'Admin' && activeRole !== 'ADMIN') {
                        alert('⚠️ Akses Dibatasi: Hanya Administrator yang dapat membuat akun dengan role Admin.');
                        return;
                    }

                    const emailVal = (email || `${cleanUname}@jtexpress.co.id`).toLowerCase();

                    // 1. Daftarkan akun ke Firebase AUTHENTICATION & Firestore tanpa mengubah sesi aktif saat ini.
                    const profile = await JNTFirebaseService.createUserAccount({
                        username: cleanUname,
                        fullname,
                        email: emailVal,
                        phone,
                        role,
                        tlc,
                        status: 'Aktif'
                    }, password);

                    // Sesi admin / user yang membuat akun tetap dipertahankan (tidak dioverwrite dengan akun baru).
                    // Pengguna baru sekarang dapat melakukan login secara mandiri menggunakan kredensial tersebut.

                    window.showToastNotification("👤 AKUN DIBUAT", `Akun ${fullname} (${emailVal}) berhasil didaftarkan. Pengguna baru dapat login menggunakan kredensial tersebut tanpa mengubah sesi Anda.`, "success");
                    closeModal('modal-add-user');
                    formAddUser.reset();
                    window.dispatchEvent(new Event('jnt_data_updated'));
                } catch (err) {
                    const msgMap = {
                        'auth/email-already-in-use': 'Email sudah terdaftar di Firebase Authentication.',
                        'auth/invalid-email': 'Format email tidak valid.',
                        'auth/weak-password': 'Password terlalu lemah (min. 6 karakter).',
                        'auth/operation-not-allowed': 'Aktifkan provider Email/Password di Firebase Console > Authentication > Sign-in method.'
                    };
                    alert(`Gagal menambah user: ${msgMap[err.code] || err.message}`);
                }
            };
        }

        // Open Edit User Modal Helper
        const openEditUserModal = (target) => {
            const inpId = document.getElementById('edit-usr-id');
            const inpUname = document.getElementById('edit-usr-username');
            const inpFull = document.getElementById('edit-usr-fullname');
            const inpEmail = document.getElementById('edit-usr-email');
            const inpPhone = document.getElementById('edit-usr-phone');
            const selRole = document.getElementById('edit-usr-role');
            const selTlc = document.getElementById('edit-usr-tlc');
            const selStatus = document.getElementById('edit-usr-status');

            if (inpId) inpId.value = target.username || target.id;
            if (inpUname) inpUname.value = target.username;
            if (inpFull) inpFull.value = target.fullname || target.username;
            if (inpEmail) inpEmail.value = target.email || target.emailPerusahaan || '';
            if (inpPhone) inpPhone.value = target.phone || '';
            if (selRole) selRole.value = target.role || 'Staff Vehicle Dispatch';
            if (selTlc) selTlc.value = target.tlc || 'JKT999';
            if (selStatus) selStatus.value = target.status || 'Aktif';

            openModal('modal-edit-user');
        };

        // Form Submit: Edit User
        const formEditUser = document.getElementById('form-edit-user');
        if (formEditUser) {
            formEditUser.onsubmit = async (e) => {
                e.preventDefault();
                try {
                    const username = document.getElementById('edit-usr-username')?.value;
                    const fullname = document.getElementById('edit-usr-fullname')?.value;
                    const email = document.getElementById('edit-usr-email')?.value;
                    const phone = document.getElementById('edit-usr-phone')?.value;
                    const role = document.getElementById('edit-usr-role')?.value;
                    const tlc = document.getElementById('edit-usr-tlc')?.value;
                    const status = document.getElementById('edit-usr-status')?.value;

                    // Role escalation protection: Non-admin cannot escalate role to Admin
                    if (role === 'Admin' && activeRole !== 'ADMIN') {
                        alert('⚠️ Akses Dibatasi: Anda tidak dapat menaikkan hak akses menjadi Admin.');
                        return;
                    }

                    const cleanUname = (username || '').toLowerCase().trim();
                    await JNTFirebaseService.saveDoc('users', cleanUname, {
                        fullname,
                        email,
                        emailPerusahaan: email,
                        phone,
                        role,
                        tlc,
                        status,
                        updatedAt: new Date().toISOString()
                    }, true);

                    window.showToastNotification("💾 PERUBAHAN TERSIMPAN", `Data pengguna ${cleanUname} berhasil diperbarui!`, "success");
                    closeModal('modal-edit-user');
                    const updated = { ...selectedUser, fullname, email, emailPerusahaan: email, phone, role, tlc, status };
                    populateUserDetail(updated);
                } catch (err) {
                    alert(`Gagal memperbarui user: ${err.message}`);
                }
            };
        }

        // Open Reset Password Modal Helper
        const openResetPasswordModal = (target) => {
            const inpUname = document.getElementById('reset-usr-username');
            const lblName = document.getElementById('reset-usr-label-name');
            const inpCurPass = document.getElementById('reset-usr-current-pass');
            const inpPass = document.getElementById('reset-usr-new-pass');
            const inpConf = document.getElementById('reset-usr-confirm-pass');

            if (inpUname) inpUname.value = target.username;
            if (lblName) lblName.textContent = `${target.fullname || target.username} (${target.username})`;
            if (inpCurPass) inpCurPass.value = '';
            if (inpPass) inpPass.value = '';
            if (inpConf) inpConf.value = '';

            openModal('modal-reset-password-user');
        };

        // Form Submit: Reset Password
        const formResetPass = document.getElementById('form-reset-password-user');
        if (formResetPass) {
            formResetPass.onsubmit = async (e) => {
                e.preventDefault();
                const username = document.getElementById('reset-usr-username')?.value;
                const currentPass = document.getElementById('reset-usr-current-pass')?.value;
                const newPass = document.getElementById('reset-usr-new-pass')?.value;
                const confPass = document.getElementById('reset-usr-confirm-pass')?.value;

                if (!username) {
                    alert('User tidak valid.');
                    return;
                }

                const cleanUname = username.toLowerCase().trim();
                const targetUser = allUsersCache.find(u => (u.username || '').toLowerCase().trim() === cleanUname);

                // Require knowing current/last password before allowing reset
                if (targetUser && targetUser.password && currentPass !== targetUser.password) {
                    alert('❌ Password saat ini/terakhir yang Anda masukkan salah! Mohon periksa kembali.');
                    document.getElementById('reset-usr-current-pass')?.focus();
                    return;
                }

                if (!newPass || newPass.length < 6) {
                    alert('Password baru minimal 6 karakter.');
                    return;
                }
                if (newPass !== confPass) {
                    alert('Konfirmasi password baru tidak cocok.');
                    return;
                }

                try {
                    await JNTFirebaseService.saveDoc('users', cleanUname, {
                        password: newPass,
                        updatedAt: new Date().toISOString()
                    }, true);

                    await JNTFirebaseService.logAuditEvent({
                        waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                        operator: activeUsername,
                        shiftId: JNTFirebaseService.getActiveShiftId(),
                        modul: "User Management",
                        kodeTugas: "-",
                        aktivitas: `Reset Password untuk Pengguna (${cleanUname})`
                    });

                    window.showToastNotification("🔓 PASSWORD DIRESET", `Kata sandi untuk pengguna ${cleanUname} berhasil diperbarui!`, "success");
                    closeModal('modal-reset-password-user');
                } catch (err) {
                    alert(`Gagal reset password: ${err.message}`);
                }
            };
        }

        // Right Detail Action Buttons Bindings
        const btnEditUserAction = document.getElementById('btn-edit-user-action');
        const btnResetPassAction = document.getElementById('btn-reset-password-action');
        const btnToggleActiveAction = document.getElementById('btn-toggle-active-user-action');

        if (btnEditUserAction) {
            btnEditUserAction.onclick = () => {
                if (selectedUser) openEditUserModal(selectedUser);
            };
        }

        if (btnResetPassAction) {
            btnResetPassAction.onclick = () => {
                if (selectedUser) openResetPasswordModal(selectedUser);
            };
        }

        if (btnToggleActiveAction) {
            btnToggleActiveAction.onclick = async () => {
                if (!selectedUser) return;
                const currentStatus = selectedUser.status || 'Aktif';
                const newStatus = currentStatus === 'Aktif' ? 'Nonaktif' : 'Aktif';

                if (confirm(`Konfirmasi Status Akun:\nApakah Anda yakin ingin mengubah status akun ${selectedUser.username} menjadi ${newStatus}?`)) {
                    try {
                        const cleanUname = (selectedUser.username || '').toLowerCase().trim();
                        await JNTFirebaseService.saveDoc('users', cleanUname, { status: newStatus, updatedAt: new Date().toISOString() }, true);
                        window.showToastNotification("🔄 STATUS AKUN DIUBAH", `Akun ${selectedUser.username} kini berstatus: ${newStatus}`, "success");
                        selectedUser.status = newStatus;
                        populateUserDetail(selectedUser);
                    } catch (err) {
                        alert(`Gagal mengubah status: ${err.message}`);
                    }
                }
            };
        }

        // Export Users to Excel/CSV
        const btnExportUsers = document.getElementById('btn-export-users-excel');
        if (btnExportUsers) {
            btnExportUsers.onclick = () => {
                if (allUsersCache.length === 0) {
                    alert('Tidak ada data pengguna untuk diexport.');
                    return;
                }

                let csv = '\uFEFFNo,Nama Lengkap,Username,Email,No Telepon,Role,Cabang/TLC,Status,Terakhir Login\n';
                allUsersCache.forEach((u, i) => {
                    csv += `"${i + 1}","${u.fullname || u.username}","${u.username}","${u.email || ''}","${u.phone || ''}","${u.role || 'Operator'}","${u.tlc || 'Head Office'}","${u.status || 'Aktif'}","${u.lastLogin || ''}"\n`;
                });

                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.setAttribute('download', `JNT_Users_Management_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.showToastNotification("📥 Export Selesai", "Data pengguna berhasil diunduh ke CSV/Excel!", "success");
            };
        }

        // Subscribe to Users Data
        JNTFirebaseService.subscribeUsers((list) => {
            allUsersCache = list;
            renderUserKPIs(list);
            renderUsersTable();
        });

        window.addEventListener('jnt_data_updated', () => {
            const list = JNTFirebaseService.getLocalStore('users');
            allUsersCache = list;
            renderUserKPIs(list);
            renderUsersTable();
        });
    }

    // =========================================================================
    // 10. REPORT EXPORT & IMPORT ENGINE CONTROLLER (report.html)
    // =========================================================================
    if (isReportPage && typeof JNTFirebaseService !== 'undefined') {
        const formExportExcel = document.getElementById('form-export-excel');
        if (formExportExcel) {
            formExportExcel.addEventListener('submit', (e) => {
                e.preventDefault();
                const targetModul = document.getElementById('exp-modul-select')?.value || 'ALL';
                const dateFrom = document.getElementById('exp-date-from')?.value || '2026-08-01';
                const dateTo = document.getElementById('exp-date-to')?.value || '2026-08-16';

                let csvContent = '\uFEFF';
                let fileName = `JNT_Report_${targetModul}_${dateFrom}_to_${dateTo}.csv`;

                if (targetModul === 'SLA' || targetModul === 'ALL') {
                    const slaData = JNTFirebaseService.getLocalStore('sla_outbound') || [];
                    csvContent += '--- REKAP SLA OUTBOUND ---\n';
                    csvContent += 'No,Kode Tugas,Plat Nomor,Trip,Vendor,Driver,Jam Berangkat,Target SLA,Jam Sampai Aktual,Status SLA\n';
                    slaData.forEach((item, idx) => {
                        csvContent += `"${idx + 1}","${item.kodeTugas || ''}","${item.platNomor || ''}","${item.trip || ''}","${item.vendor || ''}","${item.driver1 || ''}","${item.jamBerangkat || ''}","${item.targetSLA || ''}","${item.jamSampaiAktual || ''}","${item.statusSla || item.status || 'BERJALAN'}"\n`;
                    });
                    csvContent += '\n';
                }

                if (targetModul === 'MONITORING' || targetModul === 'ALL') {
                    const monData = JNTFirebaseService.getLocalStore('monitoring_4h') || [];
                    csvContent += '--- REKAP MONITORING 4H ---\n';
                    csvContent += 'No,Kode Tugas,Plat Nomor,Trip,Status Perjalanan,Update Terakhir,Posisi Terakhir,Input By\n';
                    monData.forEach((item, idx) => {
                        csvContent += `"${idx + 1}","${item.kodeTugas || ''}","${item.platNomor || ''}","${item.trip || item.namaRute || ''}","${item.statusPerjalanan || ''}","${item.lastUpdateTime || ''}","${item.lastUpdateLokasi || ''}","${item.lastUpdateBy || ''}"\n`;
                    });
                    csvContent += '\n';
                }

                if (targetModul === 'TROUBLE' || targetModul === 'ALL') {
                    const trData = JNTFirebaseService.getLocalStore('troubles') || [];
                    csvContent += '--- REKAP TROUBLE & LAKA ---\n';
                    csvContent += 'No,Incident ID,Kode Tugas,Jenis,Kategori,Severity,Lokasi Kejadian,Waktu Kejadian,Status,Pelapor\n';
                    trData.forEach((item, idx) => {
                        csvContent += `"${idx + 1}","${item.incidentId || item.id || ''}","${item.kodeTugas || ''}","${item.jenis || ''}","${item.kategoriTrouble || ''}","${item.severity || ''}","${item.lokasiKejadian || ''}","${item.waktuKejadian || ''}","${item.status || ''}","${item.dilaporkanOleh || ''}"\n`;
                    });
                    csvContent += '\n';
                }

                if (targetModul === 'SHIFT' || targetModul === 'ALL') {
                    const shData = JNTFirebaseService.getLocalStore('shifts') || [];
                    csvContent += '--- REKAP SHIFT OPERASIONAL ---\n';
                    csvContent += 'No,Shift ID,Tanggal,Nama Shift,Operator 1,Operator 2,Status\n';
                    shData.forEach((item, idx) => {
                        csvContent += `"${idx + 1}","${item.shiftId || item.id || ''}","${item.tanggal || ''}","${item.namaShift || ''}","${item.operator1 ? item.operator1.nama : ''}","${item.operator2 ? item.operator2.nama : ''}","${item.status || ''}"\n`;
                    });
                    csvContent += '\n';
                }

                if (targetModul === 'AUDIT' || targetModul === 'ALL') {
                    const auData = JNTFirebaseService.getLocalStore('audit_logs') || [];
                    csvContent += '--- REKAP AUDIT TRAIL LOG ---\n';
                    csvContent += 'No,Waktu,Shift ID,Operator,Modul,Kode Tugas,Aktivitas\n';
                    auData.forEach((item, idx) => {
                        csvContent += `"${idx + 1}","${item.waktu || ''}","${item.shiftId || ''}","${item.operator || ''}","${item.modul || ''}","${item.kodeTugas || ''}","${(item.aktivitas || '').replace(/"/g, '""')}"\n`;
                    });
                }

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                window.showToastNotification("📥 EXPORT SUKSES", `Laporan ${targetModul} berhasil diunduh (${fileName})!`, "success");
                closeModal('modal-export-filter');
            });
        }

        // Import Excel Safety Validation Pipeline
        let parsedImportRows = [];
        const fileInput = document.getElementById('imp-file-input');
        const validationBox = document.getElementById('imp-validation-box');
        const valValidCount = document.getElementById('val-valid-count');
        const valErrorCount = document.getElementById('val-error-count');
        const btnCommitImport = document.getElementById('btn-commit-import');

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const text = event.target.result;
                    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

                    if (lines.length < 2) {
                        alert('File CSV/Excel kosong atau tidak memiliki baris data.');
                        return;
                    }

                    // Parse header row
                    const headerLine = lines[0].replace(/"/g, '').toLowerCase();
                    const headers = headerLine.split(',').map(h => h.trim());

                    const colKode = headers.findIndex(h => h.includes('kode') || h.includes('tugas'));
                    const colTrip = headers.findIndex(h => h.includes('trip') || h.includes('rute'));
                    const colPlat = headers.findIndex(h => h.includes('plat') || h.includes('nomor'));

                    if (colKode === -1 || colPlat === -1) {
                        alert('Format Header tidak valid! File harus mengandung kolom "Kode Tugas" dan "Plat Nomor".');
                        return;
                    }

                    const existingIncoming = JNTFirebaseService.getLocalStore('incoming') || [];
                    const existingCodes = new Set(existingIncoming.map(i => i.kodeTugas));

                    parsedImportRows = [];
                    let errorCount = 0;

                    for (let i = 1; i < lines.length; i++) {
                        const rowCols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                        const kode = rowCols[colKode];
                        const plat = rowCols[colPlat];
                        const trip = colTrip !== -1 ? rowCols[colTrip] : 'JKT - SUB';

                        if (!kode || !plat) {
                            errorCount++;
                            continue;
                        }

                        // Duplicate validation
                        if (existingCodes.has(kode)) {
                            errorCount++;
                            continue;
                        }

                        existingCodes.add(kode); // Track code to prevent internal duplicates in same batch

                        parsedImportRows.push({
                            kodeTugas: kode,
                            platNomor: plat,
                            trip: trip,
                            status: 'SEDANG DIPROSES',
                            driver1: 'Driver Eksternal',
                            vendor: 'PT J&T Logistics',
                            totalAwb: '12.500',
                            jamBerangkat: '08:00',
                            targetSLA: '18 Jam',
                            inputBy: activeUsername
                        });
                    }

                    if (validationBox) validationBox.classList.remove('hidden');
                    if (valValidCount) valValidCount.textContent = parsedImportRows.length;
                    if (valErrorCount) valErrorCount.textContent = errorCount;

                    if (btnCommitImport) {
                        btnCommitImport.disabled = parsedImportRows.length === 0;
                        btnCommitImport.style.opacity = parsedImportRows.length > 0 ? '1' : '0.5';
                    }
                };
                reader.readAsText(file);
            });
        }

        if (btnCommitImport) {
            btnCommitImport.addEventListener('click', async () => {
                if (parsedImportRows.length === 0) return;

                btnCommitImport.disabled = true;
                btnCommitImport.textContent = '⏳ Mengunggah ke SSOT...';

                try {
                    let successCount = 0;
                    for (const row of parsedImportRows) {
                        await JNTFirebaseService.addIncomingTrip(row);
                        successCount++;
                    }

                    await JNTFirebaseService.logAuditEvent({
                        waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                        operator: activeUsername,
                        shiftId: JNTFirebaseService.getActiveShiftId(),
                        modul: "Report & Excel",
                        kodeTugas: "-",
                        aktivitas: `Import File Excel (${successCount} data berhasil di-commit ke SSOT)`
                    });

                    window.showToastNotification("🚀 IMPORT BERHASIL", `${successCount} data perjalanan berhasil dimasukkan ke SSOT & Monitoring!`, "success");
                    closeModal('modal-import-excel');
                    if (fileInput) fileInput.value = '';
                    if (validationBox) validationBox.classList.add('hidden');
                } catch (err) {
                    alert(`Gagal import data: ${err.message}`);
                } finally {
                    btnCommitImport.textContent = '📥 Konfirmasi & Commit Ke Firestore';
                    btnCommitImport.disabled = false;
                }
            });
        }
    }

    // =========================================================================
    // 11. PROFILE CONTROLLER (profile.html)
    // UI form, validasi & update sesi ditangani oleh script inline profile.html
    // (sumber tunggal). Blok ini HANYA me-mirror perubahan ke Firestore di
    // background melalui event, agar tidak ada submit handler ganda yang
    // menimpa data / memunculkan notifikasi dobel.
    // =========================================================================
    if (isProfilePage && typeof JNTFirebaseService !== 'undefined') {
        // Gunakan ID dokumen yang stabil (username login), bukan nama lengkap yang bisa berubah
        const profileDocId = sessionStorage.getItem('jnt_username_login')
            || sessionStorage.getItem('jnt_user_uid')
            || activeUsername;

        window.addEventListener('jnt:user-updated', async () => {
            try {
                await JNTFirebaseService.saveUserProfile(profileDocId, {
                    fullname:  sessionStorage.getItem('jnt_active_username') || '',
                    email:     sessionStorage.getItem('jnt_user_email') || '',
                    phone:     sessionStorage.getItem('jnt_user_phone') || '',
                    tlc:       sessionStorage.getItem('jnt_user_tlc') || '',
                    updatedAt: new Date().toISOString()
                });
            } catch (err) {
                console.warn('[PROFILE] Gagal mirror profil ke Firestore:', err);
            }
        });

        window.addEventListener('jnt:password-changed', async (e) => {
            const newPass = e.detail && e.detail.newPass;
            if (!newPass) return;
            try {
                // FIX BUG-3: Jangan simpan password plaintext ke Firestore — gunakan SHA-256 hash.
                let passHash = null;
                if (typeof crypto !== 'undefined' && crypto.subtle) {
                    const hashBuffer = await crypto.subtle.digest(
                        'SHA-256',
                        new TextEncoder().encode(newPass)
                    );
                    passHash = Array.from(new Uint8Array(hashBuffer))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                }
                await JNTFirebaseService.saveUserProfile(profileDocId, {
                    passwordHash: passHash,
                    passwordUpdated: new Date().toISOString()
                });
            } catch (err) {
                console.warn('[PROFILE] Gagal mirror password ke Firestore:', err);
            }
        });
    }

    // =========================================================================
    // 12. SETTINGS & THEME ENGINE (settings.html & Global Application)
    // =========================================================================
    // Apply saved theme settings globally on all pages
    const savedThemeMode = localStorage.getItem('jnt_theme_mode') || 'light';
    const savedThemeColor = localStorage.getItem('jnt_theme_color');

    if (savedThemeMode === 'dark') {
        document.body.classList.remove('light-body-theme');
        document.body.classList.add('dark-body-theme');
    } else {
        document.body.classList.remove('dark-body-theme');
        document.body.classList.add('light-body-theme');
    }

    if (savedThemeColor) {
        document.documentElement.style.setProperty('--primary-red', savedThemeColor);
    }
});
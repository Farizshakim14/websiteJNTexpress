/**
 * J&T Express - Transportation Monitoring System
 * App Controller & UI Interactivity Logic (v5 — Full Security Hardening, RBAC Permission Matrix, Notification Center & Backup Engine)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
    // LOCAL ACCOUNT SYSTEM (No Firebase Auth required)
    // ----------------------------------------------------

    // ===== LOCAL ACCOUNTS SEED (Hanya inisialisasi sekali — tidak pernah menimpa akun runtime) =====
    // FIX BUG-5: Sebelumnya LOCAL_ACCOUNTS di-overwrite setiap halaman dibuka, menghapus akun runtime.
    // Sekarang hanya diisi jika belum ada data — akun yang dibuat administrator di users.html tetap terjaga.
    const LOCAL_ACCOUNTS_SEED = [
        {
            username: 'devoleper',
            email: 'devoleper',
            password: 'dev123',
            fullname: 'Developer Admin',
            role: 'ADMIN',
            status: 'Aktif',
            uid: 'dev-001',
            nik: 'JNT-DEV-0001',
            jabatan: 'Developer & System Administrator',
            tlc: 'Head Office Jakarta',
            departemen: 'IT & Development',
            phone: '0812-0000-0001',
            emailPerusahaan: 'developer@jtexpress.co.id',
            bergabung: '1 Januari 2026'
        }
    ];

    // Hanya inisialisasi jika belum ada data — jangan pernah timpa akun yang sudah ada
    if (!localStorage.getItem('jnt_local_accounts')) {
        localStorage.setItem('jnt_local_accounts', JSON.stringify(LOCAL_ACCOUNTS_SEED));
    }

    const path = window.location.pathname;
    const pageName = path.split('/').pop() || 'index.html';

    const publicPages = ['index.html', 'login.html', ''];
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
    // LOGIN FORM HANDLERS (index.html / login.html)
    // ----------------------------------------------------
    const loginForm = document.getElementById('login-form');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const alertBox = document.getElementById('alert-box');
    const alertMessage = document.getElementById('alert-message');

    // ── System Status Badge ──────────────────────────────────────────────────
    // Detects whether Firebase is live or in local-only mode and updates the
    // status bar in the login card. No credentials are exposed.
    (function updateSystemStatusBar() {
        const dotEl   = document.getElementById('status-dot');
        const labelEl = document.getElementById('status-label');
        const footerAuthEl = document.getElementById('footer-auth-mode');
        if (!dotEl || !labelEl) return;

        const isPlaceholder = typeof window.isFirebaseConfigPlaceholder === 'function'
            ? window.isFirebaseConfigPlaceholder()
            : true; // assume placeholder if function not available yet

        if (isPlaceholder) {
            dotEl.className   = 'status-dot local';
            labelEl.textContent = 'Mode lokal aktif — autentikasi berbasis akun sistem';
            if (footerAuthEl) footerAuthEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> Mode: Lokal`;
        } else {
            dotEl.className   = 'status-dot online';
            labelEl.textContent = 'Sistem terhubung — Firebase Authentication aktif';
            if (footerAuthEl) footerAuthEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> Mode: Firebase`;
        }
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
        // Guard: track submission state to prevent double-submit
        let _loginInProgress = false;

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
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

            // Authenticate after brief UX delay
            setTimeout(() => {
                // === LOCAL AUTHENTICATION ===
                const accounts = JSON.parse(localStorage.getItem('jnt_local_accounts') || '[]');
                const matched  = accounts.find(acc =>
                    (acc.username === username || acc.email === username) &&
                    acc.password  === password &&
                    acc.status    === 'Aktif'
                );

                if (matched) {
                    // ── Remember Me: save username only, never password ──
                    const rememberBox = document.getElementById('remember-me');
                    if (rememberBox && rememberBox.checked) {
                        localStorage.setItem('jnt_remember_username', username);
                    } else {
                        localStorage.removeItem('jnt_remember_username');
                    }

                    // Set session
                    sessionStorage.setItem('jnt_is_logged_in',    'true');
                    sessionStorage.setItem('jnt_active_username', matched.fullname);
                    sessionStorage.setItem('jnt_user_role',       matched.role);
                    sessionStorage.setItem('jnt_user_uid',        matched.uid);
                    sessionStorage.setItem('jnt_user_email',      matched.emailPerusahaan);
                    sessionStorage.setItem('jnt_user_phone',      matched.phone || '');
                    sessionStorage.setItem('jnt_user_nik',        matched.nik || '');
                    sessionStorage.setItem('jnt_user_jabatan',    matched.jabatan || '');
                    sessionStorage.setItem('jnt_user_tlc',        matched.tlc || '');
                    sessionStorage.setItem('jnt_user_departemen', matched.departemen || '');
                    sessionStorage.setItem('jnt_user_bergabung',  matched.bergabung || '');
                    sessionStorage.setItem('jnt_username_login',  matched.username);

                    window.location.href = 'dashboard.html';
                } else {
                    // ── Login failed: safe, non-technical error messages ──
                    _loginInProgress = false;
                    let displayMsg = 'Username atau password salah. Periksa kembali dan coba lagi.';
                    const userExists = accounts.find(acc => acc.username === username || acc.email === username);
                    if (userExists && userExists.status !== 'Aktif') {
                        displayMsg = 'Akun Anda tidak aktif. Hubungi Administrator untuk bantuan.';
                    }

                    if (alertBox) {
                        if (alertMessage) alertMessage.textContent = displayMsg;
                        alertBox.classList.remove('hidden');
                    }

                    if (btnSpinner) btnSpinner.classList.add('hidden');
                    if (btnText) btnText.style.opacity = '1';
                    if (btnLogin) btnLogin.disabled = false;
                }
            }, 800); // 800ms loading simulation
        });
    }

    // ===================================================================
    // GLOBAL USER IDENTITY SYNC — Runs on every page after login
    // Updates ALL user-related UI elements from sessionStorage so every
    // page is consistent with the currently logged-in account.
    // ===================================================================
    (function syncUserIdentityAcrossAllPages() {
        // FIX BUG-2 (UI): Hapus fallback hardcoded ke 'Developer Admin' / 'ADMIN'.
        // Jika sesi tidak ada, tampilkan string kosong — jangan inject nilai privilege default.
        const fullname  = sessionStorage.getItem('jnt_active_username') || '';
        const role      = sessionStorage.getItem('jnt_user_role')       || '';
        if (!fullname && !role) return; // Jika tidak ada sesi aktif, jangan update UI
        const avatarUrl = 'https://ui-avatars.com/api/?name='
            + encodeURIComponent(fullname)
            + '&background=E30613&color=fff&bold=true&size=150';

        // 1. Sidebar: username text
        document.querySelectorAll('#sidebar-user-name').forEach(el => {
            el.textContent = fullname;
        });

        // 2. Sidebar: role/jabatan badge
        document.querySelectorAll('.profile-role').forEach(el => {
            el.textContent = role;
        });

        // 3. Sidebar: avatar image
        document.querySelectorAll('.user-avatar-img').forEach(img => {
            img.src = avatarUrl + '&size=150';
            img.alt = fullname + ' Avatar';
        });

        // 4. Topbar chip: username text (handles multiple selectors used across pages)
        document.querySelectorAll(
            '#topbar-user-name, #dash-user-name, .inc-user-name'
        ).forEach(el => {
            // preserve the ▾ / v chevron span inside if present
            const chevron = el.querySelector('span');
            el.textContent = fullname;
            if (chevron) {
                el.appendChild(chevron);
            } else {
                const v = document.createElement('span');
                v.textContent = 'v';
                el.appendChild(v);
            }
        });

        // 5. Topbar chip: role text
        document.querySelectorAll('.inc-user-role').forEach(el => {
            el.textContent = role;
        });

        // 6. Topbar chip: avatar image
        document.querySelectorAll('.inc-avatar-img').forEach(img => {
            img.src = avatarUrl + '&size=100';
            img.alt = fullname + ' Avatar';
        });
    })();


    // PERMISSION MATRIX ROUTE GUARD
    const rolePermissions = {
        'ADMIN': ['*'],
        'SUPERVISOR': ['dashboard.html', 'monitoring.html', 'sla-vendor.html', 'trouble.html', 'shift-management.html', 'report.html', 'audit.html', 'profile.html'],
        'OPERATOR_SLA': ['dashboard.html', 'sla-vendor.html', 'monitoring.html', 'trouble.html', 'report.html', 'profile.html'],
        'OPERATOR_MONITORING': ['dashboard.html', 'monitoring.html', 'trouble.html', 'sla-vendor.html', 'report.html', 'profile.html']
    };

    const restrictedPagesForSLA = ['master.html', 'users.html', 'settings.html'];
    const restrictedPagesForMonitoring = ['master.html', 'users.html', 'settings.html'];
    const restrictedPagesForSupervisor = ['master.html', 'users.html', 'settings.html'];

    // RBAC — Pembatasan akses berdasarkan role
    // Catatan: Guard 3 di atas sudah memastikan activeRole adalah nilai yang valid.
    // Blok ini hanya membatasi halaman spesifik per role yang lebih rendah.
    if (activeRole === 'SUPERVISOR' && restrictedPagesForSupervisor.includes(pageName)) {
        alert(`⚠️ Akses Dibatasi: Peran SUPERVISOR tidak memiliki wewenang untuk mengakses halaman ${pageName}.\nAnda telah diarahkan kembali ke Dashboard.`);
        window.location.href = 'dashboard.html';
        return;
    }

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

    // Reusable Authentic Logout Trigger
    function performLogout() {
        if (confirm('Konfirmasi Keluar: Apakah Anda yakin ingin keluar dari sistem?')) {
            sessionStorage.clear();
            window.location.href = 'index.html';
        }
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
                <div class="dropdown-user-header">
                    <strong>${activeUsername}</strong>
                    <span>Peran: ${activeRole}</span>
                </div>
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

            chip.setAttribute('role', 'button');
            chip.setAttribute('aria-haspopup', 'true');
            chip.setAttribute('aria-expanded', 'false');

            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.topbar-user-dropdown.show').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                const isShown = dropdown.classList.toggle('show');
                chip.setAttribute('aria-expanded', isShown ? 'true' : 'false');
            });

            const logoutBtn = dropdown.querySelector('.btn-dropdown-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    performLogout();
                });
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

                    const notifSummary = alertsList.map((a, i) => `${i + 1}. ${a.title}\n   ${a.message}`).join('\n\n');
                    alert(`🔔 NOTIFICATION CENTER (${alertsList.length} Alerts):\n----------------------------------------\n${notifSummary}`);
                };
            });
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

        // D. Render Real-Time Audit Trail Table
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
                        dilaporkanOleh: activeUsername
                    });

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

                    const updated = await JNTFirebaseService.updateIncidentStatus(id, newStatus, catatan, petugas);
                    window.showToastNotification("🔄 STATUS DIPERBARUI", `Status incident berhasil diubah menjadi: ${newStatus}`, "success");
                    closeModal('modal-update-status-trouble');
                    formUpdateStatus.reset();
                    if (updated) populateTroubleDetail(updated);
                } catch (err) {
                    alert(`Gagal memperbarui status: ${err.message}`);
                }
            });
        }

        // Tutup Kejadian Button (Instant resolution)
        const btnCloseIncident = document.getElementById('btn-close-incident');
        if (btnCloseIncident) {
            btnCloseIncident.addEventListener('click', async () => {
                if (!selectedIncident) {
                    alert('Pilih kejadian terlebih dahulu.');
                    return;
                }
                if (selectedIncident.status === 'SUDAH SELESAI' || selectedIncident.status === 'SELESAI') {
                    alert('Kejadian ini sudah berstatus SUDAH SELESAI.');
                    return;
                }

                if (confirm(`Konfirmasi Tutup Kejadian:\nApakah Anda yakin ingin menyelesaikan kendala untuk ${selectedIncident.kodeTugas || selectedIncident.incidentId}?\nStatus armada akan dipulihkan ke ON PROGRESS.`)) {
                    try {
                        const id = selectedIncident.id || selectedIncident.incidentId;
                        const updated = await JNTFirebaseService.updateIncidentStatus(id, 'SUDAH SELESAI', 'Kendala diselesaikan dan armada melanjutkan perjalanan.', activeUsername);
                        window.showToastNotification("✅ KEJADIAN SELESAI", "Kendala ditutup. Armada dan monitoring berhasil dipulihkan ke status aktif.", "success");
                        if (updated) populateTroubleDetail(updated);
                    } catch (err) {
                        alert(`Gagal menutup kejadian: ${err.message}`);
                    }
                }
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

        // Render User KPI Counters
        const renderUserKPIs = (list) => {
            const total = list.length;
            const adminCount = list.filter(u => (u.role || '').toUpperCase() === 'ADMIN').length;
            const spvCount = list.filter(u => (u.role || '').toUpperCase() === 'SUPERVISOR').length;
            const opCount = list.filter(u => (u.role || '').toUpperCase().includes('OPERATOR')).length;
            const inactiveCount = list.filter(u => (u.status || '').toUpperCase() === 'NONAKTIF' || (u.status || '').toUpperCase() === 'INACTIVE').length;

            const elTot = document.getElementById('usr-kpi-total');
            const elAdm = document.getElementById('usr-kpi-admin');
            const elSpv = document.getElementById('usr-kpi-spv');
            const elOp = document.getElementById('usr-kpi-op');
            const elInact = document.getElementById('usr-kpi-inactive');

            if (elTot) elTot.textContent = total;
            if (elAdm) elAdm.textContent = adminCount;
            if (elSpv) elSpv.textContent = spvCount;
            if (elOp) elOp.textContent = opCount;
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

            if (dtAvatar) dtAvatar.src = u.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
            if (dtName) dtName.textContent = u.fullname || u.username;
            if (dtUname) dtUname.textContent = u.username;
            if (dtRole) dtRole.textContent = u.role || 'Operator';
            if (dtEmail) dtEmail.textContent = u.email || `${u.username.toLowerCase()}@jtexpress.co.id`;
            if (dtPhone) dtPhone.textContent = u.phone || '-';
            if (dtRoleItem) dtRoleItem.textContent = u.role || 'Operator';
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
                    const isActive = (u.status || 'Aktif').toLowerCase() === 'aktif';
                    const roleClass = (u.role || '').toLowerCase().includes('admin') ? 'role-admin' : ((u.role || '').toLowerCase().includes('supervisor') ? 'role-supervisor' : 'role-operator');
                    const photo = u.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80';

                    return `
                        <tr class="inc-row user-row ${isSelected ? 'active-selected' : ''}" data-uname="${u.username}" style="cursor: pointer;">
                            <td class="col-center">${rowNum}</td>
                            <td><img src="${photo}" class="user-row-avatar"></td>
                            <td><strong>${u.fullname || u.username}</strong></td>
                            <td class="text-dim">${u.username}</td>
                            <td class="text-dim">${u.email || '-'}</td>
                            <td><span class="role-badge ${roleClass}">${u.role || 'Operator'}</span></td>
                            <td>${u.tlc || 'Head Office'}</td>
                            <td><span class="${isActive ? 'status-dot-active' : 'status-dot-inactive'}">${isActive ? '🟢 Aktif' : '🔴 Nonaktif'}</span></td>
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

                    if (!username || !fullname) {
                        alert('Harap isi Username dan Nama Lengkap.');
                        return;
                    }

                    // Check username uniqueness
                    const exists = allUsersCache.some(u => u.username.toLowerCase() === username.toLowerCase());
                    if (exists) {
                        alert(`Username "${username}" sudah digunakan! Harap pilih username yang berbeda.`);
                        return;
                    }

                    // RBAC check: Only ADMIN can create Admin role
                    if (role === 'Admin' && activeRole !== 'ADMIN') {
                        alert('⚠️ Akses Dibatasi: Hanya Administrator yang dapat membuat akun dengan role Admin.');
                        return;
                    }

                    const emailVal = email || `${username.toLowerCase()}@jtexpress.co.id`;
                    if (window.auth && !window.isFirebaseConfigPlaceholder?.()) {
                        try {
                            await JNTFirebaseService.createUserAccount({
                                username,
                                fullname,
                                email: emailVal,
                                phone,
                                role,
                                tlc,
                                status: 'Aktif'
                            }, 'JntExpress2026!');
                        } catch (authErr) {
                            console.warn("Firebase Auth creation:", authErr.message);
                            await JNTFirebaseService.saveUserProfile(username, {
                                username,
                                fullname,
                                email: emailVal,
                                phone,
                                role,
                                tlc,
                                status: 'Aktif',
                                createdAt: new Date().toISOString()
                            });
                        }
                    } else {
                        await JNTFirebaseService.saveUserProfile(username, {
                            username,
                            fullname,
                            email: emailVal,
                            phone,
                            role,
                            tlc,
                            status: 'Aktif',
                            createdAt: new Date().toISOString()
                        });
                    }

                    window.showToastNotification("👤 USER DIBUAT", `Pengguna ${fullname} (${username}) berhasil didaftarkan!`, "success");
                    closeModal('modal-add-user');
                    formAddUser.reset();
                } catch (err) {
                    alert(`Gagal menambah user: ${err.message}`);
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

            if (inpId) inpId.value = target.id || target.username;
            if (inpUname) inpUname.value = target.username;
            if (inpFull) inpFull.value = target.fullname || target.username;
            if (inpEmail) inpEmail.value = target.email || '';
            if (inpPhone) inpPhone.value = target.phone || '';
            if (selRole) selRole.value = target.role || 'Operator';
            if (selTlc) selTlc.value = target.tlc || 'Head Office';
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

                    await JNTFirebaseService.saveUserProfile(username, {
                        fullname,
                        email,
                        phone,
                        role,
                        tlc,
                        status
                    });

                    window.showToastNotification("💾 PERUBAHAN TERSIMPAN", `Data pengguna ${username} berhasil diperbarui!`, "success");
                    closeModal('modal-edit-user');
                    const updated = { ...selectedUser, fullname, email, phone, role, tlc, status };
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
            const inpPass = document.getElementById('reset-usr-new-pass');
            const inpConf = document.getElementById('reset-usr-confirm-pass');

            if (inpUname) inpUname.value = target.username;
            if (lblName) lblName.textContent = `${target.fullname || target.username} (${target.username})`;
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
                const newPass = document.getElementById('reset-usr-new-pass')?.value;
                const confPass = document.getElementById('reset-usr-confirm-pass')?.value;

                if (!newPass || newPass.length < 6) {
                    alert('Password minimal 6 karakter.');
                    return;
                }
                if (newPass !== confPass) {
                    alert('Konfirmasi password tidak cocok.');
                    return;
                }

                try {
                    const targetUser = allUsersCache.find(u => u.username === username);
                    const userEmail = targetUser?.email || `${username.toLowerCase()}@jtexpress.co.id`;

                    if (window.auth && !window.isFirebaseConfigPlaceholder?.()) {
                        try {
                            await JNTFirebaseService.sendPasswordReset(userEmail);
                        } catch (e) {
                            console.warn("Firebase Auth password reset:", e.message);
                        }
                    }

                    // Password Hashing via Web Crypto API SHA-256 for secure storage
                    let passHash = null;
                    if (typeof crypto !== 'undefined' && crypto.subtle) {
                        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(newPass));
                        passHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                    }

                    await JNTFirebaseService.saveUserProfile(username, {
                        passwordHash: passHash,
                        passwordUpdated: new Date().toISOString()
                    });

                    await JNTFirebaseService.logAuditEvent({
                        waktu: new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
                        operator: activeUsername,
                        shiftId: JNTFirebaseService.getActiveShiftId(),
                        modul: "User Management",
                        kodeTugas: "-",
                        aktivitas: `Reset Password untuk Pengguna (${username})`
                    });

                    window.showToastNotification("🔓 PASSWORD DIRESET", `Kata sandi untuk pengguna ${username} berhasil diperbarui!`, "success");
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
                        await JNTFirebaseService.saveUserProfile(selectedUser.username, { status: newStatus });
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
    // =========================================================================
    if (isProfilePage && typeof JNTFirebaseService !== 'undefined') {
        const formProfInfo = document.getElementById('profile-info-form');
        const formChangePass = document.getElementById('change-pass-form');

        // Pre-fill profile info if user exists in cache
        const loadProfileData = async () => {
            const userDoc = await JNTFirebaseService.getDoc('users', activeUsername);
            if (userDoc) {
                const elFull = document.getElementById('prof-fullname');
                const elUname = document.getElementById('prof-username');
                const elEmail = document.getElementById('prof-email');
                const elPhone = document.getElementById('prof-phone');
                const elTlc = document.getElementById('prof-tlc');

                if (elFull && userDoc.fullname) elFull.value = userDoc.fullname;
                if (elUname) elUname.value = userDoc.username || activeUsername;
                if (elEmail && userDoc.email) elEmail.value = userDoc.email;
                if (elPhone && userDoc.phone) elPhone.value = userDoc.phone;
                if (elTlc && userDoc.tlc) elTlc.value = userDoc.tlc;
            }
        };

        loadProfileData();

        if (formProfInfo) {
            formProfInfo.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const fullname = document.getElementById('prof-fullname')?.value;
                    const email = document.getElementById('prof-email')?.value;
                    const phone = document.getElementById('prof-phone')?.value;
                    const tlc = document.getElementById('prof-tlc')?.value;

                    await JNTFirebaseService.saveUserProfile(activeUsername, {
                        fullname,
                        email,
                        phone,
                        tlc,
                        updatedAt: new Date().toISOString()
                    });

                    sessionStorage.setItem('jnt_active_username', fullname || activeUsername);

                    window.showToastNotification("💾 PROFIL TERSIMPAN", "Informasi profil berhasil diperbarui secara persisten!", "success");
                } catch (err) {
                    alert(`Gagal menyimpan profil: ${err.message}`);
                }
            });
        }

        if (formChangePass) {
            formChangePass.addEventListener('submit', async (e) => {
                e.preventDefault();
                const curPass = document.getElementById('current-pass')?.value;
                const newPass = document.getElementById('new-pass')?.value;
                const confPass = document.getElementById('confirm-pass')?.value;

                if (!newPass || newPass.length < 6) {
                    alert('Password baru minimal 6 karakter.');
                    return;
                }
                if (newPass !== confPass) {
                    alert('Konfirmasi password tidak cocok dengan password baru.');
                    return;
                }

                try {
                    // FIX BUG-3: Jangan simpan password plaintext ke Firestore.
                    // Gunakan SHA-256 hash (konsisten dengan users.html password reset).
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
                    await JNTFirebaseService.saveUserProfile(activeUsername, {
                        passwordHash: passHash,
                        passwordUpdated: new Date().toISOString()
                    });

                    window.showToastNotification("🔑 PASSWORD DIUBAH", "Kata sandi akun Anda berhasil diperbarui!", "success");
                    formChangePass.reset();
                } catch (err) {
                    alert(`Gagal mengubah password: ${err.message}`);
                }
            });
        }
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

    if (isSettingsPage) {
        // Theme mode buttons
        const modeButtons = document.querySelectorAll('.btn-mode');
        modeButtons.forEach(btn => {
            const isDarkBtn = btn.textContent.includes('Gelap');
            if (savedThemeMode === 'dark' && isDarkBtn) {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            } else if (savedThemeMode === 'light' && !isDarkBtn) {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }

            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (isDarkBtn) {
                    localStorage.setItem('jnt_theme_mode', 'dark');
                    document.body.classList.remove('light-body-theme');
                    document.body.classList.add('dark-body-theme');
                    window.showToastNotification("🌙 TEMA GELAP", "Mode tampilan gelap telah diaktifkan.", "success");
                } else {
                    localStorage.setItem('jnt_theme_mode', 'light');
                    document.body.classList.remove('dark-body-theme');
                    document.body.classList.add('light-body-theme');
                    window.showToastNotification("☀️ TEMA TERANG", "Mode tampilan terang telah diaktifkan.", "success");
                }
            });
        });

        // Theme color dots
        const colorDots = document.querySelectorAll('.color-dot');
        const colorMap = {
            'red': '#E30613',
            'blue': '#2563EB',
            'green': '#10B981',
            'purple': '#8B5CF6',
            'orange': '#F59E0B',
            'dark': '#1E293B'
        };

        colorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                colorDots.forEach(d => {
                    d.classList.remove('active');
                    d.textContent = '';
                });
                dot.classList.add('active');
                dot.textContent = '✓';

                for (const [key, colorHex] of Object.entries(colorMap)) {
                    if (dot.classList.contains(key)) {
                        localStorage.setItem('jnt_theme_color', colorHex);
                        document.documentElement.style.setProperty('--primary-red', colorHex);
                        window.showToastNotification("🎨 TEMA WARNA", `Warna aksen sistem berhasil diubah!`, "success");
                        break;
                    }
                }
            });
        });
    }
});


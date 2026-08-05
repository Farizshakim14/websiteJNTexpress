/**
 * J&T Express - Transportation Monitoring System
 * App JavaScript Logic (Mandatory Login & Router)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. ROUTING & MANDATORY LOGIN GUARD
    // ----------------------------------------------------
    const path = window.location.pathname.toLowerCase();
    
    // Use sessionStorage so opening a new browser tab requires login first!
    const isLoggedIn = sessionStorage.getItem('jnt_is_logged_in') === 'true';
    const activeUsername = sessionStorage.getItem('jnt_active_username') || 'Hamdan';

    const isLoginPage = path.endsWith('login.html') || path.endsWith('index.html') || path.endsWith('/') || path === '';
    const isDashboardPage = path.includes('dashboard.html');
    const isIncomingPage = path.includes('incoming.html');
    const isTroublePage = path.includes('trouble.html');
    const isUsersPage = path.includes('users.html');
    const isMonitoringPage = path.includes('monitoring.html');
    const isSettingsPage = path.includes('settings.html');

    // RULE: If accessing protected pages without logging in first, force redirect to Login Page (index.html)
    if (!isLoginPage && !isLoggedIn) {
        window.location.href = 'index.html';
        return;
    }

    // Populate user profile name if logged in
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const dashUserName = document.getElementById('dash-user-name');
    if (sidebarUserName) sidebarUserName.textContent = activeUsername;
    if (dashUserName) dashUserName.textContent = activeUsername;

    // ----------------------------------------------------
    // 2. LOGIN FORM HANDLING (index.html / login.html)
    // ----------------------------------------------------
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const eyeIcon = document.getElementById('eye-icon');
    const eyeOffIcon = document.getElementById('eye-off-icon');
    const alertBox = document.getElementById('alert-box');
    const alertMessage = document.getElementById('alert-message');
    const demoFillBtn = document.getElementById('demo-fill-btn');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            if (eyeOffIcon && eyeIcon) {
                eyeOffIcon.classList.toggle('hidden', isPassword);
                eyeIcon.classList.toggle('hidden', !isPassword);
            }
        });
    }

    if (usernameInput) {
        const savedUser = localStorage.getItem('jnt_saved_username');
        if (savedUser) {
            usernameInput.value = savedUser;
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        }
    }

    if (demoFillBtn && usernameInput && passwordInput) {
        demoFillBtn.addEventListener('click', () => {
            usernameInput.value = 'Hamdan';
            passwordInput.value = 'admin123';
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            if (!username || !password) {
                if (alertMessage && alertBox) {
                    alertMessage.textContent = 'Silakan lengkapi username dan password!';
                    alertBox.classList.remove('hidden');
                }
                return;
            }

            sessionStorage.setItem('jnt_is_logged_in', 'true');
            sessionStorage.setItem('jnt_active_username', username);

            if (rememberMeCheckbox && rememberMeCheckbox.checked) {
                localStorage.setItem('jnt_saved_username', username);
            } else {
                localStorage.removeItem('jnt_saved_username');
            }

            window.location.href = 'dashboard.html';
        });
    }

    // Logout Handler
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            sessionStorage.removeItem('jnt_is_logged_in');
            sessionStorage.removeItem('jnt_active_username');
            window.location.href = 'index.html';
        });
    }

    // ----------------------------------------------------
    // 3. SIDEBAR NAVIGATION ROUTER
    // ----------------------------------------------------
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const navTextElem = link.querySelector('.nav-text');
            const menuName = navTextElem ? navTextElem.innerText.trim() : '';

            if (menuName === 'Dashboard') {
                if (!isDashboardPage) {
                    window.location.href = 'dashboard.html';
                    return;
                }
            } else if (menuName === 'Incoming') {
                if (!isIncomingPage) {
                    window.location.href = 'incoming.html';
                    return;
                }
            } else if (menuName === 'Monitoring 4 Jam') {
                if (!isMonitoringPage) {
                    window.location.href = 'monitoring.html';
                    return;
                }
            } else if (menuName === 'Trouble & Laka') {
                if (!isTroublePage) {
                    window.location.href = 'trouble.html';
                    return;
                }
            } else if (menuName === 'User Management') {
                if (!isUsersPage) {
                    window.location.href = 'users.html';
                    return;
                }
            } else if (menuName === 'Pengaturan') {
                if (!isSettingsPage) {
                    window.location.href = 'settings.html';
                    return;
                }
            }

            const href = link.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('javascript')) {
                return;
            }

            e.preventDefault();
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => item.classList.remove('active'));
            link.closest('.nav-item').classList.add('active');

            const mainHeading = document.querySelector('.page-main-heading, .inc-main-title');
            const breadcrumbSub = document.querySelector('.breadcrumb-sub, .inc-breadcrumb');
            if (mainHeading) mainHeading.textContent = menuName.toUpperCase();
            if (breadcrumbSub) breadcrumbSub.textContent = `Dashboard > ${menuName}`;
        });
    });

    // ----------------------------------------------------
    // 4. DATA REPORT SLA BULANAN (dashboard.html)
    // ----------------------------------------------------
    const slaTableBody = document.getElementById('sla-table-body');
    const initialSlaData = [
        {
            no: 1, namaRute: 'JKT - SMG', kodeTugas: 'JT250715001', trip: 1, inputBy: 'Fariz', platNomor: 'B 1234 KJD',
            jamOtw: '15/07 04:00', jamAktualSampai: '15/07 14:00', awb: 120, targetSlaOtw: '10:00', sisaSlaOtw: '05:54', ketOtw: 'On Time',
            totalSlaRet: '10:00', targetSampaiRet: '15/07 14:00', kodeTugasBalikan: 'JT250715003', ketBalikan: 'lsl', jamBerangkatGateway: '15/07 17:40',
            jamSampaiJkt: '16/07 04:50', targetSlaRet2: '10:00', totalSlaRet2: '11:10', totalTelatRet: '01:10', ketRet: 'Late',
            targetSampaiPp: '16/07 03:40', slaRoundtrip: '20:10', totalSlaPp: '21:20', ketPp: 'Late', totalLatePp: '01:10',
            driver1: 'Miftahudin', driver1Phone: '082311888408', driver2: 'Ridwan S', driver2Phone: '0817531260467', wilayah: 'Jawa Tengah'
        },
        {
            no: 2, namaRute: 'JKT - SBY', kodeTugas: 'JT250715002', trip: 1, inputBy: 'Fariz', platNomor: 'B 9876 KJN',
            jamOtw: '15/07 04:00', jamAktualSampai: '15/07 22:20', awb: 150, targetSlaOtw: '18:00', sisaSlaOtw: '13:54', ketOtw: 'On Time',
            totalSlaRet: '18:00', targetSampaiRet: '15/07 22:00', kodeTugasBalikan: 'JT250715028', ketBalikan: 'lsl', jamBerangkatGateway: '16/07 01:00',
            jamSampaiJkt: '16/07 12:45', targetSlaRet2: '18:00', totalSlaRet2: '11:45', totalTelatRet: '-5:15', ketRet: 'On Time',
            targetSampaiPp: '16/07 19:00', slaRoundtrip: '36:00', totalSlaPp: '30:15', ketPp: 'On Time', totalLatePp: '-5:45',
            driver1: 'Wahyudi', driver1Phone: '087789975088', driver2: 'Aseng', driver2Phone: '087810165477', wilayah: 'Jawa Timur'
        }
    ];

    let currentSlaData = [...initialSlaData];

    function renderSlaTable() {
        if (!slaTableBody) return;
        slaTableBody.innerHTML = '';
        currentSlaData.forEach(item => {
            const tr = document.createElement('tr');
            const ketOtwClass = item.ketOtw === 'On Time' ? 'badge-on-time' : 'badge-late';
            const ketRetClass = item.ketRet === 'On Time' ? 'badge-on-time' : 'badge-late';
            const ketPpClass = item.ketPp === 'On Time' ? 'badge-on-time' : 'badge-late';

            tr.innerHTML = `
                <td class="col-center">${item.no}</td>
                <td><strong>${item.namaRute}</strong></td>
                <td>${item.kodeTugas}</td>
                <td class="col-center">${item.trip}</td>
                <td>${item.inputBy}</td>
                <td>${item.platNomor}</td>
                <td>${item.jamOtw}</td>
                <td>${item.jamAktualSampai}</td>
                <td>${item.awb}</td>
                <td>${item.targetSlaOtw}</td>
                <td class="text-green">${item.sisaSlaOtw}</td>
                <td><span class="${ketOtwClass}">${item.ketOtw}</span></td>
                <td>${item.totalSlaRet}</td>
                <td>${item.targetSampaiRet}</td>
                <td>${item.kodeTugasBalikan}</td>
                <td>${item.ketBalikan}</td>
                <td>${item.jamBerangkatGateway}</td>
                <td>${item.jamSampaiJkt}</td>
                <td>${item.targetSlaRet2}</td>
                <td>${item.totalSlaRet2}</td>
                <td class="${item.totalTelatRet.startsWith('-') ? 'text-green' : 'text-red'}">${item.totalTelatRet}</td>
                <td><span class="${ketRetClass}">${item.ketRet}</span></td>
                <td>${item.targetSampaiPp}</td>
                <td>${item.slaRoundtrip}</td>
                <td>${item.totalSlaPp}</td>
                <td><span class="${ketPpClass}">${item.ketPp}</span></td>
                <td class="${item.totalLatePp.startsWith('-') ? 'text-green' : 'text-red'}">${item.totalLatePp}</td>
                <td>
                    <div class="driver-info-box">
                        <span class="driver-name">${item.driver1}</span>
                        <span class="driver-phone">${item.driver1Phone}</span>
                    </div>
                </td>
                <td>${item.wilayah}</td>
                <td class="col-center">
                    <div class="action-btns-cell">
                        <button class="btn-icon-action" onclick="alert('Edit data ${item.namaRute}')">✏️</button>
                        <button class="btn-icon-action" onclick="deleteRow(${item.no})">🗑️</button>
                    </div>
                </td>
            `;
            slaTableBody.appendChild(tr);
        });
    }

    window.deleteRow = function(no) {
        if (confirm(`Hapus data baris No. ${no}?`)) {
            currentSlaData = currentSlaData.filter(d => d.no !== no);
            renderSlaTable();
        }
    };

    if (slaTableBody) renderSlaTable();

    // ----------------------------------------------------
    // 5. PENGATURAN PAGE INTERACTIONS (settings.html)
    // ----------------------------------------------------
    const settingTabs = document.querySelectorAll('.settings-tab-item');
    if (settingTabs.length > 0) {
        settingTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                settingTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });
    }

    const colorDots = document.querySelectorAll('.color-dot');
    if (colorDots.length > 0) {
        colorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                colorDots.forEach(d => {
                    d.classList.remove('active');
                    d.textContent = '';
                });
                dot.classList.add('active');
                dot.textContent = '✓';
            });
        });
    }

    const modeBtns = document.querySelectorAll('.btn-mode');
    if (modeBtns.length > 0) {
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    const saveStBtns = document.querySelectorAll('.btn-st-red, .btn-st-outline');
    saveStBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            alert('✅ Perubahan pengaturan berhasil disimpan!');
        });
    });

    const dangerResetBox = document.querySelector('.danger-reset-box');
    if (dangerResetBox) {
        dangerResetBox.addEventListener('click', () => {
            if (confirm('Konfirmasi Reset: Apakah Anda yakin ingin mengembalikan seluruh pengaturan sistem ke default awal?')) {
                alert('🔄 Pengaturan telah dikembalikan ke kondisi default!');
            }
        });
    }
});

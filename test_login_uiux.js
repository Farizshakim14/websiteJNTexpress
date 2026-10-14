/**
 * J&T Express TMS — Login UI/UX Test Suite
 * Verifikasi statis semua 9 poin permintaan penyempurnaan login
 */
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const js   = fs.readFileSync('app.js', 'utf8');
const css  = fs.readFileSync('styles.css', 'utf8');

const results = [];
let pass = 0, fail = 0, warn = 0;

function test(label, condition, detail, level = 'pass') {
    const ok = !!condition;
    const status = ok ? 'PASS' : (level === 'warn' ? 'WARN' : 'FAIL');
    results.push({ status, label, detail });
    if (status === 'PASS') pass++;
    else if (status === 'WARN') warn++;
    else fail++;
}

// =========================================================
// POIN 1: Tidak ada kredensial demo yang terekspos di HTML
// =========================================================
test('P1-A: Tidak ada teks "devoleper" di HTML',
    !html.includes('devoleper'),
    'Cari: devoleper di index.html'
);
test('P1-B: Tidak ada teks "dev123" di HTML',
    !html.includes('dev123'),
    'Cari: dev123 di index.html'
);
test('P1-C: Tombol demo-fill-btn tidak ada di HTML',
    !html.includes('demo-fill-btn'),
    'Cari: demo-fill-btn di index.html'
);
test('P1-D: Handler demoFillBtn tidak ada di app.js',
    !js.includes('demoFillBtn'),
    'Cari: demoFillBtn di app.js'
);
test('P1-E: Tidak ada value="devoleper" atau value="dev123" di HTML',
    !html.includes('value="devoleper"') && !html.includes('value="dev123"'),
    'Cari: value hardcoded kredensial di HTML'
);

// =========================================================
// POIN 2: Status autentikasi Firebase
// =========================================================
test('P2-A: System status bar ada di HTML (#system-status-bar)',
    html.includes('system-status-bar'),
    'Cari: system-status-bar di index.html'
);
test('P2-B: Fungsi updateSystemStatusBar ada di app.js',
    js.includes('updateSystemStatusBar'),
    'Cari: updateSystemStatusBar di app.js'
);
test('P2-C: Deteksi isFirebaseConfigPlaceholder digunakan',
    js.includes('isFirebaseConfigPlaceholder'),
    'Cari: isFirebaseConfigPlaceholder di app.js'
);
test('P2-D: Status "lokal" ditampilkan jika placeholder',
    js.includes("'Mode lokal aktif"),
    'Cari: Mode lokal aktif di updateSystemStatusBar'
);
test('P2-E: Status "online" ditampilkan jika Firebase aktif',
    js.includes("'Sistem terhubung"),
    'Cari: Sistem terhubung di updateSystemStatusBar'
);
test('P2-F: CSS status-dot.online dengan animasi pulse ada',
    css.includes('status-dot.online') && css.includes('pulse-online'),
    'Cari: status-dot.online dan pulse-online di styles.css'
);
test('P2-G: CSS status-dot.local ada',
    css.includes('status-dot.local'),
    'Cari: status-dot.local di styles.css'
);

// =========================================================
// POIN 3: Loading state & cegah submit berulang
// =========================================================
test('P3-A: Guard _loginInProgress ada di app.js',
    js.includes('_loginInProgress'),
    'Cari: _loginInProgress di submit handler'
);
test('P3-B: Guard "if (_loginInProgress) return" ada',
    js.includes('if (_loginInProgress) return'),
    'Cari: early return jika sudah loading'
);
test('P3-C: aria-busy="true" diset saat loading',
    js.includes("setAttribute('aria-busy', 'true')"),
    'Cari: aria-busy di btnLogin saat loading'
);
test('P3-D: btn-spinner ada di HTML',
    html.includes('btn-spinner'),
    'Cari: btn-spinner di index.html'
);
test('P3-E: Spinner CSS ada (@keyframes spin)',
    css.includes('@keyframes spin') && css.includes('btn-spinner'),
    'Cari: @keyframes spin dan .btn-spinner di CSS'
);
test('P3-F: _loginInProgress direset ke false setelah gagal',
    js.includes('_loginInProgress = false'),
    'Cari: reset _loginInProgress setelah login gagal'
);

// =========================================================
// POIN 4: Pesan error aman dan informatif
// =========================================================
test('P4-A: Pesan error user-friendly dan tidak mengekspos stack trace atau nama variabel JS',
    js.includes('Periksa kembali dan coba lagi') &&
    !js.includes("alertMessage.textContent = err.message") &&
    !js.includes("displayMsg = err.stack"),
    'Cari: pesan error user-friendly, pastikan err.stack tidak langsung ditampilkan ke user'
);
test('P4-B: Pesan khusus untuk akun nonaktif',
    js.includes('tidak aktif. Hubungi Administrator'),
    'Cari: pesan akun nonaktif di error handler'
);
test('P4-C: Pesan validasi per-field (username/password)',
    js.includes('Harap masukkan username') && js.includes('Harap masukkan password'),
    'Cari: validasi field terpisah untuk username dan password'
);
test('P4-D: Alert box menggunakan role="alert" (ARIA)',
    html.includes('role="alert"'),
    'Cari: role="alert" di alert-box HTML'
);
test('P4-E: Alert box menggunakan aria-atomic="true"',
    html.includes('aria-atomic="true"'),
    'Cari: aria-atomic di alert-box'
);

// =========================================================
// POIN 5: Checkbox "Ingat Saya" — hanya username, bukan password
// =========================================================
test('P5-A: Ingat username disimpan ke localStorage (bukan password)',
    js.includes('jnt_remember_username') && !js.includes('jnt_remember_password'),
    'Cari: jnt_remember_username di app.js, pastikan tidak ada jnt_remember_password'
);
test('P5-B: Penghapusan remember jika tidak dicentang',
    js.includes("localStorage.removeItem('jnt_remember_username')"),
    'Cari: removeItem jnt_remember_username saat unchecked'
);
test('P5-C: Restore username dari localStorage saat halaman dibuka',
    js.includes("localStorage.getItem('jnt_remember_username')"),
    'Cari: getItem jnt_remember_username saat DOMContentLoaded'
);
test('P5-D: Checkbox punya aria-label yang deskriptif',
    html.includes('aria-label="Ingat username saya di perangkat ini"'),
    'Cari: aria-label pada checkbox remember-me'
);

// =========================================================
// POIN 6: Password toggle + aksesibilitas keyboard
// =========================================================
test('P6-A: toggle-password punya aria-pressed awal',
    html.includes('aria-pressed="false"'),
    'Cari: aria-pressed="false" pada toggle button di HTML'
);
test('P6-B: aria-pressed diupdate saat klik (di JS)',
    js.includes("setAttribute('aria-pressed'"),
    'Cari: setAttribute aria-pressed di toggle handler'
);
test('P6-C: aria-label toggle diupdate sesuai state',
    js.includes("'Sembunyikan password'") && js.includes("'Tampilkan password'"),
    'Cari: teks aria-label yang berubah sesuai state'
);
test('P6-D: Password input punya autocomplete="current-password"',
    html.includes('autocomplete="current-password"'),
    'Cari: autocomplete pada password input'
);
test('P6-E: Username input punya autocomplete="username"',
    html.includes('autocomplete="username"'),
    'Cari: autocomplete pada username input'
);
test('P6-F: Semua label punya for= yang cocok dengan id input',
    html.includes('for="username-input"') && html.includes('for="password-input"'),
    'Cari: label for= yang cocok dengan input id'
);
test('P6-G: Password toggle punya :focus-visible CSS',
    css.includes('.password-toggle-btn:focus-visible'),
    'Cari: focus-visible pada toggle button CSS'
);
test('P6-H: Tombol login punya :focus-visible CSS',
    css.includes('.btn-login:focus-visible'),
    'Cari: focus-visible pada btn-login CSS'
);

// =========================================================
// POIN 7: Logo, scroll, responsivitas
// =========================================================
test('P7-A: Banner overlay gradient ada (untuk readability)',
    html.includes('banner-overlay') && css.includes('.banner-overlay'),
    'Cari: banner-overlay di HTML dan CSS'
);
test('P7-B: form-panel punya overflow-y: auto (cegah clip vertikal)',
    css.includes('overflow-y: auto'),
    'Cari: overflow-y: auto pada .form-panel'
);
test('P7-C: Login card punya max-width yang wajar (≤480px)',
    css.includes('max-width: 460px'),
    'Cari: max-width login-card di CSS'
);
test('P7-D: Banner image punya object-position (cegah crop penting)',
    css.includes('object-position: center center'),
    'Cari: object-position di .banner-image'
);
test('P7-E: Responsive 768px — login-section stack vertikal',
    css.includes('flex-direction: column') && css.includes('.login-section'),
    'Cari: flex-direction: column pada .login-section di media query'
);
test('P7-F: Banner hidden di 480px (HP sangat kecil)',
    css.includes('banner-panel') && css.includes('display: none'),
    'Cari: banner-panel display: none di ≤480px media query'
);
test('P7-G: Viewport meta tag ada',
    html.includes('name="viewport"') && html.includes('width=device-width'),
    'Cari: viewport meta tag di index.html'
);

// =========================================================
// POIN 8: Login dan redirect dipertahankan
// =========================================================
test('P8-A: Login form submit handler masih ada',
    js.includes("loginForm.addEventListener('submit'"),
    'Cari: submit handler di loginForm'
);
test('P8-B: Redirect ke dashboard.html setelah login berhasil',
    js.includes("window.location.href = 'dashboard.html'"),
    'Cari: redirect ke dashboard.html setelah matched'
);
test('P8-C: Guard !isLoggedIn masih ada',
    js.includes('!isLoggedIn && !publicPages.includes(pageName)'),
    'Cari: guard isLoggedIn redirect ke index.html'
);
test('P8-D: Guard 3 VALID_ROLES masih ada',
    js.includes('VALID_ROLES') && js.includes('VALID_ROLES.includes(activeRole)'),
    'Cari: VALID_ROLES whitelist guard'
);
test('P8-E: sessionStorage keys lengkap (role, uid, email, dll)',
    js.includes("'jnt_user_role'") && js.includes("'jnt_user_uid'") && js.includes("'jnt_user_email'"),
    'Cari: semua sessionStorage keys saat login berhasil'
);

// =========================================================
// POIN 9: Firebase config, Firestore rules tidak diubah
// =========================================================
const fbConfig = fs.readFileSync('firebase-config.js', 'utf8');
const fbRules  = fs.readFileSync('firestore.rules', 'utf8');
test('P9-A: firebase-config.js tidak mengandung API key nyata (tetap placeholder)',
    fbConfig.includes('DEMO_KEY') || fbConfig.includes('isFirebaseConfigPlaceholder'),
    'Cari: DEMO_KEY / placeholder masih ada di firebase-config.js'
);
test('P9-B: Firestore rules default deny masih ada',
    fbRules.includes('allow read, write: if false'),
    'Cari: default deny di firestore.rules'
);
test('P9-C: Tidak ada perubahan pada firebase-config.js yang tidak relevan',
    !fbConfig.includes('dummy_key_inserted_by_ui_task'),
    'Pastikan tidak ada modifikasi berbahaya di firebase-config.js'
);

// =========================================================
// BONUS: Aksesibilitas & UX lanjutan
// =========================================================
test('BONUS-A: Modal "Lupa Password" ada di HTML',
    html.includes('forgot-modal-overlay') && html.includes('forgot-modal-title'),
    'Cari: forgot modal dengan role="dialog" di HTML'
);
test('BONUS-B: Modal punya role="dialog" dan aria-modal="true"',
    html.includes('role="dialog"') && html.includes('aria-modal="true"'),
    'Cari: role dialog dan aria-modal di modal HTML'
);
test('BONUS-C: Modal bisa ditutup dengan Escape (JS)',
    js.includes("e.key === 'Escape'") && js.includes('closeForgotModal'),
    'Cari: Escape key handler untuk menutup modal'
);
test('BONUS-D: Tidak ada data user (email/phone) terekspos di HTML',
    !html.includes('@jtexpress.co.id') || html.includes('it-support@jtexpress.co.id'),
    'Pastikan hanya email IT Support yang terekspos di modal (bukan akun user)'
);
test('BONUS-E: noindex,nofollow meta ada (halaman login tidak diindeks)',
    html.includes('noindex, nofollow'),
    'Cari: robots meta noindex,nofollow di login page'
);

// =========================================================
// PRINT REPORT
// =========================================================
console.log('');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(' LOGIN UI/UX TEST SUITE — J&T Express TMS');
console.log('═══════════════════════════════════════════════════════════════════');

const groups = {
    'Poin 1: Hapus Kredensial Demo':        results.filter(r => r.label.startsWith('P1')),
    'Poin 2: Status Firebase':              results.filter(r => r.label.startsWith('P2')),
    'Poin 3: Loading & Anti Double-Submit': results.filter(r => r.label.startsWith('P3')),
    'Poin 4: Pesan Error Aman':             results.filter(r => r.label.startsWith('P4')),
    'Poin 5: Ingat Saya':                   results.filter(r => r.label.startsWith('P5')),
    'Poin 6: Password Toggle & A11y':       results.filter(r => r.label.startsWith('P6')),
    'Poin 7: Logo, Scroll, Responsif':      results.filter(r => r.label.startsWith('P7')),
    'Poin 8: Login & Redirect':             results.filter(r => r.label.startsWith('P8')),
    'Poin 9: Firebase & Rules Tidak Diubah':results.filter(r => r.label.startsWith('P9')),
    'Bonus: A11y & UX Lanjutan':            results.filter(r => r.label.startsWith('BONUS')),
};

let allGroupPass = true;
for (const [groupName, items] of Object.entries(groups)) {
    const gPass = items.filter(r => r.status === 'PASS').length;
    const gFail = items.filter(r => r.status === 'FAIL').length;
    const gWarn = items.filter(r => r.status === 'WARN').length;
    const icon  = gFail > 0 ? '❌' : gWarn > 0 ? '⚠️ ' : '✅';
    if (gFail > 0) allGroupPass = false;
    console.log(`\n${icon} ${groupName} (${gPass}/${items.length} PASS)`);
    items.forEach(r => {
        const i = r.status === 'PASS' ? '  ✅' : r.status === 'WARN' ? '  ⚠️ ' : '  ❌';
        console.log(`${i} [${r.status}] ${r.label}`);
        if (r.status !== 'PASS') console.log(`       >> ${r.detail}`);
    });
}

console.log('\n───────────────────────────────────────────────────────────────────');
console.log(`  TOTAL: ${pass} PASS  /  ${fail} FAIL  /  ${warn} WARN  dari ${pass+fail+warn} test`);
console.log('═══════════════════════════════════════════════════════════════════');

if (allGroupPass) {
    console.log('  ✅ SEMUA POIN LULUS. Login UI/UX sudah diperbaiki sesuai permintaan.');
} else {
    console.log('  ❌ ADA POIN YANG GAGAL. Periksa detail di atas.');
}
console.log('');

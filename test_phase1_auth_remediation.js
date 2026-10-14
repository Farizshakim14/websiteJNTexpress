/**
 * Phase 1 Auth Remediation — Automated Test Suite
 * Runs static analysis against patched app.js, firebase-config.js, firestore.rules
 */
const fs = require('fs');
const src = fs.readFileSync('app.js', 'utf8');
const fbSrc = fs.readFileSync('firebase-config.js', 'utf8');
const rulesSrc = fs.readFileSync('firestore.rules', 'utf8');

const results = [];
let pass = 0, fail = 0;

function test(name, condition, detail) {
    const ok = !!condition;
    results.push({ status: ok ? 'PASS' : 'FAIL', name, detail });
    if (ok) pass++; else fail++;
}

// T-01: Tidak ada fallback 'ADMIN' pada activeRole
test(
    "T-01: activeRole tidak ada fallback 'ADMIN'",
    !src.includes("|| 'ADMIN'"),
    "Cari: || 'ADMIN' pada deklarasi activeRole"
);

// T-02: Tidak ada fallback 'Developer Admin' pada activeUsername
test(
    "T-02: activeUsername tidak ada fallback 'Developer Admin'",
    !src.includes("|| 'Developer Admin'"),
    "Cari: || 'Developer Admin' pada deklarasi activeUsername"
);

// T-03: VALID_ROLES whitelist ada
test(
    'T-03: Guard sesi tidak lengkap (Guard 3) \u2014 VALID_ROLES whitelist',
    src.includes('VALID_ROLES') && src.includes('VALID_ROLES.includes(activeRole)'),
    'Cari: VALID_ROLES dan VALID_ROLES.includes(activeRole)'
);

// T-04: Guard 3 melakukan sessionStorage.clear() dan redirect ke index
const guard3Start = src.indexOf("const VALID_ROLES");
const guard3End   = src.indexOf("// LOGIN FORM HANDLERS");
const guard3Block = guard3Start > -1 && guard3End > -1 ? src.substring(guard3Start, guard3End) : '';
test(
    'T-04: Guard 3 membersihkan sesi dan redirect ke login',
    guard3Block.includes('sessionStorage.clear()') &&
    guard3Block.includes("window.location.href = 'index.html'"),
    'Cari: sessionStorage.clear() dan redirect ke index.html dalam Guard 3'
);

// T-05: LOCAL_ACCOUNTS hanya diinisialisasi jika belum ada (BUG-5 fix)
test(
    "T-05: LOCAL_ACCOUNTS_SEED hanya diinisialisasi jika belum ada",
    src.includes("if (!localStorage.getItem('jnt_local_accounts'))"),
    "Cari: kondisi if sebelum localStorage.setItem jnt_local_accounts"
);

// T-06: syncUserIdentityAcrossAllPages tidak inject ADMIN/Developer Admin ke UI (non-comment lines)
const syncStart = src.indexOf('syncUserIdentityAcrossAllPages');
const syncEnd   = src.indexOf('})();\n\n\n    // PERMISSION MATRIX');
const syncBlock = syncStart > -1 && syncEnd > -1 ? src.substring(syncStart, syncEnd) : '';
// Strip komentar sebelum cek — false positive jika string ada di dalam komentar saja
const syncCodeOnly = syncBlock.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
test(
    "T-06: syncUserIdentity tidak inject 'ADMIN' atau 'Developer Admin' di kode (non-comment)",
    !syncCodeOnly.includes("'Developer Admin'") && !syncCodeOnly.includes("'ADMIN'"),
    "Cari fallback hardcoded di dalam syncUserIdentityAcrossAllPages (bukan di komentar)"
);

// T-07: syncUserIdentityAcrossAllPages early-return jika tidak ada sesi
test(
    'T-07: syncUserIdentity early-return jika fullname dan role kosong',
    syncBlock.includes('if (!fullname && !role) return'),
    'Cari early return guard di syncUserIdentityAcrossAllPages'
);

// T-08: BUG-3 fix — tidak ada pass: newPass ke saveUserProfile
test(
    'T-08: Tidak ada penyimpanan password plaintext via pass: newPass (BUG-3 fix)',
    !src.includes('pass: newPass'),
    'Cari: pass: newPass pada saveUserProfile call di profile section'
);

// T-09: SHA-256 hash digunakan di profile password change
const passChangeIdx = src.lastIndexOf('formChangePass.addEventListener');
const passChangeBlock = passChangeIdx > -1 ? src.substring(passChangeIdx, passChangeIdx + 1800) : '';
test(
    'T-09: Profile password change menggunakan SHA-256 hash sebelum simpan',
    passChangeBlock.includes('SHA-256') && passChangeBlock.includes('passwordHash'),
    'Cari: SHA-256 dan passwordHash di formChangePass handler'
);

// T-10: Firebase config placeholder terdeteksi
test(
    'T-10: firebase-config.js mengandung fungsi deteksi placeholder',
    fbSrc.includes('isFirebaseConfigPlaceholder') && fbSrc.includes('DEMO_KEY'),
    'Cari: isFirebaseConfigPlaceholder dan DEMO_KEY di firebase-config.js'
);

// T-11: Firestore rules TIDAK mengandung allow all
test(
    'T-11: firestore.rules tidak memiliki aturan permisif (allow read, write: if true)',
    !rulesSrc.includes('allow read, write: if true'),
    'Cari: allow read, write: if true (rules berbahaya)'
);

// T-12: Default deny ada
test(
    'T-12: firestore.rules memiliki default deny rule di catch-all',
    rulesSrc.includes('allow read, write: if false'),
    'Cari: allow read, write: if false pada catch-all match /{document=**}'
);

// T-13: Guard halaman internal sudah ada
test(
    'T-13: Guard isLoggedIn + redirect ke index.html ada',
    src.includes('!isLoggedIn && !publicPages.includes(pageName)') &&
    src.includes("window.location.href = 'index.html'"),
    'Cari: guard isLoggedIn redirect ke index.html'
);

// T-14: Guard redirect jika sudah login di halaman publik
test(
    'T-14: Guard redirect ke dashboard jika sudah login di halaman publik',
    src.includes('isLoggedIn && publicPages.includes(pageName)') &&
    src.includes("window.location.href = 'dashboard.html'"),
    'Cari: isLoggedIn && publicPages redirect ke dashboard'
);

// --- PRINT REPORT ---
console.log('');
console.log('=================================================================');
console.log(' PHASE 1 SECURITY REMEDIATION — AUTOMATED TEST RESULTS');
console.log(' J&T Express Transportation Monitoring System');
console.log('=================================================================');
results.forEach(r => {
    const icon = r.status === 'PASS' ? '\u2705' : '\u274c';
    console.log(`${icon} [${r.status}] ${r.name}`);
    if (r.status === 'FAIL') {
        console.log(`       >> Detail: ${r.detail}`);
    }
});
console.log('-----------------------------------------------------------------');
console.log(`  TOTAL: ${pass} PASS  /  ${fail} FAIL out of ${pass + fail} tests`);
console.log('=================================================================');
if (fail === 0) {
    console.log('  ALL TESTS PASSED. Phase 1 patches verified by static analysis.');
} else {
    console.log('  SOME TESTS FAILED. Review above and fix before proceeding.');
}
console.log('');

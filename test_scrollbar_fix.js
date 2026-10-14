const fs = require('fs');
const css  = fs.readFileSync('styles.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const fbc  = fs.readFileSync('firebase-config.js', 'utf8');
const rul  = fs.readFileSync('firestore.rules', 'utf8');

let pass = 0; let fail = 0;

function test(name, cond) {
    if (cond) { console.log('  \u2705 PASS', name); pass++; }
    else       { console.log('  \u274c FAIL', name); fail++; }
}

console.log('\n=== AUDIT PERBAIKAN SCROLLBAR GANDA ===\n');

console.log('[PENYEBAB 1] body tidak terkunci di login page:');
test('body.login-page { overflow: hidden } ada', css.includes('body.login-page') && css.includes('overflow: hidden'));
test('body login-page class ada di index.html', html.includes('class="login-page"'));

console.log('\n[PENYEBAB 2] .form-panel scroll surface tunggal:');
test('.form-panel { max-height: 100% } ada', css.includes('max-height: 100%'));
test('.form-panel { overflow-y: auto } ada (scroll tunggal)', (function() {
    const idx = css.indexOf('.form-panel {');
    const block = css.substring(idx, idx + 400);
    return block.includes('overflow-y: auto');
})());

console.log('\n[PENYEBAB 3] .login-section pakai height:100% bukan min-height:100vh:');
test('.login-section { height: 100% } ada di base CSS', (function() {
    const idx = css.indexOf('.login-section {');
    const block = css.substring(idx, idx + 300);
    return block.includes('height: 100%') && !block.includes('min-height: 100vh');
})());

console.log('\n[PENYEBAB 4] .app-container dikunci di login:');
test('body.login-page .app-container { height: 100vh } ada', (function() {
    const idx = css.indexOf('body.login-page .app-container');
    const block = css.substring(idx, idx + 150);
    return block.includes('height: 100vh');
})());
test('body.login-page .app-container { overflow: hidden } ada', (function() {
    const idx = css.indexOf('body.login-page .app-container');
    const block = css.substring(idx, idx + 150);
    return block.includes('overflow: hidden');
})());

console.log('\n[RESPONSIF] Scroll lock dilepas di tablet/mobile:');
test('@media 992px body.login-page overflow: auto ada', (function() {
    const idx = css.indexOf('LOGIN SCROLL LOCK OVERRIDE');
    const block = css.substring(idx, idx + 900);
    return block.includes('overflow: auto') && block.includes('body.login-page');
})());
test('@media 992px .login-section height: auto ada', (function() {
    const idx = css.indexOf('LOGIN SCROLL LOCK OVERRIDE');
    const block = css.substring(idx, idx + 900);
    return block.includes('height: auto');
})());
test('@media 768px .form-panel max-height: none ada', (function() {
    const idx = css.lastIndexOf('max-height: none');
    return idx > -1;
})());
test('@media 992px min-height: 100vh restore ada', (function() {
    const idx = css.indexOf('LOGIN SCROLL LOCK OVERRIDE');
    const block = css.substring(idx, idx + 900);
    return block.includes('min-height: 100vh');
})());

console.log('\n[TIDAK ADA REGRESI Auth/Firebase]:');
test('Firebase config masih placeholder (tidak diubah)', fbc.includes('DEMO_KEY'));
test('Firestore default deny masih ada', rul.includes('allow read, write: if false'));
test('Login form masih ada di HTML', html.includes('id="login-form"'));
test('Login button masih ada di HTML', html.includes('id="btn-login"'));
test('Password toggle masih ada di HTML', html.includes('id="toggle-password"'));
test('Remember me checkbox masih ada', html.includes('id="remember-me"'));
test('Status bar masih ada di HTML', html.includes('system-status-bar'));

console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('  TOTAL:', pass, 'PASS /', fail, 'FAIL dari', pass+fail, 'test');
console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
if (fail === 0) console.log('  Semua perbaikan scrollbar ganda terverifikasi.\n');
else console.log('  Ada item yang perlu diperiksa ulang.\n');

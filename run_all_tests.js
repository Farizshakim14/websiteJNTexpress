/**
 * J&T Express Transportation Monitoring System (TMS)
 * Comprehensive Master Test Runner & Quality Audit Engine
 * 
 * Executes all 6 validation test suites across Phases 1 - 4:
 * 1. test_phase1_auth.js
 * 2. test_phase1_global_ui.js
 * 3. test_phase2_security_rules.js
 * 4. test_phase3_sync_engine.js
 * 5. test_tms_core.js
 * 6. test_production_readiness.js
 * 
 * Run with: node run_all_tests.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suites = [
    { name: 'Fase 1: Firebase Authentication & User Migration', file: 'test_phase1_auth.js' },
    { name: 'Fase 1: Global UI Interactivity & Accessibility', file: 'test_phase1_global_ui.js' },
    { name: 'Fase 2: Firestore Security Rules & Least Privilege RBAC', file: 'test_phase2_security_rules.js' },
    { name: 'Fase 3: Offline Sync Queue, Anti-LWW & Cascade Deletion', file: 'test_phase3_sync_engine.js' },
    { name: 'Core TMS: Business Logic & Dual-SSOT Integration', file: 'test_tms_core.js' },
    { name: 'Production Readiness & Security Hardening Audit', file: 'test_production_readiness.js' }
];

console.log("==========================================================================");
console.log("   J&T EXPRESS TMS — COMPREHENSIVE END-TO-END TEST SUITE RUNNER           ");
console.log("==========================================================================\n");

let overallPassed = 0;
let overallFailed = 0;
const results = [];

for (const suite of suites) {
    console.log(`\n--------------------------------------------------------------------------`);
    console.log(`▶ MENJALANKAN: ${suite.name} (${suite.file})`);
    console.log(`--------------------------------------------------------------------------`);
    
    const startTime = Date.now();
    try {
        const output = execSync(`node ${suite.file}`, {
            cwd: __dirname,
            encoding: 'utf8',
            timeout: 30000
        });
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(output.trim());
        console.log(`[STATUS: PASSED in ${duration}s]`);
        overallPassed++;
        results.push({ suite: suite.name, file: suite.file, status: 'PASS', duration: `${duration}s` });
    } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.error(err.stdout ? err.stdout.trim() : '');
        console.error(err.stderr ? err.stderr.trim() : '');
        console.error(`[STATUS: FAILED in ${duration}s]: ${err.message}`);
        overallFailed++;
        results.push({ suite: suite.name, file: suite.file, status: 'FAIL', duration: `${duration}s`, error: err.message });
    }
}

console.log("\n==========================================================================");
console.log("             RINGKASAN AKHIR MASTER TEST RUNNER                           ");
console.log("==========================================================================");
results.forEach((r, idx) => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon} [${r.status}] Suite ${idx + 1}: ${r.suite} (${r.duration})`);
});
console.log("==========================================================================");
console.log(`  TOTAL SUITES : ${suites.length}`);
console.log(`  PASSED       : ${overallPassed}`);
console.log(`  FAILED       : ${overallFailed}`);
console.log("==========================================================================\n");

if (overallFailed === 0) {
    console.log("🎉 100% SUITE VERIFIKASI SELESAI DENGAN SUKSES! SISTEM SIAP PRODUKSI.\n");
    process.exit(0);
} else {
    console.error("❌ ADA SUITE YANG GAGAL. SILAKAN PERIKSA LOG DI ATAS.\n");
    process.exit(1);
}

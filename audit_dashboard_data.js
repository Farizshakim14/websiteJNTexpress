const fs = require('fs');
const js = fs.readFileSync('firebase-service.js', 'utf8');
const html = fs.readFileSync('dashboard.html', 'utf8');

// 1. localStorage keys used
const lsMatches = [...js.matchAll(/localStorage\.getItem\(['"](.*?)['"]\)/g)].map(m => m[1]);
const uniqueKeys = [...new Set(lsMatches)];
console.log('=== localStorage keys used in firebase-service.js ===');
uniqueKeys.forEach(k => console.log(' ', k));

// 2. createSub mechanism
const csIdx = js.indexOf('createSub(');
console.log('\n=== createSub() — polling mechanism ===');
console.log(js.substring(csIdx, csIdx + 600));

// 3. Check for date filtering in subscriptions
const dateFilter = js.includes('tanggalHariIni') || js.includes('filterDate') || js.includes('hariIni') || js.includes('today');
console.log('\n=== Date filtering in subscriptions ===');
console.log('Has "tanggalHariIni" filter:', js.includes('tanggalHariIni'));
console.log('Has "filterDate" filter:', js.includes('filterDate'));
console.log('Has "hariIni" filter:', js.includes('hariIni'));
console.log('Has "today" filter:', js.includes('today'));

// 4. Check for wilayah filter
console.log('\n=== Wilayah/region filtering ===');
console.log('Has wilayah filter in subscribe:', js.includes('filterWilayah') || js.includes('wilayah'));

// 5. Chart data: is it hardcoded?
const chartInHtml = html.includes("data: [80.1, 82.3");
console.log('\n=== Trend Chart Data Source ===');
console.log('Chart data is HARDCODED in dashboard.html:', chartInHtml);
if (chartInHtml) {
    const idx = html.indexOf("labels: ['16 Jul");
    console.log('Hardcoded labels:', html.substring(idx, idx + 100));
}

// 6. Donut chart: hardcoded?
const donutHardcoded = html.includes('211 Trip (85.7%)');
console.log('\n=== Donut Chart (Performa SLA Hari Ini) ===');
console.log('Donut legend is HARDCODED in HTML:', donutHardcoded);

// 7. Alert Penting: hardcoded?
const alertHardcoded = html.includes('24 Trip Telat SLA') && html.includes('2 menit lalu');
console.log('\n=== Alert Penting Card ===');
console.log('Alert items are HARDCODED in HTML:', alertHardcoded);
if (alertHardcoded) {
    console.log('Hardcoded: "24 Trip Telat SLA" with "2 menit lalu" timestamp');
    console.log('Hardcoded: "8 Kendaraan Trouble" with "10 menit lalu"');
    console.log('Hardcoded: "2 Laka" with "30 menit lalu"');
}

// 8. Distribusi Wilayah: hardcoded?
const distribHardcoded = html.includes('156 Trip') && html.includes('32 Trip') && html.includes('reg-count');
console.log('\n=== Distribusi Trip per Wilayah ===');
console.log('Region trip counts are HARDCODED in HTML:', distribHardcoded);

// 9. Weather card: hardcoded?
const weatherHardcoded = html.includes('31\u00b0C') && html.includes('Berawan');
console.log('\n=== Cuaca Jakarta Card ===');
console.log('Weather data is HARDCODED:', weatherHardcoded);

// 10. KPI updateDashboardStats — data sources
console.log('\n=== KPI Card Data Sources in updateDashboardStats() ===');
console.log('Total Trip source: incoming.length (from jnt_store_incoming)');
console.log('On Time source: sla_outbound items where statusSla === ON TIME or BERJALAN');
console.log('Near Late source: sla_outbound items where statusSla === NEAR LATE');
console.log('Late source: sla_outbound items where statusSla === TERLAMBAT or LATE');
console.log('Trouble source: troubles items where jenis !== Laka');
console.log('Laka source: troubles items where jenis === Laka');

// 11. Cross-source inconsistency
console.log('\n=== CROSS-SOURCE INCONSISTENCY CHECK ===');
console.log('PROBLEM: Total Trip uses incoming.length but SLA counts use sla_outbound.length');
console.log('These are DIFFERENT stores — a trip in "incoming" may not exist in "sla_outbound"');
console.log('Result: % bars divide sla_outbound counts by incoming total → INFLATED/WRONG percentages');

// 12. Percentage denominator bug
console.log('\n=== PERCENTAGE DENOMINATOR BUG ===');
const denominatorCode = js.indexOf('const totalVal = Math.max(1, totalTrips)');
const inHtml = html.indexOf('const totalVal = Math.max(1, totalTrips)');
console.log('totalVal defined in dashboard.html:', inHtml > -1);
console.log('Denominator: totalTrips (from incoming.length)');
console.log('Numerator: onTimeCount/lateCount/etc. (from sla_outbound)');
console.log('BUG: sla_outbound entries !== incoming entries → % can exceed 100% or be inaccurate');

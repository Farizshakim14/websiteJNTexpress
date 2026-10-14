const fs = require('fs');
const js = fs.readFileSync('firebase-service.js', 'utf8');

// Find sla status values
const slaCompares = [];
let idx = js.indexOf('statusSla');
while (idx !== -1) {
    slaCompares.push(js.substring(idx - 10, idx + 80).replace(/\n/g, ' '));
    idx = js.indexOf('statusSla', idx + 1);
}
console.log('=== statusSla usage contexts ===');
slaCompares.forEach((c, i) => console.log(i + 1, ':', c));

// Trouble status values
console.log('\n=== Trouble status values ===');
const statusMatches = js.match(/status\s*!==?\s*['"]([^'"]+)['"]/g) || [];
const statusEq = js.match(/status\s*===?\s*['"]([^'"]+)['"]/g) || [];
[...new Set([...statusMatches, ...statusEq])].forEach(v => console.log(' ', v));

// jenis field
console.log('\n=== jenis field comparisons ===');
const jenisMatches = js.match(/jenis\s*(?:!|=)==\s*['"]([^'"]+)['"]/g) || [];
[...new Set(jenisMatches)].forEach(v => console.log(' ', v));

// wilayah uppercase values in master data
console.log('\n=== wilayah values in master ===');
const wilayahMatches = js.match(/wilayah:\s*["']([^"']+)["']/g) || [];
[...new Set(wilayahMatches)].slice(0, 10).forEach(v => console.log(' ', v));

// incoming createdAt field
console.log('\n=== createdAt in incoming ===');
const caIdx = js.indexOf('createdAt: new Date');
if (caIdx !== -1) console.log(js.substring(caIdx - 100, caIdx + 150));

// Find jamBerangkat/tanggal fields in incoming
console.log('\n=== date field in incoming data ===');
const jbIdx = js.indexOf('jamBerangkat');
if (jbIdx !== -1) console.log(js.substring(jbIdx - 20, jbIdx + 200));

// Check tanggal field
const tgIdx = js.indexOf('tanggalTugas');
if (tgIdx !== -1) {
    console.log('\n=== tanggalTugas ===');
    console.log(js.substring(tgIdx, tgIdx + 200));
}

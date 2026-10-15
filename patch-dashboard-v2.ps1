# Patch dashboard.html menggunakan line number replacement
$path = (Resolve-Path 'dashboard.html').Path
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)

# Cari baris awal fungsi _dashSmartUpdateTbody
$startIdx = -1
$endIdx   = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'function _dashSmartUpdateTbody') { $startIdx = $i; break }
}
if ($startIdx -lt 0) { Write-Host "ERROR: function not found"; exit 1 }

# Cari baris penutup fungsi (baris yang hanya mengandung 12 spaces + "}")
for ($i = $startIdx + 1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -eq '            }') { $endIdx = $i; break }
}
if ($endIdx -lt 0) { Write-Host "ERROR: closing brace not found"; exit 1 }

Write-Host "Function at lines $($startIdx+1) to $($endIdx+1)"

# Baris sebelum komentar fungsi (baris 1134 -> index 1133)
$commentIdx = $startIdx - 1

$newBlock = @(
'            // Smart DOM diffing untuk tabel dashboard - cegah full re-render',
'            // Gunakan hash bukan innerHTML agar sla-live-countdown tidak trigger false mismatch',
'            function _dashSmartUpdateTbody(tbody, list, getKey, buildRowFn, getRowAttrs, getContentHash) {',
'                if (!tbody) return;',
'                const existingRows = new Map();',
"                tbody.querySelectorAll('tr[data-row-key]').forEach(function(tr) {",
"                    existingRows.set(tr.getAttribute('data-row-key'), tr);",
'                });',
'                const newKeys = new Set();',
'                list.forEach(function(item, idx) {',
'                    const key     = getKey(item);',
'                    newKeys.add(key);',
'                    const attrs   = getRowAttrs ? getRowAttrs(item) : {};',
'                    const newHash = getContentHash ? String(getContentHash(item)) : key;',
'                    if (existingRows.has(key)) {',
'                        const existingTr = existingRows.get(key);',
'                        Object.keys(attrs).forEach(function(k) {',
"                            if (existingTr.getAttribute(k) !== String(attrs[k])) existingTr.setAttribute(k, attrs[k]);",
'                        });',
"                        const curHash = existingTr.getAttribute('data-content-hash') || '';",
'                        if (curHash !== newHash) {',
'                            existingTr.innerHTML = buildRowFn(item);',
"                            existingTr.setAttribute('data-content-hash', newHash);",
'                        }',
'                        if (tbody.children[idx] !== existingTr) tbody.insertBefore(existingTr, tbody.children[idx] || null);',
'                    } else {',
"                        const tr = document.createElement('tr');",
"                        tr.setAttribute('data-row-key', key);",
"                        tr.setAttribute('data-content-hash', newHash);",
'                        Object.keys(attrs).forEach(function(k) { tr.setAttribute(k, attrs[k]); });',
'                        tr.innerHTML = buildRowFn(item);',
'                        tbody.insertBefore(tr, tbody.children[idx] || null);',
'                    }',
'                });',
'                existingRows.forEach(function(tr, key) {',
'                    if (!newKeys.has(key)) tbody.removeChild(tr);',
'                });',
'            }'
)

# Remove old comment line before function if it matches
if ($lines[$commentIdx] -match 'Smart DOM diffing') {
    $before = $lines[0..($commentIdx - 1)]
} else {
    $before = $lines[0..$commentIdx]
}
$after = $lines[($endIdx + 1)..($lines.Length - 1)]
$newLines = $before + $newBlock + $after

[System.IO.File]::WriteAllLines($path, $newLines, [System.Text.Encoding]::UTF8)
Write-Host "Done. Lines: $($newLines.Length)"

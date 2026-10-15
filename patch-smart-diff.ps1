# Replace smartUpdateTbody using line-number based replacement
$path = (Resolve-Path 'sla-vendor.html').Path
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)

# Lines 613-648 (0-indexed: 612-647)
$newBlock = @(
"        // -- SMART DOM DIFFING ------------------------------------------------",
"        // Mencegah full re-render (penyebab kedap-kedip).",
"        // Gunakan data-content-hash (bukan innerHTML) agar elemen .sla-live-countdown",
"        // yang diupdate engine setiap detik tidak memicu false mismatch & re-render baris.",
"        function smartUpdateTbody(tbody, list, getKey, buildRowFn, getRowAttrs, getContentHash) {",
"            if (!tbody) return;",
"            var existingRows = new Map();",
"            tbody.querySelectorAll('tr[data-row-key]').forEach(function(tr) {",
"                existingRows.set(tr.getAttribute('data-row-key'), tr);",
"            });",
"            var newKeys = new Set();",
"            list.forEach(function(item, idx) {",
"                var key     = getKey(item);",
"                newKeys.add(key);",
"                var attrs   = getRowAttrs ? getRowAttrs(item) : {};",
"                var newHash = getContentHash ? String(getContentHash(item)) : key;",
"                if (existingRows.has(key)) {",
"                    var existingTr = existingRows.get(key);",
"                    // Update data-sla-* attrs untuk countdown engine",
"                    Object.keys(attrs).forEach(function(k) {",
"                        if (existingTr.getAttribute(k) !== String(attrs[k])) existingTr.setAttribute(k, attrs[k]);",
"                    });",
"                    // Re-render HTML hanya jika data statik berubah (hash berbeda)",
"                    var curHash = existingTr.getAttribute('data-content-hash') || '';",
"                    if (curHash !== newHash) {",
"                        existingTr.innerHTML = buildRowFn(item);",
"                        existingTr.setAttribute('data-content-hash', newHash);",
"                    }",
"                    if (tbody.children[idx] !== existingTr) tbody.insertBefore(existingTr, tbody.children[idx] || null);",
"                } else {",
"                    var newHTML = buildRowFn(item);",
"                    var tr = document.createElement('tr');",
"                    tr.setAttribute('data-row-key', key);",
"                    tr.setAttribute('data-content-hash', newHash);",
"                    Object.keys(attrs).forEach(function(k) { tr.setAttribute(k, attrs[k]); });",
"                    tr.innerHTML = newHTML;",
"                    tbody.insertBefore(tr, tbody.children[idx] || null);",
"                }",
"            });",
"            existingRows.forEach(function(tr, key) {",
"                if (!newKeys.has(key)) tbody.removeChild(tr);",
"            });",
"        }"
)

# Replace lines 612 to 647 (0-indexed) with new block
$before = $lines[0..611]
$after  = $lines[648..($lines.Length - 1)]
$newLines = $before + $newBlock + $after

[System.IO.File]::WriteAllLines($path, $newLines, [System.Text.Encoding]::UTF8)
Write-Host "Done. Total lines: $($newLines.Length)"

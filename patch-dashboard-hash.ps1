# Patch dashboard.html _dashSmartUpdateTbody dengan hash-based comparison
$path = (Resolve-Path 'dashboard.html').Path
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Cari & ganti fungsi _dashSmartUpdateTbody (baris 1135-1168)
$oldFn = "            // Smart DOM diffing untuk tabel dashboard — cegah full re-render
            function _dashSmartUpdateTbody(tbody, list, getKey, buildRowFn, getRowAttrs) {
                if (!tbody) return;
                const existingRows = new Map();
                tbody.querySelectorAll('tr[data-row-key]').forEach(function(tr) {
                    existingRows.set(tr.getAttribute('data-row-key'), tr);
                });
                const newKeys = new Set();
                list.forEach(function(item, idx) {
                    const key    = getKey(item);
                    newKeys.add(key);
                    const newHTML = buildRowFn(item);
                    const attrs   = getRowAttrs ? getRowAttrs(item) : {};
                    if (existingRows.has(key)) {
                        const existingTr = existingRows.get(key);
                        Object.keys(attrs).forEach(function(k) {
                            if (existingTr.getAttribute(k) !== String(attrs[k])) existingTr.setAttribute(k, attrs[k]);
                        });
                        const curInner = existingTr.innerHTML.replace(/\s+/g,' ').trim();
                        const newInner = newHTML.replace(/\s+/g,' ').trim();
                        if (curInner !== newInner) existingTr.innerHTML = newHTML;
                        if (tbody.children[idx] !== existingTr) tbody.insertBefore(existingTr, tbody.children[idx] || null);
                    } else {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-row-key', key);
                        Object.keys(attrs).forEach(function(k) { tr.setAttribute(k, attrs[k]); });
                        tr.innerHTML = newHTML;
                        tbody.insertBefore(tr, tbody.children[idx] || null);
                    }
                });
                existingRows.forEach(function(tr, key) {
                    if (!newKeys.has(key)) tbody.removeChild(tr);
                });
            }"

$newFn = "            // Smart DOM diffing untuk tabel dashboard — cegah full re-render
            // Gunakan hash bukan innerHTML agar sla-live-countdown tidak trigger false mismatch
            function _dashSmartUpdateTbody(tbody, list, getKey, buildRowFn, getRowAttrs, getContentHash) {
                if (!tbody) return;
                const existingRows = new Map();
                tbody.querySelectorAll('tr[data-row-key]').forEach(function(tr) {
                    existingRows.set(tr.getAttribute('data-row-key'), tr);
                });
                const newKeys = new Set();
                list.forEach(function(item, idx) {
                    const key     = getKey(item);
                    newKeys.add(key);
                    const attrs   = getRowAttrs ? getRowAttrs(item) : {};
                    const newHash = getContentHash ? String(getContentHash(item)) : key;
                    if (existingRows.has(key)) {
                        const existingTr = existingRows.get(key);
                        Object.keys(attrs).forEach(function(k) {
                            if (existingTr.getAttribute(k) !== String(attrs[k])) existingTr.setAttribute(k, attrs[k]);
                        });
                        const curHash = existingTr.getAttribute('data-content-hash') || '';
                        if (curHash !== newHash) {
                            existingTr.innerHTML = buildRowFn(item);
                            existingTr.setAttribute('data-content-hash', newHash);
                        }
                        if (tbody.children[idx] !== existingTr) tbody.insertBefore(existingTr, tbody.children[idx] || null);
                    } else {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-row-key', key);
                        tr.setAttribute('data-content-hash', newHash);
                        Object.keys(attrs).forEach(function(k) { tr.setAttribute(k, attrs[k]); });
                        tr.innerHTML = buildRowFn(item);
                        tbody.insertBefore(tr, tbody.children[idx] || null);
                    }
                });
                existingRows.forEach(function(tr, key) {
                    if (!newKeys.has(key)) tbody.removeChild(tr);
                });
            }"

if ($content.Contains($oldFn)) {
    $content = $content.Replace($oldFn, $newFn)
    Write-Host "Function replaced OK"
} else {
    Write-Host "WARNING: old function pattern not found - checking partial match..."
    $idx = $content.IndexOf('function _dashSmartUpdateTbody')
    Write-Host "Function found at index: $idx"
}

# Update the call site to include hash function
$oldCall = "                _dashSmartUpdateTbody(
                    tbody, lateOnly,
                    function(item) { return item.kodeTugas; },
                    function(item) {"
$newCall = "                _dashSmartUpdateTbody(
                    tbody, lateOnly,
                    function(item) { return item.kodeTugas; },
                    function(item) {"

# The call site adds hash as 6th argument - find and patch it
$oldCallEnd = "                    function(item) {
                        return {
                            'data-sla-departure': item.jamBerangkat    || '',
                            'data-sla-hours':     item.targetSLAHours  || 16,
                            'data-sla-arrival':   item.jamSampaiAktual || ''
                        };
                    }
                );"

$newCallEnd = "                    function(item) {
                        return {
                            'data-sla-departure': item.jamBerangkat    || '',
                            'data-sla-hours':     item.targetSLAHours  || 16,
                            'data-sla-arrival':   item.jamSampaiAktual || ''
                        };
                    },
                    function(item) {
                        return (item.kodeTugas||'') + '|' + (item.jamBerangkat||'') + '|' + (item.targetSLAHours||16) + '|' + (item.jamSampaiAktual||'') + '|' + (item.lateMinutes||0) + '|' + (item.statusSla||'');
                    }
                );"

if ($content.Contains($oldCallEnd)) {
    $content = $content.Replace($oldCallEnd, $newCallEnd)
    Write-Host "Call site replaced OK"
} else {
    Write-Host "WARNING: call site pattern not found"
}

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Done. Lines: $((Get-Content $path).Count)"

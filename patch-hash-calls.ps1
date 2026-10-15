# Patch 3 smartUpdateTbody call sites to add getContentHash parameter
$path = (Resolve-Path 'sla-vendor.html').Path
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# 1. Outbound call - add hash function (hash = departure + hours + arrival + status)
$old1 = "                    smartUpdateTbody(tbody, list,
                        function(i){ return i.kodeTugas; },
                        buildOutboundRowHTML,
                        function(i){ return { 'data-sla-departure': i.jamBerangkat || '', 'data-sla-hours': i.targetSLAHours || 16, 'data-sla-arrival': i.jamSampaiAktual || '' }; }
                    );"
$new1 = "                    smartUpdateTbody(tbody, list,
                        function(i){ return i.kodeTugas; },
                        buildOutboundRowHTML,
                        function(i){ return { 'data-sla-departure': i.jamBerangkat || '', 'data-sla-hours': i.targetSLAHours || 16, 'data-sla-arrival': i.jamSampaiAktual || '' }; },
                        function(i){ return (i.kodeTugas||'') + '|' + (i.trip||'') + '|' + (i.platNomor||'') + '|' + (i.jamBerangkat||'') + '|' + (i.targetSLAHours||16) + '|' + (i.jamSampaiAktual||'') + '|' + (i.lateMinutes||0) + '|' + (i.alasan||'') + '|' + (i.statusSla||''); }
                    );"

# 2. Return call
$old2 = "                    smartUpdateTbody(tbody, list, function(i){ return i.kodeTugasBalikan; }, buildReturnRowHTML, null);"
$new2 = "                    smartUpdateTbody(tbody, list, function(i){ return i.kodeTugasBalikan; }, buildReturnRowHTML, null, function(i){ return (i.kodeTugasBalikan||'') + '|' + (i.jamBerangkat||'') + '|' + (i.jamSampai||'') + '|' + (i.alasan||''); });"

# 3. Roundtrip call
$old3 = "                    smartUpdateTbody(tbody, list, function(i){ return i.kodeTugas; }, buildRoundtripRowHTML, null);"
$new3 = "                    smartUpdateTbody(tbody, list, function(i){ return i.kodeTugas; }, buildRoundtripRowHTML, null, function(i){ return (i.kodeTugas||'') + '|' + (i.totalDurasiPPMinutes||0) + '|' + (i.statusRoundtrip||''); });"

$content = $content.Replace($old1, $new1)
$content = $content.Replace($old2, $new2)
$content = $content.Replace($old3, $new3)

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Done. Lines: $((Get-Content $path).Count)"

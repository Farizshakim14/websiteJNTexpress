$htmlBody  = [System.IO.File]::ReadAllText((Resolve-Path 'sla-html-body.txt').Path, [System.Text.Encoding]::UTF8)
$scriptPart= [System.IO.File]::ReadAllText((Resolve-Path 'sla-scripts-final.html').Path, [System.Text.Encoding]::UTF8)
$combined  = $htmlBody + $scriptPart
[System.IO.File]::WriteAllText((Resolve-Path 'sla-vendor.html').Path, $combined, [System.Text.Encoding]::UTF8)
$lines = (Get-Content 'sla-vendor.html').Count
Write-Host "Done. Lines: $lines"

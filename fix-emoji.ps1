# Fix emoji encoding menggunakan PowerShell byte replacement
$file = Resolve-Path 'sla-vendor.html'
$bytes = [System.IO.File]::ReadAllBytes($file)
$str = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($bytes)

# Patterns yang rusak (mojibake dari UTF-8 dibaca sebagai Latin-1)
# Ganti dengan HTML entities yang aman
$str = $str -replace [regex]::Escape('ðŸšš'), '&#128666;'   # truck
$str = $str -replace [regex]::Escape('âœ…'), '&#9989;'       # check
$str = $str -replace [regex]::Escape('â°'), '&#9201;'        # clock
$str = $str -replace [regex]::Escape('ðŸ"'), '&#128205;'     # pin
$str = $str -replace [regex]::Escape('ðŸ"„'), '&#128260;'    # refresh  
$str = $str -replace [regex]::Escape('â±ï¸'), '&#9200;'      # stopwatch
$str = $str -replace [regex]::Escape('âœï¸'), '&#9999;&#65039;'  # pencil
$str = $str -replace [regex]::Escape('â†''), '&rarr;'        # right arrow

# Save kembali sebagai UTF-8 tanpa BOM
$newBytes = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetBytes($str)
[System.IO.File]::WriteAllBytes($file, $newBytes)
Write-Host "Done - Fixed emoji in sla-vendor.html"

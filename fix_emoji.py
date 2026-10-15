import sys

# Read the file as raw bytes
with open('sla-vendor.html', 'rb') as f:
    raw = f.read()

# The file is a mix: first 579 lines are Windows-1252/CRLF, rest is UTF-8
# The corrupted emoji are UTF-8 bytes being interpreted as Latin-1 (double encoding)
# We need to decode as latin-1 first, then find the mojibake sequences

# Common mojibake patterns (UTF-8 bytes read as latin-1):
replacements = [
    # ðŸšš  = 🚚 (U+1F69A truck)
    (b'\xc3\xb0\xc5\xb8\xc5\xa1\xc5\xa1', b'&#128666;'),
    # âœ…  = ✅ (U+2705 check mark)
    (b'\xc3\xa2\xc5\x93\x85', b'&#9989;'),
    # âº   = ⏰ (U+23F0 alarm clock)  
    (b'\xc3\xa2\xc2\xba', b'&#9201;'),
    # ðŸ"   = 📍 (U+1F4CD pin)
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9d', b'&#128205;'),
    # ðŸ"„  = 🔄 (U+1F504 counterclockwise)
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9c', b'&#128260;'),
    # â±ï¸  = ⏱️ (U+23F1 stopwatch)
    (b'\xc3\xa2\xc2\xb1\xc3\xaf\xc2\xb8\xc2\x8f', b'&#9200;'),
    # âœï¸  = ✏️ (pencil)
    (b'\xc3\xa2\xc5\x93\xc3\xaf\xc2\xb8\xc2\x8f', b'&#9999;&#65039;'),
    # â†'   = → (U+2192 right arrow)
    (b'\xc3\xa2\xc2\x86\xc2\x92', b'&rarr;'),
]

result = raw
for bad, good in replacements:
    result = result.replace(bad, good)

with open('sla-vendor.html', 'wb') as f:
    f.write(result)

print('Done. Replacements applied.')
# Show any remaining corrupted sequences for diagnosis
import re
text = result.decode('utf-8', errors='replace')
# Find any remaining sequences that look like mojibake
matches = re.findall(r'[Ã-ÿ][^\x00-\x7F]{1,4}', text)
unique = set(matches[:20])
print('Remaining suspicious sequences:', list(unique)[:10])

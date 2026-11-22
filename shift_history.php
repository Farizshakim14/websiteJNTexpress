<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Arsip Riwayat Serah Terima Shift (Handover) di Hosting cPanel
 * Menyimpan seluruh histori Shift yang sudah COMPLETED di hosting sehingga koleksi 'shifts' di Firestore tetap ringan.
 */

require_once __DIR__ . '/_auth_helper.php';
jnt_apply_cors_headers('GET, POST, OPTIONS');

jnt_require_firebase_auth();

$logsDir = __DIR__ . '/logs/';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
jnt_ensure_htaccess_block($logsDir, true);

$shiftFile = $logsDir . 'shift_history.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $shifts = [];
    if (file_exists($shiftFile)) {
        $raw = @file_get_contents($shiftFile);
        $dec = $raw ? json_decode($raw, true) : null;
        if (is_array($dec)) {
            $shifts = array_values($dec);
        }
    }
    echo json_encode([
        'success' => true,
        'count' => count($shifts),
        'shifts' => $shifts
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);
    if (!$payload || !is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Payload JSON tidak valid']);
        exit;
    }

    $fp = fopen($shiftFile, 'c+');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal membuka file riwayat shift di hosting']);
        exit;
    }

    $saved = 0;
    if (flock($fp, LOCK_EX)) {
        $fSize = filesize($shiftFile);
        $store = [];
        if ($fSize > 0) {
            $raw = fread($fp, $fSize);
            $dec = json_decode($raw, true);
            if (is_array($dec)) $store = $dec;
        }

        $items = [];
        if (isset($payload['shifts']) && is_array($payload['shifts'])) {
            $items = $payload['shifts'];
        } elseif (isset($payload['shift']) && is_array($payload['shift'])) {
            $items = [$payload['shift']];
        } elseif (!empty($payload['shiftId']) || !empty($payload['id'])) {
            $items = [$payload];
        }

        foreach ($items as $sh) {
            if (!is_array($sh)) continue;
            $sid = trim((string)($sh['shiftId'] ?? $sh['id'] ?? ''));
            if ($sid === '') continue;
            $sh['id'] = $sid;
            $sh['shiftId'] = $sid;
            $existing = $store[$sid] ?? [];
            $store[$sid] = array_merge($existing, $sh);
            $saved++;
        }

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($store, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    echo json_encode([
        'success' => true,
        'savedCount' => $saved
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Metode HTTP tidak didukung']);

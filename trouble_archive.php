<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Arsip Riwayat Trouble & Laka yang Sudah Selesai (SUDAH SELESAI / RESOLVED) di Hosting cPanel
 * Membuat Lonceng Notifikasi (subscribeNotifications) di setiap halaman hanya membaca 0-3 insiden aktif di Firestore,
 * sementara 100% riwayat insiden lama tetap tampil lengkap di menu Trouble & Laka serta Report & Export.
 */

require_once __DIR__ . '/_auth_helper.php';
jnt_apply_cors_headers('GET, POST, OPTIONS');

jnt_require_firebase_auth();

$logsDir = __DIR__ . '/logs/';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
jnt_ensure_htaccess_block($logsDir, true);

$troubleFile = $logsDir . 'trouble_archive.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $troubles = [];
    if (file_exists($troubleFile)) {
        $raw = @file_get_contents($troubleFile);
        $dec = $raw ? json_decode($raw, true) : null;
        if (is_array($dec)) {
            $troubles = array_values($dec);
        }
    }
    echo json_encode([
        'success' => true,
        'count' => count($troubles),
        'troubles' => $troubles
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

    $fp = fopen($troubleFile, 'c+');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal membuka file arsip trouble di hosting']);
        exit;
    }

    $saved = 0;
    if (flock($fp, LOCK_EX)) {
        $fSize = filesize($troubleFile);
        $store = [];
        if ($fSize > 0) {
            $raw = fread($fp, $fSize);
            $dec = json_decode($raw, true);
            if (is_array($dec)) $store = $dec;
        }

        $items = [];
        if (isset($payload['troubles']) && is_array($payload['troubles'])) {
            $items = $payload['troubles'];
        } elseif (isset($payload['incident']) && is_array($payload['incident'])) {
            $items = [$payload['incident']];
        } elseif (!empty($payload['incidentId']) || !empty($payload['id'])) {
            $items = [$payload];
        }

        foreach ($items as $inc) {
            if (!is_array($inc)) continue;
            $iid = trim((string)($inc['incidentId'] ?? $inc['id'] ?? ''));
            if ($iid === '') continue;
            $inc['id'] = $iid;
            $inc['incidentId'] = $iid;
            $inc['_archivedInHosting'] = true;
            $existing = $store[$iid] ?? [];
            $store[$iid] = array_merge($existing, $inc);
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

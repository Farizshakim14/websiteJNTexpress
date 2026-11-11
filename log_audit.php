<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Simpan & Ambil Audit Trail Log di Hosting cPanel
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

// Tangani Preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$logsDir = __DIR__ . '/logs/';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}

$logFile = $logsDir . 'audit_logs.json';
$archiveFile = $logsDir . 'audit_archive.log';

// 1. Tangani GET: Ambil daftar audit log terbaru
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;
    $shiftId = isset($_GET['shiftId']) ? trim($_GET['shiftId']) : null;
    $operator = isset($_GET['operator']) ? trim($_GET['operator']) : null;

    $logs = [];
    if (file_exists($logFile)) {
        $content = file_get_contents($logFile);
        $decoded = json_decode($content, true);
        if (is_array($decoded)) {
            $logs = $decoded;
        }
    }

    // Filter opsional jika diminta
    if ($shiftId) {
        $logs = array_filter($logs, function($item) use ($shiftId) {
            return isset($item['shiftId']) && $item['shiftId'] === $shiftId;
        });
    }
    if ($operator) {
        $logs = array_filter($logs, function($item) use ($operator) {
            return isset($item['operator']) && strcasecmp($item['operator'], $operator) === 0;
        });
    }

    $logs = array_values($logs);
    $result = array_slice($logs, 0, $limit);

    echo json_encode([
        'success' => true,
        'count' => count($result),
        'total' => count($logs),
        'logs' => $result
    ]);
    exit;
}

// 2. Tangani POST: Simpan audit log baru ke cPanel
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);

    if (!$payload || !is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
        exit;
    }

    $entry = [
        'id' => $payload['id'] ?? ('AUDIT-' . round(microtime(true) * 1000) . '-' . mt_rand(100, 999)),
        'createdAt' => (int)($payload['createdAt'] ?? round(microtime(true) * 1000)),
        'waktu' => (string)($payload['waktu'] ?? date('d/m/Y, H.i')),
        'operator' => (string)($payload['operator'] ?? 'System'),
        'shiftId' => (string)($payload['shiftId'] ?? '-'),
        'modul' => (string)($payload['modul'] ?? 'General'),
        'kodeTugas' => (string)($payload['kodeTugas'] ?? '-'),
        'aktivitas' => (string)($payload['aktivitas'] ?? '')
    ];

    // Buka file dengan LOCK_EX untuk keamanan konkurensi (mencegah bentrok antar operator)
    $fp = fopen($logFile, 'c+');
    if ($fp) {
        if (flock($fp, LOCK_EX)) {
            $fileSize = filesize($logFile);
            $currentLogs = [];
            if ($fileSize > 0) {
                $content = fread($fp, $fileSize);
                $decoded = json_decode($content, true);
                if (is_array($decoded)) {
                    $currentLogs = $decoded;
                }
            }

            // Sisipkan log baru di urutan pertama (paling baru)
            array_unshift($currentLogs, $entry);

            // Batasi logs aktif di JSON utama agar tidak melebihi 2.000 entri (~300KB)
            if (count($currentLogs) > 2000) {
                $overflow = array_slice($currentLogs, 2000);
                $currentLogs = array_slice($currentLogs, 0, 2000);

                // Simpan entri berlebih ke file arsip terpisah agar data tidak pernah hilang
                $archiveFp = fopen($archiveFile, 'a');
                if ($archiveFp) {
                    foreach ($overflow as $oldEntry) {
                        fwrite($archiveFp, json_encode($oldEntry) . PHP_EOL);
                    }
                    fclose($archiveFp);
                }
            }

            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($currentLogs, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            fflush($fp);
            flock($fp, LOCK_UN);
        }
        fclose($fp);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Audit log berhasil disimpan di hosting cPanel',
        'entry' => $entry
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Metode HTTP tidak didukung']);

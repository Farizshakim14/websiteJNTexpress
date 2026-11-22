<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Master Data Statis di Hosting cPanel (Rute & Standar SLA, Daftar Vendor, Armada, Driver, Alasan Terlambat)
 * Menghemat 100% Reads & Writes pada 5 koleksi Master Data di Firestore:
 * - master_trips (78+ Rute & Standar Jam SLA)
 * - master_vendors (13+ Vendor Resmi)
 * - master_fleets (Daftar Plat Nomor Armada)
 * - master_drivers (Daftar Driver & Kontak)
 * - master_reasons (Master Alasan Keterlambatan)
 */

require_once __DIR__ . '/_auth_helper.php';
jnt_apply_cors_headers('GET, POST, OPTIONS');

jnt_require_firebase_auth();

$logsDir = __DIR__ . '/logs/';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
jnt_ensure_htaccess_block($logsDir, true);

$masterFile = $logsDir . 'master_data.json';
$masterCollections = ['master_trips', 'master_vendors', 'master_fleets', 'master_drivers', 'master_reasons'];

function jnt_default_master_store() {
    return [
        'updatedAt' => gmdate('c'),
        'master_trips' => [],
        'master_vendors' => [],
        'master_fleets' => [],
        'master_drivers' => [],
        'master_reasons' => []
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $store = jnt_default_master_store();
    if (file_exists($masterFile)) {
        $raw = @file_get_contents($masterFile);
        $dec = $raw ? json_decode($raw, true) : null;
        if (is_array($dec)) {
            foreach ($masterCollections as $col) {
                if (isset($dec[$col]) && is_array($dec[$col])) {
                    $store[$col] = array_values($dec[$col]);
                }
            }
            if (!empty($dec['updatedAt'])) $store['updatedAt'] = $dec['updatedAt'];
        }
    }
    echo json_encode([
        'success' => true,
        'updatedAt' => $store['updatedAt'],
        'master_trips' => $store['master_trips'],
        'master_vendors' => $store['master_vendors'],
        'master_fleets' => $store['master_fleets'],
        'master_drivers' => $store['master_drivers'],
        'master_reasons' => $store['master_reasons']
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

    $action = $payload['action'] ?? 'upsert';
    $fp = fopen($masterFile, 'c+');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal membuka file master_data di hosting']);
        exit;
    }

    $saved = 0;
    $deleted = 0;
    if (flock($fp, LOCK_EX)) {
        $fSize = filesize($masterFile);
        $store = jnt_default_master_store();
        if ($fSize > 0) {
            $raw = fread($fp, $fSize);
            $dec = json_decode($raw, true);
            if (is_array($dec)) {
                foreach ($masterCollections as $col) {
                    if (isset($dec[$col]) && is_array($dec[$col])) {
                        $store[$col] = $dec[$col];
                    }
                }
            }
        }

        if ($action === 'delete' && !empty($payload['collection']) && !empty($payload['docId'])) {
            $col = $payload['collection'];
            $docId = trim((string)$payload['docId']);
            if (in_array($col, $masterCollections, true) && isset($store[$col][$docId])) {
                unset($store[$col][$docId]);
                $deleted++;
            }
        } else {
            // Single item upsert: { collection: 'master_trips', docId: 'BDO FUSO', data: {...} }
            if (!empty($payload['collection']) && in_array($payload['collection'], $masterCollections, true) && isset($payload['data']) && is_array($payload['data'])) {
                $col = $payload['collection'];
                $doc = $payload['data'];
                $docId = trim((string)($payload['docId'] ?? $doc['id'] ?? $doc['code'] ?? ''));
                if ($docId !== '') {
                    $doc['id'] = $docId;
                    $existing = $store[$col][$docId] ?? [];
                    $store[$col][$docId] = array_merge($existing, $doc);
                    $saved++;
                }
            }
            // Batch per collection: { master_trips: [...], master_vendors: [...] }
            foreach ($masterCollections as $col) {
                if (isset($payload[$col]) && is_array($payload[$col])) {
                    foreach ($payload[$col] as $doc) {
                        if (!is_array($doc)) continue;
                        $docId = trim((string)($doc['id'] ?? $doc['code'] ?? $doc['platNomor'] ?? $doc['nama'] ?? ''));
                        if ($docId === '') continue;
                        $doc['id'] = $docId;
                        $existing = $store[$col][$docId] ?? [];
                        $store[$col][$docId] = array_merge($existing, $doc);
                        $saved++;
                    }
                }
            }
        }

        $store['updatedAt'] = gmdate('c');
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($store, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    echo json_encode([
        'success' => true,
        'savedCount' => $saved,
        'deletedCount' => $deleted,
        'updatedAt' => gmdate('c')
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Metode HTTP tidak didukung']);

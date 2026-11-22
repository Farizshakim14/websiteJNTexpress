<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Arsip & Cache Data Ritase Selesai (COMPLETED) & Import Excel Massal di Hosting cPanel
 * Menghemat hingga 85-95% Reads & Writes Firebase Firestore sambil menjaga 100% riwayat trip tetap tampil di sistem.
 */

require_once __DIR__ . '/_auth_helper.php';
jnt_apply_cors_headers('GET, POST, OPTIONS');

// Wajib autentikasi akun Firebase Auth resmi yang aktif (dengan cache token lokal 30 menit)
jnt_require_firebase_auth();

$logsDir = __DIR__ . '/logs/';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
jnt_ensure_htaccess_block($logsDir, true);

$archiveFile = $logsDir . 'trip_archive.json';

function jnt_default_archive_store() {
    return [
        'updatedAt' => gmdate('c'),
        'incoming' => [],
        'sla_outbound' => [],
        'monitoring_4h' => [],
        'sla_return' => [],
        'sla_roundtrip' => []
    ];
}

function jnt_read_archive_store($filePath) {
    if (!file_exists($filePath)) {
        return jnt_default_archive_store();
    }
    $content = @file_get_contents($filePath);
    if (!$content) {
        return jnt_default_archive_store();
    }
    $decoded = json_decode($content, true);
    if (!is_array($decoded)) {
        return jnt_default_archive_store();
    }
    $def = jnt_default_archive_store();
    foreach (['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'] as $col) {
        if (isset($decoded[$col]) && is_array($decoded[$col])) {
            $def[$col] = $decoded[$col];
        }
    }
    if (!empty($decoded['updatedAt'])) {
        $def['updatedAt'] = $decoded['updatedAt'];
    }
    return $def;
}

// 1. GET: Ambil seluruh riwayat trip yang diarsipkan di hosting untuk digabung (auto-merge) ke UI
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $store = jnt_read_archive_store($archiveFile);

    $incList = array_values($store['incoming']);
    $slaList = array_values($store['sla_outbound']);
    $monList = array_values($store['monitoring_4h']);
    $retList = array_values($store['sla_return']);
    $rtList  = array_values($store['sla_roundtrip']);

    echo json_encode([
        'success' => true,
        'updatedAt' => $store['updatedAt'],
        'counts' => [
            'incoming' => count($incList),
            'sla_outbound' => count($slaList),
            'monitoring_4h' => count($monList),
            'sla_return' => count($retList),
            'sla_roundtrip' => count($rtList)
        ],
        'incoming' => $incList,
        'sla_outbound' => $slaList,
        'monitoring_4h' => $monList,
        'sla_return' => $retList,
        'sla_roundtrip' => $rtList
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. POST: Simpan / Update (Single atau Batch Excel) atau Hapus Trip dari Arsip Hosting
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);

    if (!$payload || !is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Payload JSON tidak valid']);
        exit;
    }

    $action = $payload['action'] ?? 'upsert_batch';
    $collections = ['incoming', 'sla_outbound', 'monitoring_4h', 'sla_return', 'sla_roundtrip'];
    $savedCount = 0;
    $deletedCount = 0;

    $fp = fopen($archiveFile, 'c+');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal membuka file arsip di hosting']);
        exit;
    }

    if (flock($fp, LOCK_EX)) {
        $fileSize = filesize($archiveFile);
        $store = jnt_default_archive_store();
        if ($fileSize > 0) {
            $raw = fread($fp, $fileSize);
            $dec = json_decode($raw, true);
            if (is_array($dec)) {
                foreach ($collections as $col) {
                    if (isset($dec[$col]) && is_array($dec[$col])) {
                        $store[$col] = $dec[$col];
                    }
                }
            }
        }

        if ($action === 'delete_trip') {
            $kode = trim((string)($payload['kodeTugas'] ?? ''));
            $kodeBalikan = trim((string)($payload['kodeTugasBalikan'] ?? ($kode . '-RET')));
            if ($kode !== '') {
                foreach ($collections as $col) {
                    if (isset($store[$col][$kode])) {
                        unset($store[$col][$kode]);
                        $deletedCount++;
                    }
                    if ($kodeBalikan !== '' && isset($store[$col][$kodeBalikan])) {
                        unset($store[$col][$kodeBalikan]);
                        $deletedCount++;
                    }
                }
            }
        } elseif ($action === 'upsert_trip') {
            $kode = trim((string)($payload['kodeTugas'] ?? ''));
            if ($kode !== '') {
                foreach ($collections as $col) {
                    if (isset($payload[$col]) && is_array($payload[$col])) {
                        $doc = $payload[$col];
                        $docKey = trim((string)($doc['kodeTugas'] ?? $doc['id'] ?? $kode));
                        if ($docKey === '') $docKey = $kode;
                        $doc['id'] = $doc['id'] ?? $docKey;
                        $doc['kodeTugas'] = $doc['kodeTugas'] ?? $docKey;
                        $doc['_archivedInHosting'] = true;
                        $existing = $store[$col][$docKey] ?? [];
                        $store[$col][$docKey] = array_merge($existing, $doc);
                        $savedCount++;
                    }
                }
            }
        } else {
            // upsert_batch: mendukung format { trips: [ { kodeTugas, incoming, sla_outbound, monitoring_4h, ... } ] }
            // maupun format per-koleksi { incoming: [...], sla_outbound: [...], monitoring_4h: [...] }
            if (isset($payload['trips']) && is_array($payload['trips'])) {
                foreach ($payload['trips'] as $bundle) {
                    if (!is_array($bundle)) continue;
                    $kode = trim((string)($bundle['kodeTugas'] ?? ''));
                    foreach ($collections as $col) {
                        if (isset($bundle[$col]) && is_array($bundle[$col])) {
                            $doc = $bundle[$col];
                            $docKey = trim((string)($doc['kodeTugas'] ?? $doc['id'] ?? $kode));
                            if ($docKey === '') continue;
                            $doc['id'] = $doc['id'] ?? $docKey;
                            $doc['kodeTugas'] = $doc['kodeTugas'] ?? $docKey;
                            $doc['_archivedInHosting'] = true;
                            $existing = $store[$col][$docKey] ?? [];
                            $store[$col][$docKey] = array_merge($existing, $doc);
                            $savedCount++;
                        }
                    }
                }
            }

            foreach ($collections as $col) {
                if (isset($payload[$col]) && is_array($payload[$col])) {
                    foreach ($payload[$col] as $doc) {
                        if (!is_array($doc)) continue;
                        $docKey = trim((string)($doc['kodeTugas'] ?? $doc['id'] ?? ''));
                        if ($docKey === '') continue;
                        $doc['id'] = $doc['id'] ?? $docKey;
                        $doc['kodeTugas'] = $doc['kodeTugas'] ?? $docKey;
                        $doc['_archivedInHosting'] = true;
                        $existing = $store[$col][$docKey] ?? [];
                        $store[$col][$docKey] = array_merge($existing, $doc);
                        $savedCount++;
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
        'action' => $action,
        'savedCount' => $savedCount,
        'deletedCount' => $deletedCount,
        'updatedAt' => gmdate('c')
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Metode HTTP tidak didukung']);

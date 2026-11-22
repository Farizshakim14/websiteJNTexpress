<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Single-Session Lock & Status Online User di Hosting cPanel
 * Menggantikan koleksi Firestore 'active_sessions' sehingga heartbeat sesi & anti-double login memakai 0 Read & 0 Write Firestore.
 */

require_once __DIR__ . '/_auth_helper.php';
jnt_apply_cors_headers('GET, POST, OPTIONS');

jnt_require_firebase_auth();

$logsDir = __DIR__ . '/logs/';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}
jnt_ensure_htaccess_block($logsDir, true);

$sessionFile = $logsDir . 'active_sessions.json';
$staleMs = 600000; // 10 menit dalam milidetik

function jnt_clean_session_key($u) {
    return strtolower(preg_replace('/[^a-zA-Z0-9_\-\.@]/', '_', trim((string)$u)));
}

// 1. GET: Ambil daftar sesi aktif untuk indikator Online/Offline di User Management (users.html)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $sessions = [];
    if (file_exists($sessionFile)) {
        $raw = @file_get_contents($sessionFile);
        $dec = $raw ? json_decode($raw, true) : null;
        if (is_array($dec)) {
            $sessions = $dec;
        }
    }
    echo json_encode([
        'success' => true,
        'sessions' => array_values($sessions),
        'serverTimeMs' => round(microtime(true) * 1000)
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. POST: Acquire, Heartbeat, Release, atau Force Reset Sesi
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);
    if (!$payload || !is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
        exit;
    }

    $action = $payload['action'] ?? 'heartbeat';
    $username = trim((string)($payload['username'] ?? ''));
    $key = jnt_clean_session_key($username);
    $sessionId = trim((string)($payload['sessionId'] ?? ''));
    $userAgent = substr((string)($payload['userAgent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 300);
    $nowMs = round(microtime(true) * 1000);

    if ($key === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username wajib disertakan']);
        exit;
    }

    $fp = fopen($sessionFile, 'c+');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal mengakses penyimpanan sesi di hosting']);
        exit;
    }

    $response = ['success' => true, 'ok' => true];

    if (flock($fp, LOCK_EX)) {
        $fSize = filesize($sessionFile);
        $sessions = [];
        if ($fSize > 0) {
            $raw = fread($fp, $fSize);
            $dec = json_decode($raw, true);
            if (is_array($dec)) $sessions = $dec;
        }

        // Bersihkan sesi lama yang sudah tidak aktif > 24 jam agar file tetap kecil
        foreach ($sessions as $sKey => $sData) {
            $lastSeen = isset($sData['lastSeen']) ? (int)$sData['lastSeen'] : 0;
            if (($nowMs - $lastSeen) > 86400000) {
                unset($sessions[$sKey]);
            }
        }

        $existing = $sessions[$key] ?? null;

        if ($action === 'acquire') {
            $isSameBrowser = $existing && isset($existing['userAgent']) && $existing['userAgent'] === $userAgent;
            $isActiveOther = $existing && !empty($existing['sessionId']) && !$isSameBrowser && (($nowMs - (int)($existing['lastSeen'] ?? 0)) < $staleMs);

            if ($isActiveOther) {
                $response = [
                    'success' => true,
                    'ok' => false,
                    'message' => 'Akun sedang digunakan di perangkat atau browser lain.'
                ];
            } else {
                $newSid = $sessionId !== '' ? $sessionId : (base_convert((string)$nowMs, 10, 36) . substr(bin2hex(random_bytes(5)), 0, 8));
                $sessions[$key] = [
                    'username' => strtolower($username),
                    'sessionId' => $newSid,
                    'lastSeen' => $nowMs,
                    'userAgent' => $userAgent
                ];
                $response = [
                    'success' => true,
                    'ok' => true,
                    'sessionId' => $newSid,
                    'lastSeen' => $nowMs
                ];
            }
        } elseif ($action === 'heartbeat') {
            if ($existing && !empty($existing['sessionId']) && $sessionId !== '' && $existing['sessionId'] !== $sessionId) {
                $response = [
                    'success' => true,
                    'ok' => false,
                    'evicted' => true,
                    'message' => 'Sesi telah digantikan oleh perangkat lain.'
                ];
            } else {
                $sessions[$key] = [
                    'username' => strtolower($username),
                    'sessionId' => $sessionId !== '' ? $sessionId : ($existing['sessionId'] ?? ''),
                    'lastSeen' => $nowMs,
                    'userAgent' => $userAgent ?: ($existing['userAgent'] ?? '')
                ];
                $response = [
                    'success' => true,
                    'ok' => true,
                    'evicted' => false,
                    'lastSeen' => $nowMs
                ];
            }
        } elseif ($action === 'release') {
            if ($existing && ($sessionId === '' || ($existing['sessionId'] ?? '') === $sessionId)) {
                unset($sessions[$key]);
            }
            $response = ['success' => true, 'ok' => true];
        } elseif ($action === 'force_reset') {
            unset($sessions[$key]);
            $response = ['success' => true, 'ok' => true];
        }

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($sessions, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    echo json_encode($response);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Metode HTTP tidak didukung']);

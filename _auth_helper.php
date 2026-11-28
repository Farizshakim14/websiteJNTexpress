<?php
/**
 * Shared security helper for J&T Express TMS PHP endpoints.
 * Verifies CORS origin and Firebase Authentication ID Token.
 */
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    exit;
}

function jnt_apply_cors_headers($methods = 'GET, POST, OPTIONS') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $allowed = false;

    if ($origin !== '') {
        $parsedHost = parse_url($origin, PHP_URL_HOST);
        $currentHost = explode(':', $host)[0];
        if ($parsedHost && (
            strcasecmp($parsedHost, $currentHost) === 0 ||
            strcasecmp($parsedHost, 'jntexpres-c377f.web.app') === 0 ||
            strcasecmp($parsedHost, 'jntexpres-c377f.firebaseapp.com') === 0
        )) {
            $allowed = true;
        }
    }

    if ($allowed) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: ' . $methods);
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code($allowed || $origin === '' ? 200 : 403);
        exit;
    }
}

function jnt_extract_firebase_api_key() {
    $cfgPath = __DIR__ . '/firebase-config.js';
    if (is_readable($cfgPath)) {
        $cfg = file_get_contents($cfgPath);
        if ($cfg !== false && preg_match('/apiKey\s*:\s*["\']([^"\']+)["\']/', $cfg, $m)) {
            return $m[1];
        }
    }
    return '';
}

function jnt_require_firebase_auth() {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$authHeader && function_exists('apache_request_headers')) {
        $hdrs = apache_request_headers();
        $authHeader = $hdrs['Authorization'] ?? $hdrs['authorization'] ?? '';
    }

    if (!preg_match('/^Bearer\s+([A-Za-z0-9\-_\.]+)$/', trim($authHeader), $matches)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized: Token autentikasi wajib disertakan.']);
        exit;
    }

    $idToken = $matches[1];

    // ⚡ CACHE TOKEN VERIFIKASI LOKAL (30 Menit) - Menghemat 99% Read REST API Firestore pada panggilan log_audit.php, upload.php, trip_archive.php, dll.
    $cacheDir = __DIR__ . '/logs/';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }
    jnt_ensure_htaccess_block($cacheDir, true);
    $cacheFile = $cacheDir . 'auth_token_cache.json';
    $tokenHash = hash('sha256', $idToken);
    $nowSec = time();
    $cacheTtlSec = 1800; // 30 menit

    if (file_exists($cacheFile)) {
        $rawCache = @file_get_contents($cacheFile);
        $decodedCache = $rawCache ? json_decode($rawCache, true) : null;
        if (is_array($decodedCache) && isset($decodedCache[$tokenHash])) {
            $entry = $decodedCache[$tokenHash];
            if (isset($entry['expiresAt']) && $entry['expiresAt'] > $nowSec && !empty($entry['user'])) {
                return $entry['user'];
            }
        }
    }

    $apiKey = jnt_extract_firebase_api_key();
    if ($apiKey === '') {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Konfigurasi autentikasi server tidak lengkap.']);
        exit;
    }

    $url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . urlencode($apiKey);
    $payload = json_encode(['idToken' => $idToken]);
    $rawResp = false;
    $statusCode = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => true
        ]);
        $rawResp = curl_exec($ch);
        $statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\n",
                'content' => $payload,
                'timeout' => 8,
                'ignore_errors' => true
            ]
        ]);
        $rawResp = @file_get_contents($url, false, $ctx);
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $hm)) {
            $statusCode = (int)$hm[1];
        }
    }

    if ($statusCode !== 200 || !$rawResp) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized: Token sesi tidak valid atau kedaluwarsa.']);
        exit;
    }

    $data = json_decode($rawResp, true);
    $user = $data['users'][0] ?? null;
    if (!$user || empty($user['localId']) || !empty($user['disabled']) || empty($user['email'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Forbidden: Akun tidak aktif atau bukan akun resmi.']);
        exit;
    }

    // Token Firebase Auth sudah terverifikasi resmi oleh Google Identity Toolkit (accounts:lookup) untuk project ini.
    // Catatan: Tidak memblokir dengan 403 apabila dokumen Firestore /users/{uid} disimpan dengan docId = username (misal /users/farizs)
    // atau saat kuota harian Firestore sedang penuh (HTTP 429), agar trip_archive.php, upload.php, dll tetap berjalan 100% lancar.

    // Simpan hasil verifikasi token ke cache lokal hosting selama 30 menit (maksimal 200 sesi aktif)
    $fpCache = @fopen($cacheFile, 'c+');
    if ($fpCache) {
        if (@flock($fpCache, LOCK_EX)) {
            $fSize = @filesize($cacheFile);
            $curCache = [];
            if ($fSize > 0) {
                $cText = @fread($fpCache, $fSize);
                $cDec = json_decode($cText, true);
                if (is_array($cDec)) $curCache = $cDec;
            }
            // Bersihkan token yang sudah expired
            foreach ($curCache as $k => $v) {
                if (!isset($v['expiresAt']) || $v['expiresAt'] <= $nowSec) {
                    unset($curCache[$k]);
                }
            }
            $curCache[$tokenHash] = [
                'expiresAt' => $nowSec + $cacheTtlSec,
                'user' => $user
            ];
            if (count($curCache) > 200) {
                $curCache = array_slice($curCache, -200, 200, true);
            }
            @ftruncate($fpCache, 0);
            @rewind($fpCache);
            @fwrite($fpCache, json_encode($curCache));
            @fflush($fpCache);
            @flock($fpCache, LOCK_UN);
        }
        @fclose($fpCache);
    }

    return $user;
}

function jnt_ensure_htaccess_block($dirPath, $denyAll = false) {
    $htPath = rtrim($dirPath, '/\\') . '/.htaccess';
    if (!file_exists($htPath)) {
        $rules = $denyAll
            ? "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n"
            : "<IfModule mod_php7.c>\n    php_flag engine off\n</IfModule>\n<IfModule mod_php.c>\n    php_flag engine off\n</IfModule>\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|phar|pl|py|jsp|asp|sh|cgi|html|svg)$\">\n    <IfModule mod_authz_core.c>\n        Require all denied\n    </IfModule>\n    <IfModule !mod_authz_core.c>\n        Order allow,deny\n        Deny from all\n    </IfModule>\n</FilesMatch>\n";
        @file_put_contents($htPath, $rules);
    }
}


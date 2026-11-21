<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Upload Foto Bukti Sampai & Trouble ke Hosting (Secured)
 */

require_once __DIR__ . '/_auth_helper.php';
jnt_apply_cors_headers('POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Hanya menerima request POST']);
    exit;
}

// Wajib autentikasi akun Firebase Auth resmi yang aktif
jnt_require_firebase_auth();

$uploadDir = __DIR__ . '/uploads/';
if (!is_dir($uploadDir)) {
    if (!@mkdir($uploadDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal membuat folder uploads di hosting']);
        exit;
    }
}
jnt_ensure_htaccess_block($uploadDir, false);

$allowedMimeToExt = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp'
];
$maxBytes = 8 * 1024 * 1024; // 8 MB

function jnt_validate_image_bytes($bytes, $allowedMimeToExt) {
    if (!is_string($bytes) || strlen($bytes) === 0 || strlen($bytes) > (8 * 1024 * 1024)) {
        return null;
    }
    $info = @getimagesizefromstring($bytes);
    if ($info === false || empty($info['mime']) || !isset($allowedMimeToExt[$info['mime']])) {
        return null;
    }
    return $allowedMimeToExt[$info['mime']];
}

// 1. Cek jika file dikirim via multipart/form-data ($_FILES)
if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['file'];
    if ($file['size'] > $maxBytes || !is_uploaded_file($file['tmp_name'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Ukuran file melebihi batas maksimal 8MB atau tidak valid']);
        exit;
    }

    $bytes = @file_get_contents($file['tmp_name']);
    $validatedExt = jnt_validate_image_bytes($bytes, $allowedMimeToExt);
    if (!$validatedExt) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Format file tidak valid (hanya gambar JPG, PNG, atau WebP asli yang diizinkan)']);
        exit;
    }

    $prefix = 'bukti_';
    if (!empty($_POST['prefix'])) {
        $cleanPrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['prefix']);
        if ($cleanPrefix !== '') $prefix = $cleanPrefix . '_';
    }
    $fileName = uniqid($prefix, true) . '.' . $validatedExt;
    $targetPath = $uploadDir . $fileName;

    if (file_put_contents($targetPath, $bytes, LOCK_EX) !== false) {
        sendResponse($fileName);
        exit;
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Gagal menyimpan file gambar di hosting']);
    exit;
}

// 2. Cek jika dikirim via Base64 JSON atau POST (body/form)
$rawInput = file_get_contents('php://input');
$jsonData = json_decode($rawInput, true);
$base64Data = null;
$prefix = 'bukti_';

if ($jsonData && isset($jsonData['image'])) {
    $base64Data = $jsonData['image'];
    if (!empty($jsonData['prefix'])) {
        $cleanPrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $jsonData['prefix']);
        if ($cleanPrefix !== '') $prefix = $cleanPrefix . '_';
    }
} elseif (isset($_POST['image'])) {
    $base64Data = $_POST['image'];
    if (!empty($_POST['prefix'])) {
        $cleanPrefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['prefix']);
        if ($cleanPrefix !== '') $prefix = $cleanPrefix . '_';
    }
}

if ($base64Data) {
    if (preg_match('/^data:image\/(jpeg|jpg|png|webp);base64,/i', $base64Data)) {
        $data = substr($base64Data, strpos($base64Data, ',') + 1);
    } elseif (strpos($base64Data, 'data:') === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Format gambar Base64 tidak didukung']);
        exit;
    } else {
        $data = $base64Data;
    }

    $decoded = base64_decode($data, true);
    $validatedExt = jnt_validate_image_bytes($decoded, $allowedMimeToExt);
    if (!$validatedExt) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Payload bukan gambar JPG, PNG, atau WebP yang sah']);
        exit;
    }

    $fileName = uniqid($prefix, true) . '.' . $validatedExt;
    $targetPath = $uploadDir . $fileName;

    if (file_put_contents($targetPath, $decoded, LOCK_EX) !== false) {
        sendResponse($fileName);
        exit;
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Gagal menulis file gambar ke hosting']);
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Tidak ada file atau data gambar yang diterima']);
exit;

function sendResponse($fileName) {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scriptDir = dirname($_SERVER['SCRIPT_NAME'] ?? '');
    $baseUrl = rtrim($protocol . $host . $scriptDir, '/\\');
    $fullUrl = $baseUrl . '/uploads/' . $fileName;

    echo json_encode([
        'success' => true,
        'url' => $fullUrl,
        'relativeUrl' => 'uploads/' . $fileName,
        'fileName' => $fileName
    ]);
}

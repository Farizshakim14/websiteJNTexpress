<?php
/**
 * J&T Express - Transportation Monitoring System
 * Endpoint Upload Foto Bukti Sampai & Trouble ke Hosting
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

// Tangani Preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Hanya menerima request POST']);
    exit;
}

// Folder target upload
$uploadDir = __DIR__ . '/uploads/';
if (!is_dir($uploadDir)) {
    if (!@mkdir($uploadDir, 0755, true)) {
        echo json_encode(['success' => false, 'message' => 'Gagal membuat folder uploads di hosting']);
        exit;
    }
}

// 1. Cek jika file dikirim via multipart/form-data ($_FILES)
if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['file'];
    $allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

    if (!in_array($ext, $allowedExts)) {
        echo json_encode(['success' => false, 'message' => 'Format file tidak didukung (harus JPG, PNG, atau WebP)']);
        exit;
    }

    $fileName = uniqid('bukti_', true) . '.' . $ext;
    $targetPath = $uploadDir . $fileName;

    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
        sendResponse($fileName);
        exit;
    } else {
        echo json_encode(['success' => false, 'message' => 'Gagal memindahkan file yang diunggah']);
        exit;
    }
}

// 2. Cek jika dikirim via Base64 JSON atau POST (body/form)
$rawInput = file_get_contents('php://input');
$jsonData = json_decode($rawInput, true);
$base64Data = null;
$prefix = 'bukti_';

if ($jsonData && isset($jsonData['image'])) {
    $base64Data = $jsonData['image'];
    if (!empty($jsonData['prefix'])) $prefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $jsonData['prefix']) . '_';
} elseif (isset($_POST['image'])) {
    $base64Data = $_POST['image'];
    if (!empty($_POST['prefix'])) $prefix = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['prefix']) . '_';
}

if ($base64Data) {
    if (preg_match('/^data:image\/(\w+);base64,/', $base64Data, $type)) {
        $data = substr($base64Data, strpos($base64Data, ',') + 1);
        $ext = strtolower($type[1]);
        if ($ext === 'jpeg') $ext = 'jpg';
    } else {
        $data = $base64Data;
        $ext = 'jpg';
    }

    $decoded = base64_decode($data);
    if ($decoded === false) {
        echo json_encode(['success' => false, 'message' => 'Gagal mendecode data Base64']);
        exit;
    }

    $fileName = uniqid($prefix, true) . '.' . $ext;
    $targetPath = $uploadDir . $fileName;

    if (file_put_contents($targetPath, $decoded)) {
        sendResponse($fileName);
        exit;
    } else {
        echo json_encode(['success' => false, 'message' => 'Gagal menulis file gambar ke hosting']);
        exit;
    }
}

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

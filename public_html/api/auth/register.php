<?php
declare(strict_types=1);
header('Content-Type: application/json');
require __DIR__ . '/../lib/Auth.php';
require __DIR__ . '/../lib/RateLimiter.php';
Auth::ensureSession();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Body JSON tidak valid.']);
    exit;
}
$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);

// --- Throttle registrations per IP to prevent mass account creation. ---
$limiter = new RateLimiter($dataDir . '/ratelimit.db');
if (!$limiter->checkAndRecord('register_' . RateLimiter::clientIp(), 5, 300)) {
    http_response_code(429);
    echo json_encode(['error' => 'Terlalu banyak percobaan registrasi. Tunggu sebentar lalu coba lagi.']);
    exit;
}

$auth = new Auth($dataDir . '/users.db');
$result = $auth->register($body['name'] ?? '', $body['email'] ?? '', $body['password'] ?? '');

if (!$result['ok']) {
    http_response_code(400);
    echo json_encode(['error' => $result['error']]);
    exit;
}

echo json_encode(['ok' => true, 'user' => Auth::currentUser()]);

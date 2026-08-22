<?php
declare(strict_types=1);
header('Content-Type: application/json');
require __DIR__ . '/../lib/Auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

Auth::logout();
echo json_encode(['ok' => true]);

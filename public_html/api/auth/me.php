<?php
declare(strict_types=1);
header('Content-Type: application/json');
require __DIR__ . '/../lib/Auth.php';
echo json_encode(['user' => Auth::currentUser()]);

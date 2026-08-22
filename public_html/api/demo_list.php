<?php
/**
 * Lightweight endpoint the client calls once on load to populate the
 * "✨ Try These Prompts" button row without hardcoding labels in JS.
 */
declare(strict_types=1);
header('Content-Type: application/json');
require __DIR__ . '/lib/DemoPrompts.php';

$out = [];
foreach (DemoPrompts::all() as $key => $demo) {
    $out[] = ['key' => $key, 'label' => $demo['label'], 'prompt' => $demo['prompt']];
}
echo json_encode($out);

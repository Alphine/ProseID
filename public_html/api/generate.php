<?php
/**
 * Main API proxy endpoint (SDD 2, 3.3, 5).
 * POST JSON body: { "prompt": string, "sceneSummary": [{id,card,params}, ...] }
 * Response JSON: { "calls": [...] }  or  { "error": string } with 4xx status.
 *
 * Pipeline: rate-limit → daily budget → input validation → cache lookup
 * (organic) → (miss) call LLM (or mock) → sanity check → cache store → reply.
 */

declare(strict_types=1);
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/lib/Auth.php';
require __DIR__ . '/lib/CardCatalog.php';
require __DIR__ . '/lib/RateLimiter.php';
require __DIR__ . '/lib/Cache.php';
require __DIR__ . '/lib/SanityChecker.php';
require __DIR__ . '/lib/InputValidator.php';
require __DIR__ . '/lib/MockNLU.php';
require __DIR__ . '/lib/DemoPrompts.php';
require __DIR__ . '/lib/LLMClient.php';

$configPath = __DIR__ . '/config/secrets.php';
$config = file_exists($configPath) ? require $configPath : [];

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'Method not allowed.']);
}

// --- Require a logged-in session — the compose UI is gated behind login,
// and the API mirrors that gate since this endpoint could be hit directly
// without going through the browser UI (SDD 3.3e rationale extended to auth). ---
$user = Auth::requireLogin();

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    respond(400, ['error' => 'Body JSON tidak valid.']);
}

$sceneSummary = is_array($body['sceneSummary'] ?? null) ? $body['sceneSummary'] : [];
$currentSceneCount = count($sceneSummary);

// --- Demo / curated path — skips rate limit & live API entirely (SDD 5 step 2) ---
if (!empty($body['demoKey'])) {
    $demo = DemoPrompts::find((string) $body['demoKey']);
    if (!$demo) {
        respond(404, ['error' => 'Demo prompt tidak ditemukan.']);
    }
    $checked = SanityChecker::check(['calls' => $demo['calls']], 0); // demo always starts a fresh scene
    respond(200, ['calls' => $checked['calls'], 'source' => 'curated_demo', 'label' => $demo['label']]);
}

// --- Identify caller for rate limiting: authenticated user id (falls back
// to IP, though every request past this point is already logged-in). ---
$identifier = 'user_' . $user['id'];

$limiter = new RateLimiter($dataDir . '/ratelimit.db');
if (!$limiter->checkDailyBudget((int) ($config['DAILY_BUDGET'] ?? 500))) {
    respond(429, ['error' => 'Kuota harian API sudah habis. Coba lagi besok, atau gunakan tombol contoh cached.']);
}
if (!$limiter->checkAndRecord($identifier, 10, 60)) {
    respond(429, ['error' => 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.']);
}

// --- Validate & sanitize input (SDD 3.3d) ---
$validated = InputValidator::validate($body['prompt'] ?? null);
if (!$validated['ok']) {
    respond(400, ['error' => $validated['error']]);
}
$prompt = $validated['prompt'];

// --- Cost-saving cache lookup (organic, exact-match hash) ---
$cache = new SceneCache($dataDir . '/cache.db');
$promptHash = SceneCache::hash($prompt . '|' . json_encode($sceneSummary));
$cached = $cache->get($promptHash);

if ($cached !== null) {
    $checked = SanityChecker::check($cached, $currentSceneCount);
    if (!$checked['ok']) {
        respond(400, ['error' => $checked['error']]);
    }
    respond(200, ['calls' => $checked['calls'], 'source' => 'cache']);
}

// --- Live LLM call (or mock NLU fallback if no key configured) ---
$toolCalls = LLMClient::generate($config, $prompt, $sceneSummary);

// --- Sanity check server-side before forwarding to client (SDD 3.3e) ---
$checked = SanityChecker::check($toolCalls, $currentSceneCount);
if (!$checked['ok']) {
    respond(400, ['error' => $checked['error']]);
}

// --- Store in cost-saving cache for next time ---
$cache->put($promptHash, ['calls' => $checked['calls']], 'organic');

respond(200, ['calls' => $checked['calls'], 'source' => 'live']);

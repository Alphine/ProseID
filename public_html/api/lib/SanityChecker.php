<?php
/**
 * Server-side sanity check on LLM output before it's forwarded to the
 * client (SDD 3.3e / 6). Required because the PHP endpoint could be hit
 * directly without going through the UI/browser.
 */

final class SanityChecker
{
    // Keep this in sync with RENDER_PERF_CEILING in js/cardCatalog.js — no
    // shared build step (project intentionally has no npm/bundler in
    // production, see SDD stack line), so it's duplicated by hand. This is
    // the server-side enforcement; the client has its own copy as the
    // "second layer" (SDD 3.4 / 6).
    public const MAX_OBJECTS_PER_SCENE = 50; // aligned with 3.2 render performance ceiling
    private const VALID_RELATION_POSITIONS = ['beside', 'on_top_of', 'behind', 'in_front_of', 'scattered_around'];

    /**
     * @return array{ok: bool, error?: string, calls?: array}
     */
    public static function check(array $toolCalls, int $currentSceneCount = 0): array
    {
        if (!isset($toolCalls['calls']) || !is_array($toolCalls['calls'])) {
            return ['ok' => false, 'error' => 'Format tool call tidak valid.'];
        }

        $calls = $toolCalls['calls'];
        $addCount = 0;
        foreach ($calls as $c) {
            if (($c['action'] ?? 'add') === 'add') {
                $addCount++;
            }
        }
        if ($currentSceneCount + $addCount > self::MAX_OBJECTS_PER_SCENE) {
            return ['ok' => false, 'error' => 'Scene terlalu kompleks, coba prompt lebih spesifik.'];
        }

        $clean = [];
        foreach ($calls as $call) {
            $action = $call['action'] ?? 'add';
            if (!in_array($action, ['add', 'modify', 'remove'], true)) {
                continue; // reject/skip — jangan diteruskan mentah ke client
            }
            // Restrict id to a safe charset — this string reaches the client
            // via innerHTML-adjacent DOM code, so a prompt-injected LLM
            // response smuggling markup in `id` must be rejected here, not
            // just relied on client-side escaping to catch.
            if (!isset($call['id']) || !is_string($call['id']) || !preg_match('/^[a-zA-Z0-9_-]{1,64}$/', $call['id'])) {
                continue;
            }
            if ($action === 'add') {
                if (!isset($call['card']) || !CardCatalog::isValid($call['card'])) {
                    continue; // whitelist violation
                }
            }
            // Validate relation shape if present — position must be a known
            // enum value and offset (if given) must be a finite number, so
            // the client's layoutEngine fallback isn't the only line of
            // defense against a malformed tool call.
            if (isset($call['relation'])) {
                if (!is_array($call['relation'])) {
                    unset($call['relation']);
                } else {
                    $rel = $call['relation'];
                    $posOk = isset($rel['position']) && in_array($rel['position'], self::VALID_RELATION_POSITIONS, true);
                    $toOk = isset($rel['to']) && is_string($rel['to']) && $rel['to'] !== '';
                    $offsetOk = !isset($rel['offset']) || (is_numeric($rel['offset']) && is_finite((float) $rel['offset']));
                    if (!$posOk || !$toOk || !$offsetOk) {
                        unset($call['relation']);
                    }
                }
            }
            // PHP encodes an empty assoc array as JSON "[]" not "{}" — force
            // object shape so the client always gets a params object.
            if (isset($call['params']) && is_array($call['params']) && count($call['params']) === 0) {
                $call['params'] = new stdClass();
            }
            $clean[] = $call;
        }

        return ['ok' => true, 'calls' => $clean];
    }
}

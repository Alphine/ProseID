<?php
/**
 * Input validation & sanitation before forwarding to the LLM (SDD 3.3d).
 * Length cap + a keyword heuristic against casual prompt-injection attempts.
 * Not airtight (nothing string-based ever is), but it stops the common,
 * casual cases; the system prompt itself also refuses override attempts.
 */

final class InputValidator
{
    public const MAX_PROMPT_LENGTH = 500;

    private const INJECTION_PATTERNS = [
        '/ignore (all|previous|prior|above) instructions?/i',
        '/disregard (all|previous|prior|above)/i',
        '/system prompt/i',
        '/you are now/i',
        '/reveal your (instructions|prompt|system)/i',
        '/act as (?!a\b)/i', // "act as X" jailbreak framing (allow "act as a ..." loosely, still flagged for review)
        '/jailbreak/i',
        '/\bDAN\b/', // "Do Anything Now" style
    ];

    /** @return array{ok: bool, error?: string, prompt?: string, flagged?: bool} */
    public static function validate(?string $prompt): array
    {
        if ($prompt === null || trim($prompt) === '') {
            return ['ok' => false, 'error' => 'Prompt tidak boleh kosong.'];
        }
        $prompt = trim($prompt);
        if (mb_strlen($prompt) > self::MAX_PROMPT_LENGTH) {
            return ['ok' => false, 'error' => 'Prompt terlalu panjang (maks ' . self::MAX_PROMPT_LENGTH . ' karakter).'];
        }

        $flagged = false;
        foreach (self::INJECTION_PATTERNS as $pattern) {
            if (preg_match($pattern, $prompt)) {
                $flagged = true;
                break;
            }
        }
        // We don't hard-block on heuristic match (too many false positives),
        // but we strip the flagged framing language and keep the rest —
        // combined with the system prompt's explicit refusal to be
        // overridden, this contains casual attempts without breaking
        // legitimate prompts that happen to share vocabulary.
        if ($flagged) {
            $prompt = preg_replace(self::INJECTION_PATTERNS, '[filtered]', $prompt);
        }

        return ['ok' => true, 'prompt' => $prompt, 'flagged' => $flagged];
    }
}

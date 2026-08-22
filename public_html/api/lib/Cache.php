<?php
/**
 * Cache layer (SDD 3.3f). The `source` column was designed to carry two
 * values — 'organic' (cost-saving exact-match cache, actually written by
 * generate.php below) and 'curated_demo' (hand-curated demo prompts) — but
 * only 'organic' is ever actually written here; curated demo prompts are
 * served straight from DemoPrompts::find() (see generate.php) and never
 * touch this table. Kept as-is rather than removed since a future demo-prep
 * script could legitimately want to pre-seed this table with source=
 * 'curated_demo' rows, but nothing does today.
 */

final class SceneCache
{
    private PDO $db;

    public function __construct(string $dbPath)
    {
        $this->db = new PDO('sqlite:' . $dbPath);
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS prompt_cache (
                prompt_hash TEXT PRIMARY KEY,
                tool_call_json TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )'
        );
    }

    public static function hash(string $prompt): string
    {
        // normalize: lowercase + trim + collapse whitespace, so near-identical
        // organic prompts still exact-match.
        $norm = strtolower(trim(preg_replace('/\s+/', ' ', $prompt)));
        return hash('sha256', $norm);
    }

    public function get(string $promptHash): ?array
    {
        $stmt = $this->db->prepare('SELECT tool_call_json FROM prompt_cache WHERE prompt_hash = ?');
        $stmt->execute([$promptHash]);
        $row = $stmt->fetchColumn();
        return $row ? json_decode($row, true) : null;
    }

    public function put(string $promptHash, array $toolCallJson, string $source = 'organic'): void
    {
        $stmt = $this->db->prepare(
            'INSERT OR REPLACE INTO prompt_cache (prompt_hash, tool_call_json, source, created_at) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$promptHash, json_encode($toolCallJson), $source, time()]);
    }
}

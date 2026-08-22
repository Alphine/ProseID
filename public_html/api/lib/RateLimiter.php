<?php
/**
 * Rate limiting per session/IP using SQLite, no external dependency
 * (SDD 3.3b) + daily budget cap (SDD 3.3c) as a cost safety net.
 */

final class RateLimiter
{
    private PDO $db;

    public function __construct(string $dbPath)
    {
        $this->db = new PDO('sqlite:' . $dbPath);
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identifier TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )'
        );
        $this->db->exec('CREATE INDEX IF NOT EXISTS idx_requests_id_ts ON requests(identifier, timestamp)');
    }

    public function checkAndRecord(string $identifier, int $maxRequests = 10, int $windowSeconds = 60): bool
    {
        $now = time();
        $windowStart = $now - $windowSeconds;
        $this->db->exec('DELETE FROM requests WHERE timestamp < ' . ($now - 86400)); // periodic cleanup

        $stmt = $this->db->prepare('SELECT COUNT(*) FROM requests WHERE identifier = ? AND timestamp > ?');
        $stmt->execute([$identifier, $windowStart]);
        if ((int) $stmt->fetchColumn() >= $maxRequests) {
            return false;
        }

        $this->db->prepare('INSERT INTO requests (identifier, timestamp) VALUES (?, ?)')
            ->execute([$identifier, $now]);
        return true;
    }

    public function checkDailyBudget(int $maxCallsPerDay = 500): bool
    {
        $todayStart = strtotime('today midnight');
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM requests WHERE timestamp >= ?');
        $stmt->execute([$todayStart]);
        return (int) $stmt->fetchColumn() < $maxCallsPerDay;
    }

    /** Best-effort client IP for pre-auth rate limiting (login/register). */
    public static function clientIp(): string
    {
        return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
}

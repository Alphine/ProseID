<?php
/**
 * Minimal session-based auth backed by SQLite — no framework, no external
 * dependency, matches the "PHP vanilla shared hosting" constraint from the
 * SDD. Not meant to replace a full auth system, but gives every scene the
 * per-user boundary the SDD's open question #... (public, unauthenticated
 * endpoint) previously left open — the API proxy now requires a session.
 */

final class Auth
{
    private PDO $db;

    public function __construct(string $dbPath)
    {
        $this->db = new PDO('sqlite:' . $dbPath);
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->exec(
            'CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )'
        );
    }

    public static function ensureSession(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || ($_SERVER['SERVER_PORT'] ?? null) === '443'
                || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null) === 'https';
            session_start([
                'cookie_httponly' => true,
                'cookie_samesite' => 'Lax',
                'cookie_secure' => $https,
            ]);
        }
    }

    /** @return array{ok:bool, error?:string} */
    public function register(string $name, string $email, string $password): array
    {
        $name = trim($name);
        $email = strtolower(trim($email));

        if (mb_strlen($name) < 2) {
            return ['ok' => false, 'error' => 'Nama minimal 2 karakter.'];
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'error' => 'Email tidak valid.'];
        }
        if (mb_strlen($password) < 6) {
            return ['ok' => false, 'error' => 'Password minimal 6 karakter.'];
        }

        $stmt = $this->db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetchColumn()) {
            return ['ok' => false, 'error' => 'Email sudah terdaftar. Coba login.'];
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $this->db->prepare('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$name, $email, $hash, time()]);

        $userId = (int) $this->db->lastInsertId();
        $this->loginSession($userId, $name, $email);
        return ['ok' => true];
    }

    /** @return array{ok:bool, error?:string} */
    public function login(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        $stmt = $this->db->prepare('SELECT id, name, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || !password_verify($password, $row['password_hash'])) {
            return ['ok' => false, 'error' => 'Email atau password salah.'];
        }

        $this->loginSession((int) $row['id'], $row['name'], $email);
        return ['ok' => true];
    }

    private function loginSession(int $userId, string $name, string $email): void
    {
        self::ensureSession();
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['user_name'] = $name;
        $_SESSION['user_email'] = $email;
    }

    public static function logout(): void
    {
        self::ensureSession();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
    }

    /** @return array{id:int,name:string,email:string}|null */
    public static function currentUser(): ?array
    {
        self::ensureSession();
        if (empty($_SESSION['user_id'])) {
            return null;
        }
        return [
            'id' => (int) $_SESSION['user_id'],
            'name' => $_SESSION['user_name'] ?? '',
            'email' => $_SESSION['user_email'] ?? '',
        ];
    }

    public static function requireLogin(): array
    {
        $user = self::currentUser();
        if (!$user) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Silakan login terlebih dahulu.']);
            exit;
        }
        return $user;
    }
}

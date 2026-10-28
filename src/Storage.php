<?php
declare(strict_types=1);

/** Persistence for accounts and saves. Drivers: sqlite, mysql (PDO) or plain JSON files. */
abstract class Storage
{
    abstract public function driver(): string;
    abstract public function describe(): array;
    /** @return int|null new user id, or null when the name is taken */
    abstract public function createUser(string $name, string $hash): ?int;
    abstract public function userByName(string $name): ?array;
    abstract public function userById(int $id): ?array;
    abstract public function setFailures(int $id, int $count, int $lockedUntil): void;
    abstract public function deleteUser(int $id): void;
    abstract public function getSave(int $id): ?array;
    abstract public function putSave(int $id, string $json): void;

    public static function open(array $cfg): Storage
    {
        $driver = $cfg['driver'] ?? 'auto';
        $my = $cfg['mysql'] ?? [];
        if ($driver === 'auto') {
            if (!empty($my['user']) && extension_loaded('pdo_mysql')) {
                $driver = 'mysql';
            } elseif (extension_loaded('pdo_sqlite')) {
                $driver = 'sqlite';
            } else {
                $driver = 'json';
            }
        }
        try {
            if ($driver === 'mysql') {
                $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $my['host'], $my['port'], $my['database'], $my['charset'] ?? 'utf8mb4');
                $pdo = new PDO($dsn, (string)$my['user'], (string)$my['password']);
                return new PdoStorage($pdo, 'mysql', $my['host'] . '/' . $my['database']);
            }
            if ($driver === 'sqlite') {
                $path = $cfg['sqlite_path'];
                if (!is_dir(dirname($path))) {
                    mkdir(dirname($path), 0700, true);
                }
                return new PdoStorage(new PDO('sqlite:' . $path), 'sqlite', basename($path));
            }
        } catch (Throwable $e) {
            error_log('Coyote Pack storage fallback to JSON: ' . $e->getMessage());
            $s = new JsonStorage($cfg['json_dir']);
            $s->note = 'Requested "' . $driver . '" driver failed; using JSON files.';
            return $s;
        }
        return new JsonStorage($cfg['json_dir']);
    }
}

final class PdoStorage extends Storage
{
    public function __construct(private PDO $pdo, private string $kind, private string $label)
    {
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->migrate();
    }

    private function migrate(): void
    {
        $auto = $this->kind === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $text = $this->kind === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS cp_users (
            id $auto,
            username VARCHAR(32) NOT NULL UNIQUE,
            display VARCHAR(32) NOT NULL,
            pass_hash VARCHAR(255) NOT NULL,
            created_at INT NOT NULL,
            fail_count INT NOT NULL DEFAULT 0,
            locked_until INT NOT NULL DEFAULT 0
        )");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS cp_saves (
            user_id INT NOT NULL PRIMARY KEY,
            data $text NOT NULL,
            updated_at INT NOT NULL
        )");
    }

    public function driver(): string { return $this->kind; }

    public function describe(): array
    {
        return ['driver' => $this->kind, 'target' => $this->label, 'type' => 'SQL database'];
    }

    public function createUser(string $name, string $hash): ?int
    {
        try {
            $st = $this->pdo->prepare('INSERT INTO cp_users (username, display, pass_hash, created_at) VALUES (?,?,?,?)');
            $st->execute([strtolower($name), $name, $hash, time()]);
            return (int)$this->pdo->lastInsertId();
        } catch (PDOException $e) {
            return null;
        }
    }

    private function mapUser(array|false $r): ?array
    {
        return $r ? ['id' => (int)$r['id'], 'name' => $r['display'], 'hash' => $r['pass_hash'], 'fails' => (int)$r['fail_count'], 'locked' => (int)$r['locked_until']] : null;
    }

    public function userByName(string $name): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM cp_users WHERE username = ?');
        $st->execute([strtolower($name)]);
        return $this->mapUser($st->fetch());
    }

    public function userById(int $id): ?array
    {
        $st = $this->pdo->prepare('SELECT * FROM cp_users WHERE id = ?');
        $st->execute([$id]);
        return $this->mapUser($st->fetch());
    }

    public function setFailures(int $id, int $count, int $lockedUntil): void
    {
        $this->pdo->prepare('UPDATE cp_users SET fail_count = ?, locked_until = ? WHERE id = ?')->execute([$count, $lockedUntil, $id]);
    }

    public function deleteUser(int $id): void
    {
        $this->pdo->prepare('DELETE FROM cp_saves WHERE user_id = ?')->execute([$id]);
        $this->pdo->prepare('DELETE FROM cp_users WHERE id = ?')->execute([$id]);
    }

    public function getSave(int $id): ?array
    {
        $st = $this->pdo->prepare('SELECT data, updated_at FROM cp_saves WHERE user_id = ?');
        $st->execute([$id]);
        $r = $st->fetch();
        return $r ? ['data' => $r['data'], 'updated' => (int)$r['updated_at']] : null;
    }

    public function putSave(int $id, string $json): void
    {
        $this->pdo->prepare('DELETE FROM cp_saves WHERE user_id = ?')->execute([$id]);
        $this->pdo->prepare('INSERT INTO cp_saves (user_id, data, updated_at) VALUES (?,?,?)')->execute([$id, $json, time()]);
    }
}

final class JsonStorage extends Storage
{
    public string $note = '';

    public function __construct(private string $dir)
    {
        if (!is_dir($dir . '/saves')) {
            mkdir($dir . '/saves', 0700, true);
        }
    }

    public function driver(): string { return 'json'; }

    public function describe(): array
    {
        $d = ['driver' => 'json', 'target' => 'data/json/', 'type' => 'Flat JSON files'];
        if ($this->note) {
            $d['note'] = $this->note;
        }
        return $d;
    }

    /** Run $fn(array &$db) under an exclusive lock on users.json and persist the result. */
    private function mutate(callable $fn): mixed
    {
        $fh = fopen($this->dir . '/users.json', 'c+');
        flock($fh, LOCK_EX);
        $raw = stream_get_contents($fh);
        $db = $raw ? (json_decode($raw, true) ?: []) : [];
        $db += ['next' => 1, 'users' => []];
        $out = $fn($db);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($db));
        fflush($fh);
        flock($fh, LOCK_UN);
        fclose($fh);
        return $out;
    }

    private function read(): array
    {
        $raw = @file_get_contents($this->dir . '/users.json');
        $db = $raw ? (json_decode($raw, true) ?: []) : [];
        return $db + ['next' => 1, 'users' => []];
    }

    private function map(?array $u): ?array
    {
        return $u ? ['id' => $u['id'], 'name' => $u['display'], 'hash' => $u['hash'], 'fails' => $u['fails'] ?? 0, 'locked' => $u['locked'] ?? 0] : null;
    }

    public function createUser(string $name, string $hash): ?int
    {
        return $this->mutate(function (array &$db) use ($name, $hash) {
            $key = strtolower($name);
            foreach ($db['users'] as $u) {
                if ($u['key'] === $key) {
                    return null;
                }
            }
            $id = $db['next']++;
            $db['users'][(string)$id] = ['id' => $id, 'key' => $key, 'display' => $name, 'hash' => $hash, 'created' => time(), 'fails' => 0, 'locked' => 0];
            return $id;
        });
    }

    public function userByName(string $name): ?array
    {
        $key = strtolower($name);
        foreach ($this->read()['users'] as $u) {
            if ($u['key'] === $key) {
                return $this->map($u);
            }
        }
        return null;
    }

    public function userById(int $id): ?array
    {
        return $this->map($this->read()['users'][(string)$id] ?? null);
    }

    public function setFailures(int $id, int $count, int $lockedUntil): void
    {
        $this->mutate(function (array &$db) use ($id, $count, $lockedUntil) {
            if (isset($db['users'][(string)$id])) {
                $db['users'][(string)$id]['fails'] = $count;
                $db['users'][(string)$id]['locked'] = $lockedUntil;
            }
        });
    }

    public function deleteUser(int $id): void
    {
        $this->mutate(function (array &$db) use ($id) {
            unset($db['users'][(string)$id]);
        });
        @unlink($this->savePath($id));
    }

    private function savePath(int $id): string
    {
        return $this->dir . '/saves/' . $id . '.json';
    }

    public function getSave(int $id): ?array
    {
        $p = $this->savePath($id);
        if (!is_file($p)) {
            return null;
        }
        return ['data' => (string)file_get_contents($p), 'updated' => (int)filemtime($p)];
    }

    public function putSave(int $id, string $json): void
    {
        file_put_contents($this->savePath($id), $json, LOCK_EX);
    }
}

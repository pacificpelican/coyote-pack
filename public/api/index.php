<?php
declare(strict_types=1);

require __DIR__ . '/../../src/Storage.php';
require __DIR__ . '/../../src/Ai.php';

$root = dirname(__DIR__, 2);
$config = require $root . '/config.php';
if (is_file($root . '/config.local.php')) {
    $config = array_replace_recursive($config, require $root . '/config.local.php');
}
$config['ai']['_backoff_file'] = $root . '/data/ai_backoff.txt';
if (!is_dir($root . '/data')) {
    @mkdir($root . '/data', 0700, true);
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

session_name('coyotepack');
session_set_cookie_params([
    'lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
session_start();
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

function out(array $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $msg, int $code = 400): never
{
    out(['ok' => false, 'error' => $msg], $code);
}

function body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 262145);
    if ($raw === false || strlen($raw) > 262144) {
        fail('Request too large', 413);
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

$action = (string)($_GET['a'] ?? 'status');
$method = $_SERVER['REQUEST_METHOD'];
$isPost = $method === 'POST';

if ($isPost) {
    $tok = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($tok) || !hash_equals($_SESSION['csrf'], $tok)) {
        fail('Bad CSRF token. Reload the page.', 403);
    }
}

try {
    $store = Storage::open($config['storage']);
} catch (Throwable $e) {
    error_log($e->getMessage());
    fail('Storage unavailable', 500);
}
$ai = new Ai($config['ai']);

$user = null;
if (!empty($_SESSION['uid'])) {
    $user = $store->userById((int)$_SESSION['uid']);
    if (!$user) {
        unset($_SESSION['uid']);
    }
}

function requireUser(?array $user): array
{
    if (!$user) {
        fail('Not logged in', 401);
    }
    return $user;
}

switch ($action) {
    case 'status':
        out([
            'ok' => true,
            'csrf' => $_SESSION['csrf'],
            'user' => $user['name'] ?? null,
            'persistence' => $store->describe(),
            'ai' => $ai->summary(),
        ]);

    case 'debug':
        $res = [
            'ok' => true,
            'persistence' => $store->describe(),
            'ai' => $ai->summary(),
            'php' => PHP_VERSION,
            'sapi' => PHP_SAPI,
            'extensions' => [
                'pdo_sqlite' => extension_loaded('pdo_sqlite'),
                'pdo_mysql' => extension_loaded('pdo_mysql'),
                'curl' => function_exists('curl_init'),
                'openssl' => extension_loaded('openssl'),
            ],
            'session' => $user ? 'logged in as ' . $user['name'] : 'guest',
            'serverTime' => gmdate('c'),
        ];
        if (isset($_GET['ping'])) {
            $res['aiPing'] = $ai->ping();
        }
        out($res);

    case 'register':
    case 'login':
        if (!$isPost) {
            fail('POST required', 405);
        }
        $b = body();
        $name = trim((string)($b['username'] ?? ''));
        $pass = (string)($b['password'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_.-]{3,24}$/', $name)) {
            fail('Username must be 3-24 letters, numbers, dots, dashes or underscores.');
        }
        if (strlen($pass) < 8 || strlen($pass) > 128) {
            fail('Password must be 8-128 characters.');
        }
        if ($action === 'register') {
            $id = $store->createUser($name, password_hash($pass, PASSWORD_DEFAULT));
            if ($id === null) {
                fail('That username is taken.', 409);
            }
        } else {
            $u = $store->userByName($name);
            if ($u && $u['locked'] > time()) {
                fail('Too many attempts. Try again in a few minutes.', 429);
            }
            if (!$u || !password_verify($pass, $u['hash'])) {
                if ($u) {
                    $f = $u['fails'] + 1;
                    $store->setFailures($u['id'], $f >= 5 ? 0 : $f, $f >= 5 ? time() + 300 : 0);
                } else {
                    password_verify($pass, '$2y$10$usesomesillystringforsaleeKJMUA5FQlVQ0nqpYVLvyZ1uFhh2');
                }
                usleep(400000);
                fail('Wrong username or password.', 401);
            }
            $store->setFailures($u['id'], 0, 0);
            $id = $u['id'];
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = $id;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        out(['ok' => true, 'user' => $name, 'csrf' => $_SESSION['csrf']]);

    case 'logout':
        if (!$isPost) {
            fail('POST required', 405);
        }
        unset($_SESSION['uid']);
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        out(['ok' => true, 'csrf' => $_SESSION['csrf']]);

    case 'delete':
        if (!$isPost) {
            fail('POST required', 405);
        }
        $u = requireUser($user);
        $b = body();
        if (!password_verify((string)($b['password'] ?? ''), $u['hash'])) {
            fail('Wrong password.', 401);
        }
        $store->deleteUser($u['id']);
        unset($_SESSION['uid']);
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        out(['ok' => true, 'csrf' => $_SESSION['csrf']]);

    case 'load':
        $u = requireUser($user);
        $s = $store->getSave($u['id']);
        out(['ok' => true, 'save' => $s ? json_decode($s['data'], true) : null, 'updated' => $s['updated'] ?? null]);

    case 'save':
        if (!$isPost) {
            fail('POST required', 405);
        }
        $u = requireUser($user);
        $b = body();
        $data = $b['data'] ?? null;
        if (!is_array($data)) {
            fail('Invalid save data.');
        }
        $json = json_encode($data);
        if ($json === false || strlen($json) > 65536) {
            fail('Save is too large.', 413);
        }
        $store->putSave($u['id'], $json);
        out(['ok' => true, 'updated' => time()]);

    case 'dialogue':
        if (!$isPost) {
            fail('POST required', 405);
        }
        $b = body();
        $now = microtime(true);
        if ($now - (float)($_SESSION['last_ai'] ?? 0) < 1.5) {
            out(['ok' => true, 'text' => null, 'source' => 'default']);
        }
        $_SESSION['last_ai'] = $now;
        session_write_close();
        $text = $ai->reply((string)($b['speaker'] ?? ''), (string)($b['topic'] ?? ''), is_array($b['ctx'] ?? null) ? $b['ctx'] : [], (string)($b['message'] ?? ''));
        out(['ok' => true, 'text' => $text, 'source' => $text === null ? 'default' : 'ai']);

    default:
        fail('Unknown action', 404);
}

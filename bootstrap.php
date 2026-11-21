<?php
declare(strict_types=1);

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('baakarta_admin');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Strict',
    'path' => '/',
]);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function baakarta_enforce_https(): void
{
    $https = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
    if (!$https && getenv('BAAKARTA_ALLOW_HTTP') !== '1') {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        exit('HTTPS талап кылынат. Локалдык иштеп чыгууда гана BAAKARTA_ALLOW_HTTP=1 коюңуз.');
    }
}

function baakarta_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = getenv('BAAKARTA_DSN');
    $username = getenv('BAAKARTA_DB_USER');
    $password = getenv('BAAKARTA_DB_PASSWORD');
    if (!$dsn || $username === false || $password === false) {
        throw new LogicException('Database connection settings are not configured.');
    }

    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function baakarta_h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function baakarta_input_string(mixed $value, string $default = ''): string
{
    return is_string($value) ? $value : $default;
}

function baakarta_length(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    preg_match_all('/./us', $value, $matches);
    return count($matches[0]);
}

function baakarta_csrf_token(): string
{
    if (!isset($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function baakarta_verify_csrf(mixed $token): void
{
    if (!is_string($token) || !hash_equals(baakarta_csrf_token(), $token)) {
        http_response_code(403);
        throw new RuntimeException('Сурамдын коопсуздук токени жараксыз. Баракты жаңыртып, кайра аракет кылыңыз.');
    }
}

function baakarta_current_admin(): ?array
{
    $id = filter_var($_SESSION['admin_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) {
        return null;
    }

    $statement = baakarta_db()->prepare(
        'SELECT id, username FROM admins WHERE id = :id AND active = 1 LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    $admin = $statement->fetch();
    if (!$admin) {
        unset($_SESSION['admin_id']);
        return null;
    }
    return $admin;
}

function baakarta_require_admin(): array
{
    $admin = baakarta_current_admin();
    if (!$admin) {
        header('Location: admin.php');
        exit;
    }
    return $admin;
}

function baakarta_upload_dir(): string
{
    $directory = getenv('BAAKARTA_UPLOAD_DIR');
    return $directory !== false && $directory !== ''
        ? rtrim($directory, DIRECTORY_SEPARATOR)
        : dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads';
}

function baakarta_save_upload(array $file): ?string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Сүрөт жүктөлгөн жок. Файлдын көлөмүн жана сервердин upload чегин текшериңиз.');
    }
    if (($file['size'] ?? 0) < 1 || $file['size'] > 5 * 1024 * 1024) {
        throw new RuntimeException('Сүрөттүн көлөмү 5 МБдан ашпашы керек.');
    }

    $temporaryPath = $file['tmp_name'] ?? '';
    $imageInfo = $temporaryPath !== '' ? @getimagesize($temporaryPath) : false;
    $mime = $imageInfo['mime'] ?? '';
    $extensions = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    if (!isset($extensions[$mime]) || !isset($imageInfo[0], $imageInfo[1]) || $imageInfo[0] > 6000 || $imageInfo[1] > 6000 || $imageInfo[0] * $imageInfo[1] > 30000000) {
        throw new RuntimeException('JPG, PNG же WebP форматындагы сүрөт гана кабыл алынат.');
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    if ($finfo->file($temporaryPath) !== $mime) {
        throw new RuntimeException('Сүрөттүн файл мазмуну көрсөтүлгөн форматка туура келбейт.');
    }

    $directory = baakarta_upload_dir();
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Сүрөттөр үчүн папка түзүлгөн жок. Сервердеги папканын уруксаттарын текшериңиз.');
    }
    $filename = bin2hex(random_bytes(24)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($temporaryPath, $directory . DIRECTORY_SEPARATOR . $filename)) {
        throw new RuntimeException('Жүктөлгөн сүрөт серверге сакталган жок.');
    }
    return 'uploads/' . $filename;
}

function baakarta_image_url(?string $path): string
{
    if (!$path || !preg_match('~^uploads/[a-f0-9]{48}\.(?:jpg|png|webp)$~', $path)) {
        return '';
    }
    return 'image.php?file=' . rawurlencode(basename($path));
}

function baakarta_delete_upload(?string $path): void
{
    if (!$path || !preg_match('~^uploads/[a-f0-9]{48}\.(?:jpg|png|webp)$~', $path)) {
        return;
    }
    $fullPath = baakarta_upload_dir() . DIRECTORY_SEPARATOR . basename($path);
    if (is_file($fullPath)) {
        unlink($fullPath);
    }
}

function baakarta_listing_details(string $kind, string $json): array
{
    $allowed = [
        'shop' => ['avg', 'stars', 'hours', 'items', 'delivery', 'parking', 'emoji', 'tag'],
        'hotel' => ['min', 'max', 'stars', 'rooms', 'pool', 'wifi', 'breakfast', 'emoji', 'tag'],
        'market' => ['veg', 'meat', 'clothes', 'stars', 'hours', 'specialty', 'emoji', 'tag'],
    ];
    if (!isset($allowed[$kind])) {
        throw new RuntimeException('Маалыматтын түрү туура эмес.');
    }
    try {
        $details = json_decode($json === '' ? '{}' : $json, false, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new RuntimeException('Кошумча маалымат JSON форматында болушу керек.');
    }
    if (!($details instanceof stdClass)) {
        throw new RuntimeException('Кошумча маалымат JSON объект болушу керек.');
    }

    $clean = [];
    foreach (get_object_vars($details) as $key => $value) {
        if (!is_string($key) || !in_array($key, $allowed[$kind], true)) {
            throw new RuntimeException('Кошумча маалыматта уруксат берилбеген талаа бар.');
        }
        if (is_array($value) || is_object($value) || is_bool($value) || $value === null) {
            throw new RuntimeException('Кошумча талаалар текст же сан болушу керек.');
        }
        if (in_array($key, ['avg', 'min', 'max', 'stars', 'rooms'], true)) {
            if (!is_numeric($value) || (float)$value < 0 || (float)$value > 100000000) {
                throw new RuntimeException('Кошумча баа, рейтинг же сан талаасы жараксыз.');
            }
            if ($key === 'stars' && (float)$value > 5) {
                throw new RuntimeException('Рейтинг 0 менен 5тин ортосунда болушу керек.');
            }
            $clean[$key] = (float)$value;
        } else {
            $text = trim((string)$value);
            if (strlen($text) > 500) {
                throw new RuntimeException('Кошумча маалыматтын ар бир талаасы 500 белгиден ашпашы керек.');
            }
            $clean[$key] = $text;
        }
    }
    if ($kind === 'hotel' && isset($clean['min'], $clean['max']) && $clean['max'] < $clean['min']) {
        throw new RuntimeException('Мейманкананын эң жогорку баасы эң төмөнкү баадан кем болбошу керек.');
    }
    return $clean;
}

<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
baakarta_enforce_https();
session_write_close();

$filename = (string)($_GET['file'] ?? '');
if (!preg_match('/^[a-f0-9]{48}\.(?:jpg|png|webp)$/', $filename)) {
    http_response_code(404);
    exit;
}
$path = baakarta_upload_dir() . DIRECTORY_SEPARATOR . $filename;
if (!is_file($path)) {
    http_response_code(404);
    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($path);
if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
    http_response_code(404);
    exit;
}

header('Content-Type: ' . $mime);
header('X-Content-Type-Options: nosniff');
header('Content-Length: ' . (string)filesize($path));
header('Cache-Control: public, max-age=86400, immutable');
readfile($path);

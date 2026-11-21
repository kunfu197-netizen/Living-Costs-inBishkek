<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/includes/bootstrap.php';

$username = trim((string)($argv[1] ?? ''));
if ($username === '' || strlen($username) > 100) {
    fwrite(STDERR, "Колдонуу: php create_admin.php <колдонуучу_аты>\n");
    exit(2);
}

fwrite(STDOUT, "Жаңы сырсөз (кеминде 12 белги): ");
$password = rtrim((string)fgets(STDIN), "\r\n");
if (strlen($password) < 12) {
    fwrite(STDERR, "\nСырсөз кеминде 12 белгиден турушу керек.\n");
    exit(2);
}

$statement = baakarta_db()->prepare(
    'INSERT INTO admins (username, password_hash, active)
     VALUES (:username, :password_hash, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1'
);
$statement->execute([
    'username' => $username,
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
]);
fwrite(STDOUT, "Администратор жаңыртылды. Сырсөз хэш түрүндө сакталды.\n");

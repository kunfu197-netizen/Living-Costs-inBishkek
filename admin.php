<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
baakarta_enforce_https();
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

try {
    $pdo = baakarta_db();
    $admin = baakarta_current_admin();
} catch (Throwable $error) {
    error_log('BaaKarta database configuration failure: ' . $error->getMessage());
    http_response_code(503);
    echo '<!doctype html><html lang="ky"><meta charset="utf-8"><title>БааКарта — сервер орнотуусу</title><body><h1>Админ панели азырынча жеткиликсиз</h1><p>Маалымат базасын туташтыруу жөндөөлөрүн жана schema.sql орнотулушун текшериңиз. Орнотуу кадамдары README.md файлында. Сервер журналы көбүрөөк маалымат берет.</p></body></html>';
    exit;
}
$errorMessage = '';
$newUploadPath = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        baakarta_verify_csrf($_POST['csrf_token'] ?? null);
        $action = baakarta_input_string($_POST['action'] ?? null);

        if ($action === 'login') {
            if ($admin) {
                header('Location: admin.php');
                exit;
            }
            $ipHash = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
            $attempts = $pdo->prepare(
                'SELECT COUNT(*) FROM login_attempts
                 WHERE ip_hash = :ip_hash AND attempted_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)'
            );
            $attempts->execute(['ip_hash' => $ipHash]);
            if ((int)$attempts->fetchColumn() >= 8) {
                throw new RuntimeException('Кирүү убактылуу чектелди. 15 мүнөттөн кийин кайра аракет кылыңыз.');
            }

            $username = trim(baakarta_input_string($_POST['username'] ?? null));
            $password = baakarta_input_string($_POST['password'] ?? null);
            $lookup = $pdo->prepare(
                'SELECT id, password_hash FROM admins WHERE username = :username AND active = 1 LIMIT 1'
            );
            $lookup->execute(['username' => $username]);
            $record = $lookup->fetch();
            $valid = $record
                ? password_verify($password, $record['password_hash'])
                : password_verify($password, '$2y$10$8K1B1b5zYFZqHev6Mqa9weQ4vCqfU6mYkR8I2bnpLqRw1Wn2T3y0K');
            if (!$record || !$valid) {
                $pdo->prepare('INSERT INTO login_attempts (ip_hash) VALUES (:ip_hash)')->execute(['ip_hash' => $ipHash]);
                $pdo->exec('DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
                throw new RuntimeException('Колдонуучу аты же сырсөз туура эмес.');
            }

            $pdo->prepare('DELETE FROM login_attempts WHERE ip_hash = :ip_hash')->execute(['ip_hash' => $ipHash]);
            session_regenerate_id(true);
            $_SESSION['admin_id'] = (int)$record['id'];
            unset($_SESSION['csrf_token']);
            header('Location: admin.php');
            exit;
        }

        $admin = baakarta_require_admin();
        if ($action === 'logout') {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', [
                    'expires' => time() - 42000,
                    'path' => $params['path'],
                    'secure' => $params['secure'],
                    'httponly' => $params['httponly'],
                    'samesite' => $params['samesite'],
                ]);
            }
            session_destroy();
            header('Location: admin.php');
            exit;
        }

        if ($action === 'save_listing') {
            $id = filter_var($_POST['id'] ?? '', FILTER_VALIDATE_INT) ?: null;
            $kind = baakarta_input_string($_POST['kind'] ?? null);
            if (!in_array($kind, ['shop', 'hotel', 'market'], true)) {
                throw new RuntimeException('Дүкөн, мейманкана же базар түрүн тандаңыз.');
            }
            $name = trim(baakarta_input_string($_POST['name'] ?? null));
            $category = trim(baakarta_input_string($_POST['category'] ?? null));
            $district = trim(baakarta_input_string($_POST['district'] ?? null));
            $address = trim(baakarta_input_string($_POST['address'] ?? null));
            $hours = trim(baakarta_input_string($_POST['opening_hours'] ?? null));
            $summary = trim(baakarta_input_string($_POST['summary'] ?? null));
            $status = baakarta_input_string($_POST['status'] ?? null, 'active');
            $detailsJson = baakarta_input_string($_POST['details_json'] ?? null, '{}');
            if (strlen($detailsJson) > 8192) {
                throw new RuntimeException('Кошумча маалымат JSON 8 КБдан ашпашы керек.');
            }
            $details = baakarta_listing_details($kind, $detailsJson);
            if ($name === '' || baakarta_length($name) > 160 || baakarta_length($category) > 120 || baakarta_length($district) > 160 || baakarta_length($address) > 255 || baakarta_length($hours) > 120 || baakarta_length($summary) > 5000) {
                throw new RuntimeException('Аталышты толтуруп, талаалардын белгилеринин чегин текшериңиз.');
            }
            if (!in_array($status, ['active', 'flagged', 'hidden'], true)) {
                throw new RuntimeException('Маалыматтын статусу жараксыз.');
            }

            $existing = null;
            if ($id) {
                $find = $pdo->prepare('SELECT * FROM listings WHERE id = :id');
                $find->execute(['id' => $id]);
                $existing = $find->fetch();
                if (!$existing) {
                    throw new RuntimeException('Өзгөртө турган маалымат табылган жок.');
                }
            }
            $newUploadPath = baakarta_save_upload($_FILES['image'] ?? []);
            $removeImage = isset($_POST['remove_image']) && $_POST['remove_image'] === '1';
            $imagePath = $removeImage ? null : ($newUploadPath ?? ($existing['image_path'] ?? null));
            if ($id) {
                $save = $pdo->prepare(
                    'UPDATE listings SET kind=:kind, name=:name, category=:category, district=:district,
                     address=:address, opening_hours=:opening_hours, summary=:summary, image_path=:image_path,
                     details_json=:details_json, status=:status WHERE id=:id'
                );
            } else {
                $save = $pdo->prepare(
                    'INSERT INTO listings
                     (kind, name, category, district, address, opening_hours, summary, image_path, details_json, status)
                     VALUES (:kind, :name, :category, :district, :address, :opening_hours, :summary, :image_path, :details_json, :status)'
                );
            }
            $parameters = [
                'kind' => $kind,
                'name' => $name,
                'category' => $category,
                'district' => $district,
                'address' => $address,
                'opening_hours' => $hours,
                'summary' => $summary,
                'image_path' => $imagePath,
                'details_json' => json_encode((object)$details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                'status' => $status,
            ];
            if ($id) {
                $parameters['id'] = $id;
            }
            $save->execute($parameters);
            if ($existing && $newUploadPath) {
                baakarta_delete_upload($existing['image_path']);
            } elseif ($existing && $removeImage) {
                baakarta_delete_upload($existing['image_path']);
            }
            if ($removeImage) {
                baakarta_delete_upload($newUploadPath);
            }
            $newUploadPath = null;
            $_SESSION['admin_flash'] = 'Маалымат сакталды.';
            header('Location: admin.php');
            exit;
        }

        if ($action === 'delete_listing') {
            $id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
            if (!$id) {
                throw new RuntimeException('Өчүрүлө турган маалыматтын ID мааниси туура эмес.');
            }
            $find = $pdo->prepare('SELECT image_path FROM listings WHERE id = :id');
            $find->execute(['id' => $id]);
            $listing = $find->fetch();
            if (!$listing) {
                throw new RuntimeException('Өчүрүлө турган маалымат табылган жок.');
            }
            $pdo->prepare('DELETE FROM listings WHERE id = :id')->execute(['id' => $id]);
            baakarta_delete_upload($listing['image_path']);
            $_SESSION['admin_flash'] = 'Маалымат жана ага байланышкан товар/пикирлер өчүрүлдү.';
            header('Location: admin.php');
            exit;
        }

        if ($action === 'save_product') {
            $id = filter_var($_POST['product_id'] ?? '', FILTER_VALIDATE_INT) ?: null;
            $listingId = filter_var($_POST['listing_id'] ?? null, FILTER_VALIDATE_INT);
            $name = trim(baakarta_input_string($_POST['product_name'] ?? null));
            $price = filter_var($_POST['price'] ?? null, FILTER_VALIDATE_FLOAT);
            $unit = trim(baakarta_input_string($_POST['unit'] ?? null, 'даана'));
            if (!$listingId || $name === '' || baakarta_length($name) > 160 || !$price || $price > 100000000 || $price < 0 || $unit === '' || baakarta_length($unit) > 40) {
                throw new RuntimeException('Товардын атын, дүкөндү, сомдогу бааны жана өлчөм бирдигин туура толтуруңуз.');
            }
            $listingCheck = $pdo->prepare("SELECT id FROM listings WHERE id=:id AND kind IN ('shop','market')");
            $listingCheck->execute(['id' => $listingId]);
            if (!$listingCheck->fetch()) {
                throw new RuntimeException('Товар дүкөнгө же базарга гана байланыша алат.');
            }
            if ($id) {
                $productCheck = $pdo->prepare('SELECT id FROM products WHERE id = :id');
                $productCheck->execute(['id' => $id]);
                if (!$productCheck->fetch()) {
                    throw new RuntimeException('Өзгөртө турган товар табылган жок.');
                }
                $save = $pdo->prepare(
                    'UPDATE products SET listing_id=:listing_id, name=:name, price=:price, unit=:unit WHERE id=:id'
                );
            } else {
                $save = $pdo->prepare(
                    'INSERT INTO products (listing_id, name, price, unit) VALUES (:listing_id, :name, :price, :unit)'
                );
            }
            $parameters = ['listing_id' => $listingId, 'name' => $name, 'price' => $price, 'unit' => $unit];
            if ($id) {
                $parameters['id'] = $id;
            }
            $save->execute($parameters);
            $_SESSION['admin_flash'] = 'Товардын баасы сакталды.';
            header('Location: admin.php');
            exit;
        }

        if ($action === 'delete_product') {
            $id = filter_var($_POST['product_id'] ?? null, FILTER_VALIDATE_INT);
            if (!$id) {
                throw new RuntimeException('Товардын ID мааниси туура эмес.');
            }
            $delete = $pdo->prepare('DELETE FROM products WHERE id = :id');
            $delete->execute(['id' => $id]);
            if ($delete->rowCount() === 0) {
                throw new RuntimeException('Өчүрүлө турган товар табылган жок.');
            }
            $_SESSION['admin_flash'] = 'Товар өчүрүлдү.';
            header('Location: admin.php');
            exit;
        }

        if ($action === 'review_status') {
            $id = filter_var($_POST['review_id'] ?? null, FILTER_VALIDATE_INT);
            $status = baakarta_input_string($_POST['status'] ?? null);
            if (!$id || !in_array($status, ['pending', 'approved', 'rejected'], true)) {
                throw new RuntimeException('Пикирдин IDси же статустун мааниси туура эмес.');
            }
            $update = $pdo->prepare('UPDATE reviews SET status = :status WHERE id = :id');
            $update->execute(['status' => $status, 'id' => $id]);
            if ($update->rowCount() === 0) {
                $check = $pdo->prepare('SELECT id FROM reviews WHERE id = :id');
                $check->execute(['id' => $id]);
                if (!$check->fetch()) {
                    throw new RuntimeException('Пикир табылган жок.');
                }
            }
            $_SESSION['admin_flash'] = 'Пикирдин абалы өзгөртүлдү.';
            header('Location: admin.php#reviews');
            exit;
        }

        if ($action === 'delete_review') {
            $id = filter_var($_POST['review_id'] ?? null, FILTER_VALIDATE_INT);
            if (!$id) {
                throw new RuntimeException('Пикирдин IDси туура эмес.');
            }
            $delete = $pdo->prepare('DELETE FROM reviews WHERE id = :id');
            $delete->execute(['id' => $id]);
            if ($delete->rowCount() === 0) {
                throw new RuntimeException('Өчүрүлө турган пикир табылган жок.');
            }
            $_SESSION['admin_flash'] = 'Пикир өчүрүлдү.';
            header('Location: admin.php#reviews');
            exit;
        }

        throw new RuntimeException('Бул башкаруу аракети белгисиз.');
    } catch (Throwable $error) {
        baakarta_delete_upload($newUploadPath);
        if ($error instanceof PDOException) {
            error_log('BaaKarta admin database failure: ' . $error->getMessage());
            $errorMessage = 'Маалыматты базага сактоодо ката кетти. Сервер журналын текшериңиз.';
        } else {
            $errorMessage = $error->getMessage();
        }
        try {
            $admin = baakarta_current_admin();
        } catch (Throwable $authError) {
            error_log('BaaKarta admin session recovery failure: ' . $authError->getMessage());
            $admin = null;
        }
    }
}

$flashMessage = (string)($_SESSION['admin_flash'] ?? '');
unset($_SESSION['admin_flash']);
$csrf = baakarta_csrf_token();
$listingEdit = null;
$productEdit = null;
$listings = [];
$products = [];
$reviews = [];
$pendingCount = 0;
$flaggedCount = 0;
$productListings = [];
$panelLoadError = '';
$listingCounts = ['shop' => 0, 'hotel' => 0, 'market' => 0];
$activeCount = 0;
$productCount = 0;

if ($admin) {
    try {
    $countsStatement = $pdo->query(
        "SELECT kind, status, COUNT(*) AS total FROM listings GROUP BY kind, status"
    );
    foreach ($countsStatement->fetchAll() as $countRow) {
        if (array_key_exists($countRow['kind'], $listingCounts)) {
            $listingCounts[$countRow['kind']] += (int)$countRow['total'];
        }
        if ($countRow['status'] === 'active') {
            $activeCount += (int)$countRow['total'];
        }
    }
    $productCount = (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
    $listingStatement = $pdo->query(
        'SELECT id, kind, name, category, district, address, opening_hours, summary, image_path, details_json, status, updated_at
         FROM listings ORDER BY updated_at DESC LIMIT 300'
    );
    $listings = $listingStatement->fetchAll();
    $productListings = $pdo->query(
        "SELECT id, name, kind FROM listings WHERE kind IN ('shop','market') ORDER BY name"
    )->fetchAll();
    $products = $pdo->query(
        'SELECT p.id, p.listing_id, p.name, p.price, p.unit, p.updated_at, l.name AS listing_name
         FROM products p JOIN listings l ON l.id=p.listing_id ORDER BY p.updated_at DESC LIMIT 200'
    )->fetchAll();
    $reviews = $pdo->query(
        'SELECT r.id, r.listing_id, r.reviewer_name, r.rating, r.body, r.status, r.created_at, l.name AS listing_name
         FROM reviews r JOIN listings l ON l.id=r.listing_id ORDER BY (r.status = \'pending\') DESC, r.created_at DESC LIMIT 200'
    )->fetchAll();
    $pendingCount = (int)$pdo->query("SELECT COUNT(*) FROM reviews WHERE status='pending'")->fetchColumn();
    $flaggedCount = (int)$pdo->query("SELECT COUNT(*) FROM listings WHERE status='flagged'")->fetchColumn();

    $editId = filter_var($_GET['edit'] ?? null, FILTER_VALIDATE_INT);
    if ($editId) {
        $find = $pdo->prepare('SELECT * FROM listings WHERE id = :id');
        $find->execute(['id' => $editId]);
        $listingEdit = $find->fetch() ?: null;
    }
    $editProductId = filter_var($_GET['edit_product'] ?? null, FILTER_VALIDATE_INT);
    if ($editProductId) {
        $find = $pdo->prepare('SELECT * FROM products WHERE id = :id');
        $find->execute(['id' => $editProductId]);
        $productEdit = $find->fetch() ?: null;
    }
    } catch (Throwable $error) {
        error_log('BaaKarta admin panel query failure: ' . $error->getMessage());
        $panelLoadError = 'Админ маалыматтарын окуу мүмкүн болгон жок. Маалымат базасынын таблицаларын жана сервер журналын текшериңиз.';
    }
}

function baakarta_kind_label(string $kind): string
{
    return ['shop' => 'Дүкөн', 'hotel' => 'Мейманкана', 'market' => 'Базар'][$kind] ?? $kind;
}

function baakarta_status_label(string $status): string
{
    return ['active' => 'Жарыяланган', 'flagged' => 'Күмөндүү', 'hidden' => 'Жашырылган', 'pending' => 'Текшерүүдө', 'approved' => 'Жарыяланган', 'rejected' => 'Четке кагылган'][$status] ?? $status;
}

$detailsValue = $listingEdit ? json_encode(json_decode($listingEdit['details_json']), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) : '{}';
?>
<!DOCTYPE html>
<html lang="ky">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Администратор панели — БааКарта</title>
    <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700&family=Noto+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/admin.css">
</head>
<body>
<?php if (!$admin): ?>
<header class="login-topbar"><h1>БааКарта · Администратор</h1><a href="map.html">Сайтка кайтуу</a></header>
<main class="login-page">
    <?php if ($errorMessage !== ''): ?><div class="notice error"><?= baakarta_h($errorMessage) ?></div><?php endif; ?>
    <?php if ($flashMessage !== ''): ?><div class="notice"><?= baakarta_h($flashMessage) ?></div><?php endif; ?>
    <section class="login">
        <h2>Коопсуз кирүү</h2>
        <p class="muted">Администратордун аты жана сырсөзү сервердеги база аркылуу текшерилет.</p>
        <form method="post" autocomplete="on">
            <input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>">
            <input type="hidden" name="action" value="login">
            <div class="field"><label for="username">Колдонуучу аты</label><input id="username" name="username" autocomplete="username" required maxlength="100"></div>
            <div class="field"><label for="password">Сырсөз</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
            <button class="btn" type="submit">Кирүү</button>
        </form>
    </section>
</main>
<?php else: ?>
<header class="admin-topbar">
    <div class="topbar-greeting">
        <h1>Салам, <?= baakarta_h((string)$admin['username']) ?>!</h1>
        <p>БааКарта администратор панели</p>
    </div>
    <div class="topbar-actions">
        <span class="active-badge"><span class="status-dot"></span> Система активдүү</span>
        <a class="icon-button" href="#reviews" aria-label="Пикирлер"><?= $pendingCount > 0 ? '●' : '✉' ?></a>
        <span class="admin-profile"><span class="avatar"><?= baakarta_h(strtoupper(substr((string)$admin['username'], 0, 1))) ?></span><span class="profile-name"><?= baakarta_h((string)$admin['username']) ?></span></span>
        <span class="date-badge">▣ <?= date('d.m.Y') ?></span>
        <form method="post" class="inline">
            <input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>">
            <input type="hidden" name="action" value="logout">
            <button class="btn subtle" type="submit">Чыгуу</button>
        </form>
    </div>
</header>
<div class="admin-layout">
    <aside class="admin-sidebar">
        <div class="sidebar-brand">
            <span class="brand-mark">₸</span>
            <span class="brand-copy"><strong>БааКарта</strong><small>Админ панель</small></span>
        </div>
        <div class="sidebar-status"><span class="status-dot"></span> Система активдүү</div>
        <nav aria-label="Админ меню">
            <div class="nav-group">
                <div class="nav-title">Башкаруу</div>
                <a class="sidebar-link active" href="#dashboard"><span class="sidebar-icon">▦</span>Башкы бет</a>
                <a class="sidebar-link" href="#listing-form"><span class="sidebar-icon">＋</span>Жай кошуу</a>
                <a class="sidebar-link" href="#products"><span class="sidebar-icon">▣</span>Товарлар жана баалар</a>
                <a class="sidebar-link" href="#listings"><span class="sidebar-icon">⌂</span>Дүкөндөр жана жайлар</a>
                <a class="sidebar-link" href="#reviews"><span class="sidebar-icon">☏</span>Пикирлер <span class="metric-foot"><?= $pendingCount > 0 ? $pendingCount : '' ?></span></a>
            </div>
            <div class="nav-group">
                <div class="nav-title">Сайт</div>
                <a class="sidebar-link" href="map.html"><span class="sidebar-icon">⌖</span>Картага өтүү</a>
                <a class="sidebar-link" href="index.html"><span class="sidebar-icon">↗</span>Башкы сайт</a>
            </div>
        </nav>
        <div class="sidebar-bottom">Коопсуз администратор сессиясы</div>
    </aside>
    <main class="admin-content">
    <?php if ($errorMessage !== ''): ?><div class="notice error"><?= baakarta_h($errorMessage) ?></div><?php endif; ?>
    <?php if ($flashMessage !== ''): ?><div class="notice"><?= baakarta_h($flashMessage) ?></div><?php endif; ?>

    <?php if ($panelLoadError !== ''): ?>
        <section class="card"><h2>Админ панели убактылуу жеткиликсиз</h2><p><?= baakarta_h($panelLoadError) ?></p></section>
    <?php else: ?>
        <section id="dashboard">
            <div class="dashboard-intro">
                <div><h2>Башкаруу панели</h2><p>БааКартадагы жайлар менен пикирлердин бүгүнкү көрүнүшү.</p></div>
                <div class="dashboard-actions">
                    <a class="btn subtle" href="map.html">Картаны көрүү</a>
                    <a class="btn" href="#listing-form">＋ Жаңы жай кошуу</a>
                </div>
            </div>
            <div class="metric-grid">
                <article class="metric-card"><div class="metric-top"><span class="metric-icon">⌂</span>Катталган жайлар</div><div class="metric-value"><?= array_sum($listingCounts) ?></div><div class="metric-foot">Дүкөн, мейманкана, базар</div></article>
                <article class="metric-card"><div class="metric-top"><span class="metric-icon">☏</span>Текшериле турган пикир</div><div class="metric-value"><?= $pendingCount ?></div><div class="metric-foot"><strong>Модерация</strong> талап кылынат</div></article>
                <article class="metric-card"><div class="metric-top"><span class="metric-icon">⌖</span>Жарыяланган жайлар</div><div class="metric-value"><?= $activeCount ?></div><div class="metric-foot">Сайтта көрсөтүлгөн</div></article>
                <article class="metric-card"><div class="metric-top"><span class="metric-icon">▤</span>Товар жана баа</div><div class="metric-value"><?= $productCount ?></div><div class="metric-foot">Сом менен сакталган</div></article>
                <article class="metric-card"><div class="metric-top"><span class="metric-icon">⚑</span>Күмөндүү маалымат</div><div class="metric-value"><?= $flaggedCount ?></div><div class="metric-foot"><strong>Текшерип чыгыңыз</strong></div></article>
            </div>
            <div class="dashboard-grid">
                <section class="card">
                    <div class="card-heading"><h2>Бишкек картасы</h2><span class="live-label"><span class="status-dot"></span> Карта иштеп жатат</span></div>
                    <iframe class="map-frame" src="map.html" title="Бишкектин интерактивдүү картасы" loading="lazy"></iframe>
                </section>
                <section class="card">
                    <div class="card-heading"><h2>Акыркы пикирлер</h2><a href="#reviews">Баарын көрүү →</a></div>
                    <div class="review-feed">
                        <?php
                        $recentReviews = array_slice(array_values(array_filter($reviews, static fn(array $review): bool => $review['status'] === 'pending')), 0, 5);
                        if (!$recentReviews) {
                            $recentReviews = array_slice($reviews, 0, 5);
                        }
                        ?>
                        <?php if (!$recentReviews): ?><div class="empty-feed">Азырынча пикир жок.</div><?php endif; ?>
                        <?php foreach ($recentReviews as $review): ?>
                            <article class="review-feed-item">
                                <span class="review-avatar"><?= baakarta_h(strtoupper(substr($review['reviewer_name'], 0, 1))) ?></span>
                                <div class="review-feed-copy">
                                    <strong><span><?= baakarta_h($review['reviewer_name']) ?></span><span class="muted"><?= (int)$review['rating'] ?>/5</span></strong>
                                    <p><?= baakarta_h($review['body']) ?></p>
                                    <small><?= baakarta_h($review['listing_name']) ?> · <?= baakarta_status_label($review['status']) ?></small>
                                </div>
                            </article>
                        <?php endforeach; ?>
                    </div>
                    <a class="text-link" href="#reviews">Пикирлерди модерациялоо →</a>
                </section>
            </div>
        </section>

        <div class="section-heading" id="listing-form">
            <div><h2><?= $listingEdit ? 'Жайдын маалыматын өзгөртүү' : 'Жайларды башкаруу' ?></h2><p>Дүкөн, мейманкана жана базар маалыматтарын кошуп же оңдоңуз.</p></div>
        </div>

        <div class="management-grid">
            <section class="card form-section">
                <h2><?= $listingEdit ? 'Маалыматты өзгөртүү' : 'Жаңы жай кошуу' ?></h2>
                <form method="post" enctype="multipart/form-data">
                    <input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>">
                    <input type="hidden" name="action" value="save_listing">
                    <input type="hidden" name="id" value="<?= (int)($listingEdit['id'] ?? 0) ?>">
                    <div class="form-grid">
                        <div class="field"><label for="kind">Түрү</label><select id="kind" name="kind" required>
                            <?php foreach (['shop' => 'Дүкөн', 'hotel' => 'Мейманкана', 'market' => 'Базар'] as $value => $label): ?>
                                <option value="<?= $value ?>" <?= ($listingEdit['kind'] ?? 'shop') === $value ? 'selected' : '' ?>><?= $label ?></option>
                            <?php endforeach; ?>
                        </select></div>
                        <div class="field"><label for="status">Көрүнүшү</label><select id="status" name="status">
                            <?php foreach (['active' => 'Жарыяланган', 'flagged' => 'Күмөндүү', 'hidden' => 'Жашырылган'] as $value => $label): ?>
                                <option value="<?= $value ?>" <?= ($listingEdit['status'] ?? 'active') === $value ? 'selected' : '' ?>><?= $label ?></option>
                            <?php endforeach; ?>
                        </select></div>
                    </div>
                    <div class="field"><label for="name">Аталышы</label><input id="name" name="name" required maxlength="160" value="<?= baakarta_h((string)($listingEdit['name'] ?? '')) ?>"></div>
                    <div class="form-grid">
                        <div class="field"><label for="category">Категориясы</label><input id="category" name="category" maxlength="120" value="<?= baakarta_h((string)($listingEdit['category'] ?? '')) ?>"></div>
                        <div class="field"><label for="district">Район / жайгашкан жери</label><input id="district" name="district" maxlength="160" value="<?= baakarta_h((string)($listingEdit['district'] ?? '')) ?>"></div>
                    </div>
                    <div class="field"><label for="address">Дареги</label><input id="address" name="address" maxlength="255" value="<?= baakarta_h((string)($listingEdit['address'] ?? '')) ?>"></div>
                    <div class="field"><label for="opening_hours">Иш убактысы</label><input id="opening_hours" name="opening_hours" maxlength="120" value="<?= baakarta_h((string)($listingEdit['opening_hours'] ?? '')) ?>"></div>
                    <div class="field"><label for="summary">Кыскача маалымат</label><textarea id="summary" name="summary" maxlength="5000"><?= baakarta_h((string)($listingEdit['summary'] ?? '')) ?></textarea></div>
                    <div class="field"><label for="image">Сүрөт (JPG/PNG/WebP, 5 МБга чейин)</label><input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp"></div>
                    <?php if (!empty($listingEdit['image_path'])): ?>
                        <p class="muted">Учурдагы сүрөт: <a href="<?= baakarta_h(baakarta_image_url($listingEdit['image_path'])) ?>" target="_blank" rel="noopener">көрүү</a></p>
                        <label><input type="checkbox" name="remove_image" value="1" style="width:auto"> Сүрөттү алып салуу</label>
                    <?php endif; ?>
                    <div class="field"><label for="details_json">Баалар жана кошумча талаалар (JSON)</label><textarea id="details_json" name="details_json"><?= baakarta_h((string)$detailsValue) ?></textarea><p class="muted">Мисалдар README.md файлында. Дүкөн, мейманкана жана базар үчүн уруксат берилген талаалар гана кабыл алынат.</p></div>
                    <button class="btn" type="submit">Сактоо</button>
                    <?php if ($listingEdit): ?><a class="btn subtle" href="admin.php">Жокко чыгаруу</a><?php endif; ?>
                </form>
            </section>

            <section class="card form-section" id="products">
                <h2><?= $productEdit ? 'Товардын баасын өзгөртүү' : 'Товар жана баа кошуу' ?></h2>
                <form method="post">
                    <input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>">
                    <input type="hidden" name="action" value="save_product">
                    <input type="hidden" name="product_id" value="<?= (int)($productEdit['id'] ?? 0) ?>">
                    <div class="field"><label for="listing_id">Дүкөн же базар</label><select id="listing_id" name="listing_id" required>
                        <option value="">Тандаңыз</option>
                        <?php foreach ($productListings as $place): ?>
                            <option value="<?= (int)$place['id'] ?>" <?= (int)($productEdit['listing_id'] ?? 0) === (int)$place['id'] ? 'selected' : '' ?>><?= baakarta_h($place['name']) ?> · <?= baakarta_kind_label($place['kind']) ?></option>
                        <?php endforeach; ?>
                    </select></div>
                    <div class="field"><label for="product_name">Товардын аталышы</label><input id="product_name" name="product_name" maxlength="160" required value="<?= baakarta_h((string)($productEdit['name'] ?? '')) ?>"></div>
                    <div class="form-grid">
                        <div class="field"><label for="price">Баасы (сом)</label><input id="price" name="price" type="number" min="0.01" max="100000000" step="0.01" required value="<?= baakarta_h((string)($productEdit['price'] ?? '')) ?>"></div>
                        <div class="field"><label for="unit">Өлчөм бирдиги</label><input id="unit" name="unit" maxlength="40" required value="<?= baakarta_h((string)($productEdit['unit'] ?? 'даана')) ?>"></div>
                    </div>
                    <button class="btn" type="submit">Сактоо</button>
                    <?php if ($productEdit): ?><a class="btn subtle" href="admin.php">Жокко чыгаруу</a><?php endif; ?>
                </form>
                <h3>Акыркы товарлар</h3>
                <div class="table-wrap"><table><thead><tr><th>Товар</th><th>Дүкөн/базар</th><th>Баасы</th><th>Аракет</th></tr></thead><tbody>
                    <?php foreach ($products as $product): ?><tr>
                        <td><?= baakarta_h($product['name']) ?></td><td><?= baakarta_h($product['listing_name']) ?></td>
                        <td><?= baakarta_h((string)$product['price']) ?> сом / <?= baakarta_h($product['unit']) ?></td>
                        <td><div class="actions"><a class="btn small subtle" href="?edit_product=<?= (int)$product['id'] ?>">Өзгөртүү</a>
                            <form method="post" onsubmit="return confirm('Товарды өчүрөсүзбү?')"><input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>"><input type="hidden" name="action" value="delete_product"><input type="hidden" name="product_id" value="<?= (int)$product['id'] ?>"><button class="btn small danger" type="submit">Өчүрүү</button></form>
                        </div></td>
                    </tr><?php endforeach; ?>
                </tbody></table>
                <?php if (!$products): ?><div class="empty-table">Товарлар азырынча кошулган эмес.</div><?php endif; ?>
                </div>
            </section>

            <section class="card wide form-section" id="listings">
                <h2>Дүкөндөр, мейманканалар жана базарлар</h2>
                <div class="table-wrap"><table><thead><tr><th>Аталышы</th><th>Түрү</th><th>Жайгашкан жери</th><th>Статус</th><th>Жаңыртылган</th><th>Башкаруу</th></tr></thead><tbody>
                    <?php foreach ($listings as $listing): ?><tr>
                        <td><?= baakarta_h($listing['name']) ?><br><span class="muted"><?= baakarta_h($listing['category']) ?></span></td>
                        <td><?= baakarta_kind_label($listing['kind']) ?></td><td><?= baakarta_h($listing['district']) ?><br><?= baakarta_h($listing['address']) ?></td>
                        <td class="status <?= baakarta_h($listing['status']) ?>"><?= baakarta_status_label($listing['status']) ?></td>
                        <td><?= baakarta_h($listing['updated_at']) ?></td>
                        <td><div class="actions"><a class="btn small subtle" href="?edit=<?= (int)$listing['id'] ?>">Өзгөртүү</a>
                            <form method="post" onsubmit="return confirm('Жай жана ага байланышкан товарлар/пикирлер өчүрүлөт. Улантасызбы?')"><input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>"><input type="hidden" name="action" value="delete_listing"><input type="hidden" name="id" value="<?= (int)$listing['id'] ?>"><button class="btn small danger" type="submit">Өчүрүү</button></form>
                        </div></td>
                    </tr><?php endforeach; ?>
                </tbody></table>
                <?php if (!$listings): ?><div class="empty-table">Жайлар азырынча кошулган эмес.</div><?php endif; ?>
                </div>
                <?php if (count($listings) === 300): ?><p class="muted">Акыркы 300 жай көрсөтүлдү.</p><?php endif; ?>
            </section>

            <section class="card wide form-section" id="reviews">
                <h2>Колдонуучулардын пикирлери</h2>
                <div class="table-wrap"><table><thead><tr><th>Пикир</th><th>Жай</th><th>Рейтинг</th><th>Күнү</th><th>Статус</th><th>Башкаруу</th></tr></thead><tbody>
                    <?php foreach ($reviews as $review): ?><tr>
                        <td class="review"><strong><?= baakarta_h($review['reviewer_name']) ?></strong><br><?= baakarta_h($review['body']) ?></td>
                        <td><?= baakarta_h($review['listing_name']) ?></td><td><?= (int)$review['rating'] ?>/5</td><td><?= baakarta_h($review['created_at']) ?></td>
                        <td class="status <?= baakarta_h($review['status']) ?>"><?= baakarta_status_label($review['status']) ?></td>
                        <td><div class="actions">
                            <?php foreach (['approved' => 'Жарыялоо', 'rejected' => 'Четке кагуу', 'pending' => 'Кайра текшерүү'] as $status => $label): ?>
                                <?php if ($review['status'] !== $status): ?><form method="post"><input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>"><input type="hidden" name="action" value="review_status"><input type="hidden" name="review_id" value="<?= (int)$review['id'] ?>"><input type="hidden" name="status" value="<?= $status ?>"><button class="btn small <?= $status === 'rejected' ? 'subtle' : '' ?>" type="submit"><?= $label ?></button></form><?php endif; ?>
                            <?php endforeach; ?>
                            <form method="post" onsubmit="return confirm('Пикирди биротоло өчүрөсүзбү?')"><input type="hidden" name="csrf_token" value="<?= baakarta_h($csrf) ?>"><input type="hidden" name="action" value="delete_review"><input type="hidden" name="review_id" value="<?= (int)$review['id'] ?>"><button class="btn small danger" type="submit">Өчүрүү</button></form>
                        </div></td>
                    </tr><?php endforeach; ?>
                </tbody></table>
                <?php if (!$reviews): ?><div class="empty-table">Пикирлер азырынча жок.</div><?php endif; ?>
                </div>
                <?php if (count($reviews) === 200): ?><p class="muted">Акыркы 200 пикир көрсөтүлдү.</p><?php endif; ?>
            </section>
        </div>
    <?php endif; ?>
    </main>
</div>
<?php endif; ?>
</body>
</html>

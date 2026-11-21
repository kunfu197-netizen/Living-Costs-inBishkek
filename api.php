<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';
baakarta_enforce_https();
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function baakarta_json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $statement = baakarta_db()->query(
            "SELECT id, kind, name, category, district, address, opening_hours, summary, image_path, details_json
             FROM listings WHERE status = 'active' ORDER BY updated_at DESC"
        );
        $listings = $statement->fetchAll();
        if ($listings) {
            $ids = array_column($listings, 'id');
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $productsQuery = baakarta_db()->prepare(
                "SELECT id, listing_id, name, price, unit FROM products WHERE listing_id IN ($placeholders) ORDER BY name"
            );
            $productsQuery->execute($ids);
            $productsByListing = [];
            foreach ($productsQuery->fetchAll() as $product) {
                $productsByListing[$product['listing_id']][] = $product;
            }
            $reviewsQuery = baakarta_db()->prepare(
                "SELECT listing_id, reviewer_name, rating, body, created_at
                 FROM reviews WHERE status = 'approved' AND listing_id IN ($placeholders)
                 ORDER BY created_at DESC LIMIT 1000"
            );
            $reviewsQuery->execute($ids);
            $reviewsByListing = [];
            foreach ($reviewsQuery->fetchAll() as $review) {
                $reviewsByListing[$review['listing_id']][] = $review;
            }
        } else {
            $productsByListing = [];
            $reviewsByListing = [];
        }

        $result = ['listings' => []];
        foreach ($listings as $listing) {
            $details = json_decode($listing['details_json'], true);
            if (!is_array($details)) {
                $details = [];
            }
            $listing['details'] = $details;
            unset($listing['details_json']);
            $listing['photo'] = baakarta_image_url($listing['image_path']);
            $listing['products'] = $productsByListing[$listing['id']] ?? [];
            $listing['reviews'] = $reviewsByListing[$listing['id']] ?? [];
            $result['listings'][] = $listing;
        }
        $result['csrf'] = baakarta_csrf_token();
        baakarta_json_response($result);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: GET, POST');
        baakarta_json_response(['error' => 'Бул HTTP ыкмасы колдоого алынбайт.'], 405);
    }

    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        baakarta_json_response(['error' => 'Тышкы сайттан келген сурам кабыл алынбайт.'], 403);
    }
    baakarta_verify_csrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
    $rawPayload = (string)file_get_contents('php://input', false, null, 0, 16385);
    if (strlen($rawPayload) > 16384) {
        baakarta_json_response(['error' => 'Сурамдын көлөмү уруксат берилген чектен ашты.'], 413);
    }
    $payload = json_decode($rawPayload, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($payload)) {
        baakarta_json_response(['error' => 'Сурам JSON объект болушу керек.'], 400);
    }
    if (!is_string($payload['reviewer_name'] ?? null) || !is_string($payload['body'] ?? null)) {
        baakarta_json_response(['error' => 'Атыңызды жана пикирди текст түрүндө жазыңыз.'], 422);
    }
    $listingId = filter_var($payload['listing_id'] ?? null, FILTER_VALIDATE_INT);
    $reviewer = trim($payload['reviewer_name']);
    $body = trim($payload['body']);
    $rating = filter_var($payload['rating'] ?? null, FILTER_VALIDATE_INT);
    if (!$listingId || $reviewer === '' || baakarta_length($reviewer) > 100 || $rating === false || $rating < 1 || $rating > 5 || baakarta_length($body) < 5 || baakarta_length($body) > 2000) {
        baakarta_json_response(['error' => 'Атыңызды, 1–5 рейтингди жана 5–2000 белгилик пикирди толтуруңуз.'], 422);
    }

    $pdo = baakarta_db();
    $listingQuery = $pdo->prepare("SELECT id FROM listings WHERE id = :id AND status = 'active'");
    $listingQuery->execute(['id' => $listingId]);
    if (!$listingQuery->fetch()) {
        baakarta_json_response(['error' => 'Бул жай азыр жеткиликтүү эмес.'], 404);
    }
    $recentReviews = array_filter(
        $_SESSION['review_submissions'] ?? [],
        static fn($submittedAt): bool => is_int($submittedAt) && $submittedAt >= time() - 3600
    );
    if (count($recentReviews) >= 3) {
        baakarta_json_response(['error' => 'Бир саат ичинде үчтөн ашык пикир жөнөтүүгө болбойт.'], 429);
    }
    $insert = $pdo->prepare(
        "INSERT INTO reviews (listing_id, reviewer_name, rating, body, status)
         VALUES (:listing_id, :reviewer_name, :rating, :body, 'pending')"
    );
    $insert->execute([
        'listing_id' => $listingId,
        'reviewer_name' => $reviewer,
        'rating' => $rating,
        'body' => $body,
    ]);
    $recentReviews[] = time();
    $_SESSION['review_submissions'] = array_values($recentReviews);
    baakarta_json_response(['message' => 'Пикириңиз текшерүүгө жөнөтүлдү.'], 201);
} catch (JsonException $error) {
    baakarta_json_response(['error' => 'Сурамдын JSON маалыматы туура эмес.'], 400);
} catch (PDOException $error) {
    error_log('BaaKarta API database failure: ' . $error->getMessage());
    baakarta_json_response(['error' => 'Сервер маалымат базасын убактылуу окуй албай жатат.'], 500);
} catch (RuntimeException $error) {
    $status = http_response_code();
    baakarta_json_response(['error' => $error->getMessage()], $status >= 400 ? $status : 400);
} catch (Throwable $error) {
    error_log('BaaKarta API failure: ' . $error->getMessage());
    baakarta_json_response(['error' => 'Сервер сурамды аткара алган жок. Сервер журналын текшериңиз.'], 500);
}

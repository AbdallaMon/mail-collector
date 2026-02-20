<?php
require_once __DIR__ . '/../includes/functions.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/steam_api_errors.log');

/**
 * Append JSON line to a log file in the same directory as this script.
 */
function append_file_log($filename, $data) {
    $line = '[' . gmdate('Y-m-d H:i:s') . " UTC] " . json_encode($data, JSON_UNESCAPED_UNICODE) . PHP_EOL;
    @file_put_contents(__DIR__ . '/' . $filename, $line, FILE_APPEND);
}

/** main request log */
function log_request($data) { append_file_log('steam_api_requests.log', $data); }
/** secret file problems */
function log_secret_php_error($data) { append_file_log('steam_api_secret_php_error.log', $data); }
/** signature mismatch / timestamp issues */
function log_not_matched($data) { append_file_log('steam_api_not_matched.log', $data); }

function json_response($code, $data) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ====== SECRET (shared with Node) ======
$secretFile = __DIR__ . '/../../secrets/steam_secret.php';

$cfg = null;
if (!file_exists($secretFile)) {
    log_secret_php_error([
        'ok' => false,
        'err' => 'SECRET_FILE_MISSING',
        'path' => $secretFile
    ]);
    $cfg = null;
} else {
    $cfg = @include $secretFile;
    if (!is_array($cfg)) {
        log_secret_php_error([
            'ok' => false,
            'err' => 'SECRET_FILE_INVALID_RETURN',
            'path' => $secretFile,
            'returned_type' => gettype($cfg)
        ]);
        $cfg = null;
    }
}

$secret = is_array($cfg) ? ($cfg['STEAM_API_SECRET'] ?? '') : '';
if ($secret === '' || strlen($secret) < 16) {
    log_secret_php_error([
        'ok' => false,
        'err' => 'SECRET_EMPTY_OR_TOO_SHORT',
        'path' => $secretFile,
        'secret_len' => strlen($secret),
        'keys' => is_array($cfg) ? array_keys($cfg) : null
    ]);
    // IMPORTANT: stop here because signature verify will always fail
    json_response(500, ['ok'=>false,'err'=>'SECRET_NOT_CONFIGURED']);
}

// ---- Read body ----
$body = file_get_contents('php://input');
if ($body === false || $body === '') {
    log_request(['ok'=>false,'err'=>'EMPTY_BODY']);
    json_response(400, ['ok'=>false,'err'=>'EMPTY_BODY']);
}

// ---- Verify signature headers ----
$timestamp = $_SERVER['HTTP_X_TIMESTAMP'] ?? '';
$signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';

if ($timestamp === '' || $signature === '') {
    log_not_matched([
        'ok'=>false,
        'err'=>'MISSING_SIGNATURE_HEADERS',
        'has_timestamp'=> $timestamp !== '',
        'has_signature'=> $signature !== '',
        'ip' => $_SERVER['REMOTE_ADDR'] ?? null
    ]);
    log_request(['ok'=>false,'err'=>'MISSING_SIGNATURE_HEADERS']);
    json_response(401, ['ok'=>false,'err'=>'MISSING_SIGNATURE_HEADERS']);
}

// anti-replay: accept 5 minutes
$now = time();
$ts = intval($timestamp);
if ($ts < ($now - 300) || $ts > ($now + 60)) {
    log_not_matched([
        'ok'=>false,
        'err'=>'BAD_TIMESTAMP',
        'ts'=>$ts,
        'now'=>$now,
        'diff'=>$now-$ts,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? null
    ]);
    log_request(['ok'=>false,'err'=>'BAD_TIMESTAMP','ts'=>$ts,'now'=>$now]);
    json_response(401, ['ok'=>false,'err'=>'BAD_TIMESTAMP']);
}

// expected signature = hmac_sha256(timestamp + "." + body, secret)
$expected = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
if (!hash_equals($expected, $signature)) {
    log_not_matched([
        'ok' => false,
        'err' => 'BAD_SIGNATURE',
        'timestamp' => $timestamp,
        'sig_in_prefix' => substr($signature, 0, 12),
        'sig_in_suffix' => substr($signature, -12),
        'expected_prefix' => substr($expected, 0, 12),
        'expected_suffix' => substr($expected, -12),
        'body_len' => strlen($body),
        'secret_len' => strlen($secret),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null
    ]);
    log_request(['ok'=>false,'err'=>'BAD_SIGNATURE']);
    json_response(401, ['ok'=>false,'err'=>'BAD_SIGNATURE']);
}

// ---- Parse payload (NO heavy parsing here) ----
$payload = json_decode($body, true);
if (!is_array($payload)) {
    log_request(['ok'=>false,'err'=>'INVALID_JSON']);
    json_response(400, ['ok'=>false,'err'=>'INVALID_JSON']);
}

// Required minimal fields sent from Node
$fromAccount = trim($payload['fromAccount'] ?? '');
$from = strtolower(trim($payload['from'] ?? ''));
$to = trim($payload['to'] ?? '');
$subject = strtolower(trim($payload['subject'] ?? ''));
$receivedDateTime = trim($payload['receivedDateTime'] ?? '');
$internetMessageId = $payload['internetMessageId'] ?? null;
$graphMessageId = $payload['graphMessageId'] ?? null;

$username = trim($payload['username'] ?? '');
$code = trim($payload['code'] ?? '');

// log arrival (always)
log_request([
    'ok'=>true,
    'stage'=>'RECEIVED',
    'fromAccount'=>$fromAccount,
    'from'=>$from,
    'to'=>$to,
    'subject'=>substr($subject, 0, 160),
    'graphMessageId'=>$graphMessageId
]);

// Same condition as OLD script (Steam + subject)
if (strpos($from, 'steampowered.com') === false && strpos($subject, 'steam') === false) {
    log_request(['ok'=>true,'ignored'=>true,'reason'=>'NOT_STEAM','graphMessageId'=>$graphMessageId]);
    json_response(200, ['ok'=>true,'ignored'=>true,'reason'=>'NOT_STEAM']);
}
if (strpos($subject, 'from new computer') === false) {
    log_request(['ok'=>true,'ignored'=>true,'reason'=>'SUBJECT_NOT_MATCH','graphMessageId'=>$graphMessageId]);
    json_response(200, ['ok'=>true,'ignored'=>true,'reason'=>'SUBJECT_NOT_MATCH']);
}

// Must come pre-parsed from Node
if ($username === '' || $code === '') {
    log_request([
        'ok'=>true,
        'ignored'=>true,
        'reason'=>'MISSING_USERNAME_OR_CODE',
        'graphMessageId'=>$graphMessageId
    ]);
    json_response(200, ['ok'=>true,'ignored'=>true,'reason'=>'MISSING_USERNAME_OR_CODE']);
}

// Normalize datetime to MySQL format
$dateTime = null;
if ($receivedDateTime !== '') {
    $t = strtotime($receivedDateTime);
    $dateTime = $t ? gmdate('Y-m-d H:i:s', $t) : gmdate('Y-m-d H:i:s');
} else {
    $dateTime = gmdate('Y-m-d H:i:s');
}

// ---- Save (dedup) ----
$conn = get_mysql_connection();
if (!$conn) {
    error_log("DB_CONNECT_FAIL");
    json_response(500, ['ok'=>false,'err'=>'DB_CONNECT_FAIL']);
}

try {
    // Strong dedup if graphMessageId exists (best)
    // If you don't have a column for it, skip it.
    // We'll keep your recent dedup as well.

    // recent dedup: 60 sec same user+code
    $stmt = $conn->prepare(
        "SELECT 1 FROM IncomingCodes
         WHERE LOWER(TRIM(UserName))=LOWER(TRIM(?)) AND Code=?
         AND DateTime >= DATE_SUB(?, INTERVAL 60 SECOND)
         LIMIT 1"
    );
    $stmt->bind_param("sss", $username, $code, $dateTime);
    $stmt->execute();
    $r = $stmt->get_result();
    $stmt->close();

    if ($r && $r->num_rows > 0) {
        $conn->close();
        log_request([
            'ok'=>true,
            'saved'=>false,
            'reason'=>'DUPLICATE_RECENT',
            'user'=>$username,
            'code'=>$code,
            'graphMessageId'=>$graphMessageId
        ]);
        json_response(200, ['ok'=>true,'saved'=>false,'reason'=>'DUPLICATE_RECENT']);
    }

    $stmt = $conn->prepare(
        "INSERT INTO IncomingCodes (DateTime, FromEmail, ToEmail, UserName, Code)
         VALUES (?, ?, ?, ?, ?)"
    );
    $steamFrom = 'noreply@steampowered.com';
    $stmt->bind_param("sssss", $dateTime, $steamFrom, $to, $username, $code);
    $stmt->execute();
    $stmt->close();
    $conn->close();

    log_request([
        'ok'=>true,
        'saved'=>true,
        'user'=>$username,
        'code'=>$code,
        'graphMessageId'=>$graphMessageId
    ]);
    json_response(200, ['ok'=>true,'saved'=>true,'user'=>$username,'code'=>$code]);

} catch (Throwable $e) {
    error_log("SAVE_FAIL: ".$e->getMessage());
    $conn->close();
    json_response(500, ['ok'=>false,'err'=>'SAVE_FAIL']);
}

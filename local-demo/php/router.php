<?php
require_once __DIR__ . '/public/includes/functions.php';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/api/steam_inbound.php') {
    // Fault injection exists only in this local fixture, never in the receiver.
    $fault = null;
    $faultFile = __DIR__ . '/public/api/faults.json';
    if (getenv('MAIL_COLLECTOR_LOCAL_DEMO') === '1' && is_file($faultFile)) {
        $payload = json_decode(file_get_contents('php://input'), true);
        $handle = fopen($faultFile, 'r+');
        if ($handle && flock($handle, LOCK_EX)) {
            $faults = json_decode(stream_get_contents($handle), true) ?: [];
            $user = $payload['username'] ?? '';
            if (isset($faults[$user])) {
                $fault = $faults[$user];
                unset($faults[$user]);
                rewind($handle);
                ftruncate($handle, 0);
                fwrite($handle, json_encode($faults));
                fflush($handle);
            }
            flock($handle, LOCK_UN);
        }
        if ($handle) fclose($handle);
    }
    if ($fault === 'before-save') {
        http_response_code(503);
        header('Content-Type: application/json');
        header('Retry-After: 1');
        echo json_encode(['ok' => false, 'err' => 'LOCAL_SIMULATED_OUTAGE']);
        return;
    }
    if ($fault === 'after-save') {
        ob_start(function ($body) {
            $result = json_decode($body, true);
            if (!empty($result['saved'])) {
                http_response_code(503);
                header('Retry-After: 1');
                return json_encode(['ok' => false, 'err' => 'LOCAL_LOST_SUCCESS_RESPONSE']);
            }
            return $body;
        });
    }
    require __DIR__ . '/public/api/steam_inbound.php';
    return;
}

header('Content-Type: application/json');
if ($path === '/__demo/health') {
    $conn = get_mysql_connection();
    $conn->query('SELECT 1');
    $conn->close();
    echo json_encode(['mode' => 'LOCAL_SIMULATION', 'database' => 'steam_receiver_demo', 'status' => 'ok']);
    return;
}

if ($path === '/__demo/codes' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $conn = get_mysql_connection();
    $username = $_GET['username'] ?? '';
    $stmt = $conn->prepare('SELECT Id, DateTime, FromEmail, ToEmail, UserName, Code FROM IncomingCodes WHERE UserName = ? ORDER BY Id DESC LIMIT 20');
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $conn->close();
    echo json_encode(['mode' => 'LOCAL_SIMULATION', 'rows' => $rows]);
    return;
}

http_response_code(404);
echo json_encode(['error' => 'Local fixture endpoint not found']);

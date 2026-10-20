<?php
// Synthetic local fixture only; the production site's include is not copied.
function get_mysql_connection() {
    if (getenv('MAIL_COLLECTOR_LOCAL_DEMO') !== '1') {
        throw new RuntimeException('Local demo flag is required');
    }
    $conn = new mysqli('mysql', 'local_demo', 'local-demo-password', 'steam_receiver_demo');
    $conn->set_charset('utf8mb4');
    return $conn;
}

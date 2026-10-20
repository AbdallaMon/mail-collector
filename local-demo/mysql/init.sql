CREATE DATABASE IF NOT EXISTS steam_receiver_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON steam_receiver_demo.* TO 'local_demo'@'%';

CREATE TABLE IF NOT EXISTS steam_receiver_demo.IncomingCodes (
  Id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  DateTime DATETIME NOT NULL,
  FromEmail VARCHAR(255) NOT NULL,
  ToEmail TEXT NOT NULL,
  UserName VARCHAR(191) NOT NULL,
  Code VARCHAR(32) NOT NULL,
  INDEX incoming_user_date (UserName, DateTime)
) ENGINE=InnoDB;

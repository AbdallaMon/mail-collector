-- CreateTable
CREATE TABLE `admin_users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'admin',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mail_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `msUserId` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'CONNECTED', 'NEEDS_REAUTH', 'ERROR', 'DISABLED') NOT NULL DEFAULT 'PENDING',
    `lastSyncAt` DATETIME(3) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mail_accounts_email_key`(`email`),
    INDEX `mail_accounts_status_idx`(`status`),
    INDEX `mail_accounts_isEnabled_idx`(`isEnabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mail_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `refreshToken` TEXT NOT NULL,
    `tokenType` VARCHAR(191) NOT NULL DEFAULT 'Bearer',
    `scope` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mail_tokens_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mail_sync_state` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `deltaLink` TEXT NULL,
    `lastDeltaAt` DATETIME(3) NULL,
    `lastMessageDateTime` DATETIME(3) NULL,
    `syncCursor` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `mail_sync_state_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mail_message_log` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `graphMessageId` VARCHAR(191) NOT NULL,
    `internetMessageId` VARCHAR(191) NULL,
    `subject` TEXT NULL,
    `fromAddress` VARCHAR(191) NULL,
    `receivedDateTime` DATETIME(3) NULL,
    `forwardedTo` VARCHAR(191) NULL,
    `forwardStatus` ENUM('PENDING', 'FORWARDED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `mail_message_log_forwardStatus_idx`(`forwardStatus`),
    INDEX `mail_message_log_receivedDateTime_idx`(`receivedDateTime`),
    UNIQUE INDEX `mail_message_log_accountId_graphMessageId_key`(`accountId`, `graphMessageId`),
    UNIQUE INDEX `mail_message_log_internetMessageId_key`(`internetMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_logs` (
    `id` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `metadata` JSON NULL,
    `accountId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `system_logs_level_idx`(`level`),
    INDEX `system_logs_category_idx`(`category`),
    INDEX `system_logs_accountId_idx`(`accountId`),
    INDEX `system_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_states` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'idle',
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_states_accountId_key`(`accountId`),
    INDEX `job_states_status_idx`(`status`),
    INDEX `job_states_nextRunAt_idx`(`nextRunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mail_tokens` ADD CONSTRAINT `mail_tokens_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `mail_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mail_sync_state` ADD CONSTRAINT `mail_sync_state_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `mail_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mail_message_log` ADD CONSTRAINT `mail_message_log_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `mail_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

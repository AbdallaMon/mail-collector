-- CreateTable
CREATE TABLE `webhook_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NOT NULL,
    `changeType` VARCHAR(191) NOT NULL,
    `notificationUrl` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `clientState` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `webhook_subscriptions_accountId_key`(`accountId`),
    UNIQUE INDEX `webhook_subscriptions_subscriptionId_key`(`subscriptionId`),
    INDEX `webhook_subscriptions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

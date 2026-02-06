-- AlterTable
ALTER TABLE `mail_accounts` ADD COLUMN `failedForwardCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `forwardedCount` INTEGER NOT NULL DEFAULT 0;

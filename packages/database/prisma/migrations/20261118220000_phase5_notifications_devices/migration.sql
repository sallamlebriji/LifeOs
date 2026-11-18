-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `dedupeKey` VARCHAR(191) NULL,
    ADD COLUMN `error` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `UserPreferences` ADD COLUMN `emailReminders` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `eventReminderMinutes` SMALLINT NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE `DeviceToken` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(10) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DeviceToken_token_key`(`token`),
    INDEX `DeviceToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Notification_dedupeKey_key` ON `Notification`(`dedupeKey`);

-- AddForeignKey
ALTER TABLE `DeviceToken` ADD CONSTRAINT `DeviceToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


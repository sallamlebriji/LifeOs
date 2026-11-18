-- AlterTable
ALTER TABLE `StudySession` ADD COLUMN `quality` TINYINT NULL;

-- AlterTable
ALTER TABLE `UserPreferences` ADD COLUMN `weeklyWorkoutTarget` TINYINT NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE `Workout` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `type` ENUM('STRENGTH', 'CARDIO', 'MOBILITY', 'SPORT', 'OTHER') NOT NULL DEFAULT 'STRENGTH',
    `startAt` DATETIME(3) NOT NULL,
    `durationMinutes` SMALLINT NOT NULL,
    `intensity` TINYINT NULL,
    `notes` TEXT NULL,
    `eventId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Workout_userId_startAt_idx`(`userId`, `startAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExerciseLog` (
    `id` CHAR(36) NOT NULL,
    `workoutId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `sets` SMALLINT NULL,
    `reps` SMALLINT NULL,
    `weightKg` DECIMAL(6, 2) NULL,
    `distanceKm` DECIMAL(7, 2) NULL,
    `durationMinutes` SMALLINT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `ExerciseLog_workoutId_sortOrder_idx`(`workoutId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Workout` ADD CONSTRAINT `Workout_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExerciseLog` ADD CONSTRAINT `ExerciseLog_workoutId_fkey` FOREIGN KEY (`workoutId`) REFERENCES `Workout`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

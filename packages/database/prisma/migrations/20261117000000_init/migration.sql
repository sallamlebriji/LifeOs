-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(80) NOT NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `emailVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserPreferences` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Casablanca',
    `locale` VARCHAR(10) NOT NULL DEFAULT 'en',
    `theme` VARCHAR(10) NOT NULL DEFAULT 'system',
    `weekStartsOn` TINYINT NOT NULL DEFAULT 1,
    `dayStartTime` CHAR(5) NOT NULL DEFAULT '07:00',
    `dayEndTime` CHAR(5) NOT NULL DEFAULT '22:00',
    `workStartTime` CHAR(5) NOT NULL DEFAULT '09:00',
    `workEndTime` CHAR(5) NOT NULL DEFAULT '18:00',
    `workDays` JSON NOT NULL,
    `bufferMinutes` SMALLINT NOT NULL DEFAULT 10,
    `minSessionMinutes` SMALLINT NOT NULL DEFAULT 25,
    `maxDailyFocusMinutes` SMALLINT NOT NULL DEFAULT 480,
    `preferredFocusTime` ENUM('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'ANY') NOT NULL DEFAULT 'MORNING',
    `schedulingWeights` JSON NULL,
    `notificationsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserPreferences_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `familyId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `userAgent` VARCHAR(255) NULL,
    `ipAddress` VARCHAR(45) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `purpose` ENUM('EMAIL_VERIFICATION', 'PASSWORD_RESET') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `VerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `VerificationToken_userId_purpose_idx`(`userId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `action` VARCHAR(64) NOT NULL,
    `entityType` VARCHAR(64) NULL,
    `entityId` CHAR(36) NULL,
    `ipAddress` VARCHAR(45) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `kind` ENUM('WORK', 'PERSONAL', 'SPORT', 'STUDY', 'TRAVEL', 'HEALTH', 'SOCIAL', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `color` CHAR(7) NOT NULL,
    `icon` VARCHAR(40) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Category_userId_kind_idx`(`userId`, `kind`),
    UNIQUE INDEX `Category_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Goal` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `categoryId` CHAR(36) NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `level` ENUM('ANNUAL', 'MONTHLY', 'WEEKLY', 'DAILY') NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('NOT_STARTED', 'ACTIVE', 'COMPLETED', 'ABANDONED') NOT NULL DEFAULT 'NOT_STARTED',
    `startDate` DATE NULL,
    `deadline` DATE NULL,
    `targetValue` DECIMAL(12, 2) NULL,
    `currentValue` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `unit` VARCHAR(30) NULL,
    `progressLog` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Goal_userId_level_status_idx`(`userId`, `level`, `status`),
    INDEX `Goal_userId_deadline_idx`(`userId`, `deadline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoalMilestone` (
    `id` CHAR(36) NOT NULL,
    `goalId` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `dueDate` DATE NULL,
    `completedAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GoalMilestone_goalId_sortOrder_idx`(`goalId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NULL,
    `goalId` CHAR(36) NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'PLANNED',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `color` CHAR(7) NULL,
    `startDate` DATE NULL,
    `deadline` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Project_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `projectId` CHAR(36) NULL,
    `goalId` CHAR(36) NULL,
    `categoryId` CHAR(36) NULL,
    `title` VARCHAR(300) NOT NULL,
    `notes` TEXT NULL,
    `status` ENUM('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'TODO',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `estimatedMinutes` SMALLINT NULL,
    `actualMinutes` SMALLINT NULL,
    `dueAt` DATETIME(3) NULL,
    `plannedDate` DATE NULL,
    `schedulingMode` ENUM('FLEXIBLE', 'FIXED') NOT NULL DEFAULT 'FLEXIBLE',
    `fixedStartAt` DATETIME(3) NULL,
    `splittable` BOOLEAN NOT NULL DEFAULT false,
    `minSessionMinutes` SMALLINT NULL,
    `preferredTimeOfDay` ENUM('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'ANY') NOT NULL DEFAULT 'ANY',
    `recurrenceRule` VARCHAR(500) NULL,
    `completedAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Task_userId_status_dueAt_idx`(`userId`, `status`, `dueAt`),
    INDEX `Task_userId_plannedDate_idx`(`userId`, `plannedDate`),
    INDEX `Task_projectId_idx`(`projectId`),
    INDEX `Task_goalId_idx`(`goalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskDependency` (
    `taskId` CHAR(36) NOT NULL,
    `dependsOnId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskDependency_dependsOnId_idx`(`dependsOnId`),
    PRIMARY KEY (`taskId`, `dependsOnId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskSchedule` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `taskId` CHAR(36) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `status` ENUM('PLANNED', 'DONE', 'MISSED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `source` ENUM('MANUAL', 'AI', 'EXTERNAL') NOT NULL DEFAULT 'MANUAL',
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `proposalId` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskSchedule_userId_startAt_idx`(`userId`, `startAt`),
    INDEX `TaskSchedule_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CalendarEvent` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NULL,
    `projectId` CHAR(36) NULL,
    `tripId` CHAR(36) NULL,
    `title` VARCHAR(300) NOT NULL,
    `description` TEXT NULL,
    `location` VARCHAR(300) NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `allDay` BOOLEAN NOT NULL DEFAULT false,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Casablanca',
    `recurrenceRule` VARCHAR(500) NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `flexibility` ENUM('FIXED', 'FLEXIBLE') NOT NULL DEFAULT 'FIXED',
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `color` CHAR(7) NULL,
    `source` ENUM('MANUAL', 'AI', 'EXTERNAL') NOT NULL DEFAULT 'MANUAL',
    `proposalId` CHAR(36) NULL,
    `integrationId` CHAR(36) NULL,
    `externalId` VARCHAR(255) NULL,
    `externalEtag` VARCHAR(255) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CalendarEvent_userId_startAt_endAt_idx`(`userId`, `startAt`, `endAt`),
    INDEX `CalendarEvent_userId_categoryId_idx`(`userId`, `categoryId`),
    UNIQUE INDEX `CalendarEvent_integrationId_externalId_key`(`integrationId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AvailabilityRule` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `kind` ENUM('WORKING_HOURS', 'UNAVAILABLE', 'PREFERRED', 'PROTECTED_FREE_TIME') NOT NULL,
    `label` VARCHAR(100) NULL,
    `weekday` TINYINT NULL,
    `startTime` CHAR(5) NULL,
    `endTime` CHAR(5) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Casablanca',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AvailabilityRule_userId_kind_active_idx`(`userId`, `kind`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Habit` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `frequency` ENUM('DAILY', 'WEEKLY', 'CUSTOM') NOT NULL DEFAULT 'DAILY',
    `daysOfWeek` JSON NULL,
    `timesPerWeek` TINYINT NULL,
    `targetPerDay` SMALLINT NOT NULL DEFAULT 1,
    `reminderTime` CHAR(5) NULL,
    `color` CHAR(7) NULL,
    `icon` VARCHAR(40) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Habit_userId_archivedAt_idx`(`userId`, `archivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HabitLog` (
    `id` CHAR(36) NOT NULL,
    `habitId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `count` SMALLINT NOT NULL DEFAULT 1,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HabitLog_userId_date_idx`(`userId`, `date`),
    UNIQUE INDEX `HabitLog_habitId_date_key`(`habitId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudySubject` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `color` CHAR(7) NULL,
    `importance` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `examDate` DATETIME(3) NULL,
    `weeklyTargetMinutes` SMALLINT NULL,
    `revisionIntervalDays` SMALLINT NULL,
    `outline` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudySubject_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudySession` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `subjectId` CHAR(36) NOT NULL,
    `kind` ENUM('LEARNING', 'REVISION', 'EXAM') NOT NULL DEFAULT 'LEARNING',
    `topic` VARCHAR(200) NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `easeFactor` DECIMAL(4, 2) NULL,
    `intervalDays` SMALLINT NULL,
    `nextReviewAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudySession_userId_startAt_idx`(`userId`, `startAt`),
    INDEX `StudySession_subjectId_nextReviewAt_idx`(`subjectId`, `nextReviewAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Trip` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `destination` VARCHAR(200) NOT NULL,
    `departureAt` DATETIME(3) NOT NULL,
    `returnAt` DATETIME(3) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Casablanca',
    `status` ENUM('PLANNING', 'BOOKED', 'ONGOING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNING',
    `transportation` VARCHAR(300) NULL,
    `accommodation` VARCHAR(300) NULL,
    `budgetAmount` DECIMAL(12, 2) NULL,
    `budgetCurrency` CHAR(3) NULL,
    `companions` JSON NULL,
    `checklist` JSON NULL,
    `documents` JSON NULL,
    `notes` TEXT NULL,
    `blocksCalendar` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Trip_userId_departureAt_idx`(`userId`, `departureAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripActivity` (
    `id` CHAR(36) NOT NULL,
    `tripId` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `location` VARCHAR(300) NULL,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `reservation` VARCHAR(200) NULL,
    `cost` DECIMAL(12, 2) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TripActivity_tripId_startAt_idx`(`tripId`, `startAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanningProposal` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NULL,
    `supersedesId` CHAR(36) NULL,
    `status` ENUM('PENDING', 'APPLIED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `revision` INTEGER NOT NULL DEFAULT 1,
    `version` INTEGER NOT NULL DEFAULT 1,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `request` JSON NOT NULL,
    `summary` TEXT NULL,
    `explanation` JSON NULL,
    `unscheduled` JSON NULL,
    `score` DECIMAL(6, 3) NULL,
    `baseFingerprint` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NULL,
    `appliedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlanningProposal_userId_status_expiresAt_idx`(`userId`, `status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanningChange` (
    `id` CHAR(36) NOT NULL,
    `proposalId` CHAR(36) NOT NULL,
    `type` ENUM('CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT', 'SCHEDULE_TASK', 'UNSCHEDULED') NOT NULL,
    `decision` ENUM('PROPOSED', 'ACCEPTED', 'MODIFIED', 'REJECTED') NOT NULL DEFAULT 'PROPOSED',
    `title` VARCHAR(300) NOT NULL,
    `targetEventId` CHAR(36) NULL,
    `targetTaskId` CHAR(36) NULL,
    `targetVersion` INTEGER NULL,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` TEXT NULL,
    `conflicts` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlanningChange_proposalId_sortOrder_idx`(`proposalId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIConversation` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AIConversation_userId_updatedAt_idx`(`userId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIMessage` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `role` ENUM('SYSTEM', 'USER', 'ASSISTANT', 'TOOL') NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `structured` JSON NULL,
    `provider` VARCHAR(40) NULL,
    `model` VARCHAR(80) NULL,
    `promptTokens` INTEGER NULL,
    `completionTokens` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AIMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` ENUM('TASK_REMINDER', 'EVENT_REMINDER', 'HABIT_REMINDER', 'DEADLINE_ALERT', 'AI_SUGGESTION', 'SYSTEM') NOT NULL,
    `channel` ENUM('IN_APP', 'PUSH', 'EMAIL') NOT NULL DEFAULT 'IN_APP',
    `title` VARCHAR(200) NOT NULL,
    `body` VARCHAR(1000) NULL,
    `entityType` VARCHAR(64) NULL,
    `entityId` CHAR(36) NULL,
    `scheduledFor` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    INDEX `Notification_scheduledFor_sentAt_idx`(`scheduledFor`, `sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Integration` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `provider` ENUM('GOOGLE_CALENDAR', 'APPLE_CALENDAR') NOT NULL,
    `status` ENUM('CONNECTED', 'DISCONNECTED', 'ERROR') NOT NULL DEFAULT 'DISCONNECTED',
    `externalAccountId` VARCHAR(255) NULL,
    `encryptedCredentials` TEXT NULL,
    `scopes` VARCHAR(1000) NULL,
    `syncCursor` VARCHAR(1000) NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Integration_userId_provider_externalAccountId_key`(`userId`, `provider`, `externalAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncLog` (
    `id` CHAR(36) NOT NULL,
    `integrationId` CHAR(36) NOT NULL,
    `direction` ENUM('IMPORT', 'EXPORT', 'BIDIRECTIONAL') NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `itemsProcessed` INTEGER NOT NULL DEFAULT 0,
    `itemsFailed` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` VARCHAR(1000) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `SyncLog_integrationId_startedAt_idx`(`integrationId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserPreferences` ADD CONSTRAINT `UserPreferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VerificationToken` ADD CONSTRAINT `VerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Goal` ADD CONSTRAINT `Goal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Goal` ADD CONSTRAINT `Goal_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Goal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Goal` ADD CONSTRAINT `Goal_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoalMilestone` ADD CONSTRAINT `GoalMilestone_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `Goal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `Goal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_goalId_fkey` FOREIGN KEY (`goalId`) REFERENCES `Goal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskDependency` ADD CONSTRAINT `TaskDependency_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskDependency` ADD CONSTRAINT `TaskDependency_dependsOnId_fkey` FOREIGN KEY (`dependsOnId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSchedule` ADD CONSTRAINT `TaskSchedule_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSchedule` ADD CONSTRAINT `TaskSchedule_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSchedule` ADD CONSTRAINT `TaskSchedule_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `PlanningProposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `PlanningProposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CalendarEvent` ADD CONSTRAINT `CalendarEvent_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AvailabilityRule` ADD CONSTRAINT `AvailabilityRule_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Habit` ADD CONSTRAINT `Habit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Habit` ADD CONSTRAINT `Habit_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HabitLog` ADD CONSTRAINT `HabitLog_habitId_fkey` FOREIGN KEY (`habitId`) REFERENCES `Habit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HabitLog` ADD CONSTRAINT `HabitLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySubject` ADD CONSTRAINT `StudySubject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySession` ADD CONSTRAINT `StudySession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudySession` ADD CONSTRAINT `StudySession_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `StudySubject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripActivity` ADD CONSTRAINT `TripActivity_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanningProposal` ADD CONSTRAINT `PlanningProposal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanningProposal` ADD CONSTRAINT `PlanningProposal_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AIConversation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanningProposal` ADD CONSTRAINT `PlanningProposal_supersedesId_fkey` FOREIGN KEY (`supersedesId`) REFERENCES `PlanningProposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanningChange` ADD CONSTRAINT `PlanningChange_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `PlanningProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIConversation` ADD CONSTRAINT `AIConversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIMessage` ADD CONSTRAINT `AIMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AIConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Integration` ADD CONSTRAINT `Integration_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SyncLog` ADD CONSTRAINT `SyncLog_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


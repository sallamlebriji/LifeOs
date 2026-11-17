-- Runs once, on first container start (empty data volume).
-- Test database for integration tests + shadow database for `prisma migrate dev`.
CREATE DATABASE IF NOT EXISTS lifeos_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS lifeos_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON lifeos_test.* TO 'lifeos'@'%';
GRANT ALL PRIVILEGES ON lifeos_shadow.* TO 'lifeos'@'%';
FLUSH PRIVILEGES;

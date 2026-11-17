import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Applies Prisma migrations to the test database before e2e suites run.
 * Skipped (with a warning) if TEST_DATABASE_URL isn't configured.
 */
export default function setup() {
  config({ path: resolve(__dirname, '../../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('[e2e] TEST_DATABASE_URL not set — e2e suites will fail to connect.');
    return;
  }
  if (!/lifeos_test/.test(url)) {
    throw new Error('Refusing to run e2e tests: TEST_DATABASE_URL must point to a *_test database.');
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '../../../packages/database'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}

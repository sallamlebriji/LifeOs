import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the full local stack (MySQL + Redis + API + web).
 * Start it first: `pnpm db:up && pnpm db:deploy && pnpm dev`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});

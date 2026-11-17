import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC is required so NestJS decorator metadata (DI) is emitted in tests.
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
    // One forked worker: the Prisma engine + MySQL e2e suites were flaky across forks on Windows.
    poolOptions: { forks: { singleFork: true } },
    // e2e suites share one MySQL test database: run files sequentially.
    fileParallelism: false,
    projects: [
      {
        plugins,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        plugins,
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['test/**/*.e2e-spec.ts'],
          setupFiles: ['test/setup-env.ts'],
          globalSetup: ['test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

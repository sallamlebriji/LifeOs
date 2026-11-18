import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load the monorepo .env, then point the API at the dedicated test database.
config({ path: resolve(__dirname, '../../../.env'), quiet: true });
process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_ACCESS_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';

// The AI provider is never called from tests; the planner tests cover the not-configured path.
process.env.AI_PROVIDER = '';
process.env.OPENAI_API_KEY = '';

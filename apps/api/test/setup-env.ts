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

// Phase 5: integrations are configured with test values; Google's HTTP API is
// replaced by a test double inside the tests, so no request leaves the machine.
process.env.JOBS_ENABLED = 'false';
process.env.MAIL_TRANSPORT = 'log';
process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/integrations/google/callback';

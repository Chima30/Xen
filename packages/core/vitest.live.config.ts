import { defineConfig } from 'vitest/config';
// LIVE integration tests: hit real APIs using credentials from the repo-root .env. Skipped per-provider when keys are absent.
export default defineConfig({ test: { include: ['test/live/**/*.test.ts'], testTimeout: 60_000, setupFiles: ['dotenv/config'] } });

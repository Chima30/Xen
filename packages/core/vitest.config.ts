import { defineConfig } from 'vitest/config';
// Unit tests: fully offline, fixtures only. Live tests live in test/live and use vitest.live.config.ts.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], exclude: ['test/live/**'] } });

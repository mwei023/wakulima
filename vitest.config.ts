import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Server-side sync API tests live in server/ (real Postgres; skip cleanly
    // when neither DATABASE_URL nor docker exists). The beforeAll may pull the
    // postgres image on a cold cache — give the hook room.
    include: ['src/**/*.test.ts', 'server/**/*.test.mjs'],
    testTimeout: 15000,
    hookTimeout: 240_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

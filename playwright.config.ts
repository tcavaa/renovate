import { defineConfig, devices } from '@playwright/test';

/**
 * Browser flows against a running app.
 *
 *   pnpm test:e2e                       uses the dev server already on :3000, or starts one
 *   PLAYWRIGHT_BASE_URL=https://… pnpm test:e2e   run the same flows against staging
 *
 * These need the database, so they are not part of the CI `checks` job; run them before a
 * release tag, or point them at the deployed site after one.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    locale: 'ka-GE',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000/api/health',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

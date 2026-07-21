import { defineConfig, devices } from '@playwright/test';

// Lumea E2E — money & reservation integrity through the real UI.
// Run against a NON-PROD test tenant (never prod data). See tests/e2e/README.md.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Money flows share one tenant + a single-open register — run serially to avoid cross-talk.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // To boot the app automatically instead of pointing E2E_BASE_URL at a preview deploy:
  // webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});

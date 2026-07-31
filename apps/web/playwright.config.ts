import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 4200);
const API_PORT = Number(process.env['E2E_API_PORT'] ?? 3000);
const BASE_URL = `http://localhost:${WEB_PORT}`;

/**
 * End-to-end runs drive the real Angular app against the real API and a real
 * Postgres. Only the language model and the identity provider are stubbed —
 * neither can be reached deterministically from a test run.
 *
 * `NYM_CHROMIUM_PATH` points the runner at a Chromium that is already on the
 * machine. Containers often ship one whose build number does not match the
 * Playwright release, and honouring the variable avoids a browser download.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: '../../test-results',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 1000 },
        launchOptions: process.env['NYM_CHROMIUM_PATH']
          ? { executablePath: process.env['NYM_CHROMIUM_PATH'] }
          : {},
      },
    },
  ],

  webServer: [
    {
      name: 'api',
      command: `npx ts-node -P tsconfig.json test/e2e-server.ts`,
      cwd: '../api',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: `npx ng serve --port ${WEB_PORT}`,
      url: BASE_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env['CI'],
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

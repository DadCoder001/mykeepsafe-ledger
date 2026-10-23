// @ts-check
import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// `npm start` server-mode tests get a throwaway data folder on every run.
const SERVER_DATA_DIR = path.join(os.tmpdir(), `ksl-playwright-${Date.now()}`);

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'features/**/*.spec.js',
    'core/**/*.spec.js',
    'integration/**/*.spec.js',
  ],
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:8000',
      reuseExistingServer: true,
    },
    {
      // The production server (`npm start`) on its own port and data folder.
      command: 'npm run build && node server/index.mjs',
      url: 'http://localhost:8200/api/health',
      reuseExistingServer: false,
      timeout: 120000,
      env: { PORT: '8200', KSL_DATA_DIR: SERVER_DATA_DIR },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

const isHeaded = process.env.HEADED === 'true' || process.env.HEADLESS === 'false';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  retries: 1,
  workers: 1, // Sequential run to avoid tenant and invoice collision
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: !isHeaded,
  },
  projects: [
    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'Tablet iPad',
      use: {
        ...devices['iPad (gen 7)'],
        defaultBrowserType: 'chromium',
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
  webServer: {
    command: 'node server/server.js',
    url: 'http://localhost:3001/api/health',
    reuseExistingServer: true,
    timeout: 45 * 1000,
  },
});

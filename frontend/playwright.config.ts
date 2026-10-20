/**
 * Playwright configuration for visual regression screenshots.
 *
 * Captures the landing page, directory, programme detail and funder dashboard
 * in light and dark themes at 360 px (mobile) and 1280 px (desktop).
 *
 * The app runs in fixture mode (`VITE_FIXTURES=1`) so the wallet is always
 * "connected" with a fixed address, and a local indexer server serves the
 * fixture JSON — no network calls, no flakiness from testnet latency.
 *
 * Baselines live in `tests/screenshots/`. Update them with:
 *   npm run screenshots:update
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
const BASE_URL = `http://localhost:${PORT}`;

// The indexer fixture server is started by globalSetup and its port passed in.
const INDEXER_PORT = 4175;

export default defineConfig({
  testDir: 'tests',
  testMatch: 'screenshots.spec.ts',
  // Snapshots live beside the spec so `git diff` shows them clearly.
  snapshotDir: 'tests/screenshots',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}-{projectName}{ext}',

  fullyParallel: true,
  retries: 0,
  // One worker per theme×viewport combination.
  workers: 4,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    // Animations off for deterministic screenshots.
    animations: 'disabled',
    // Wait for network requests initiated on navigation to settle so async
    // data panels are populated before the screenshot fires.
    waitForLoadState: 'networkidle',
    screenshot: 'only-on-failure',
    // Every screenshot comparison uses zero-pixel tolerance so an unintended
    // change always fails. Update baselines deliberately with --update-snapshots.
    expect: {
      toHaveScreenshot: { maxDiffPixels: 0 },
    },
  },

  // Two themes × two viewports = four projects.
  projects: [
    {
      name: 'light-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        colorScheme: 'light',
      },
    },
    {
      name: 'dark-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        colorScheme: 'dark',
      },
    },
    {
      name: 'light-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        colorScheme: 'light',
      },
    },
    {
      name: 'dark-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        colorScheme: 'dark',
      },
    },
  ],

  webServer: {
    // Build once, then serve the static output — deterministic, no hot-reload noise.
    command: [
      `VITE_FIXTURES=1`,
      `VITE_INDEXER_URL=http://localhost:${INDEXER_PORT}`,
      // Disable the RPC so the app never reaches testnet during screenshots.
      `VITE_SOROBAN_RPC_URL=http://localhost:0`,
      `npm run build --silent`,
      `&&`,
      `npx vite preview --port ${PORT} --strictPort`,
    ].join(' '),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_FIXTURES: '1',
      VITE_INDEXER_URL: `http://localhost:${INDEXER_PORT}`,
      VITE_SOROBAN_RPC_URL: `http://localhost:0`,
    },
    timeout: 120_000,
  },

  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
});

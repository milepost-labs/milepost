/**
 * Browser checks against production builds served with the headers from
 * vercel.json. Used by the `browser` job in the root .github/workflows/ci.yml.
 *
 * Two builds are needed (`npm run build:browser`):
 *   - dist-signed-in:  VITE_FIXTURES=1, so the wallet is connected.
 *   - dist-signed-out: no fixtures, so the wallet is disconnected.
 *
 * Projects:
 *   - smoke-signed-in:   every route loads with no error and no CSP violation.
 *   - reflow-signed-in:  every route is free of horizontal page scroll at 320px.
 *   - reflow-signed-out: the same reflow check on the signed-out build.
 *   - contrast-signed-in: axe colour contrast on every route, in light and dark.
 *   - keyboard-signed-in: the money path, completed with the keyboard alone.
 *
 * Only the signed-in build is fixture mode, so only it can render the sample
 * data the smoke test expects. The signed-out build is for layout only.
 */

import { defineConfig, devices } from '@playwright/test';

const SIGNED_IN_PORT = 4180;
const SIGNED_OUT_PORT = 4181;
const SIGNED_IN_URL = `http://127.0.0.1:${SIGNED_IN_PORT}`;
const SIGNED_OUT_URL = `http://127.0.0.1:${SIGNED_OUT_PORT}`;

export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  projects: [
    {
      name: 'smoke-signed-in',
      testMatch: 'smoke.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SIGNED_IN_URL,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'reflow-signed-in',
      testMatch: 'reflow.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SIGNED_IN_URL,
        viewport: { width: 320, height: 640 },
      },
    },
    {
      name: 'reflow-signed-out',
      testMatch: 'reflow.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SIGNED_OUT_URL,
        viewport: { width: 320, height: 640 },
      },
    },
    {
      name: 'contrast-signed-in',
      testMatch: 'contrast.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SIGNED_IN_URL,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'keyboard-signed-in',
      testMatch: 'keyboard.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SIGNED_IN_URL,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],

  webServer: [
    {
      command: `node scripts/serve-dist.mjs dist-signed-in ${SIGNED_IN_PORT}`,
      url: SIGNED_IN_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `node scripts/serve-dist.mjs dist-signed-out ${SIGNED_OUT_PORT}`,
      url: SIGNED_OUT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});

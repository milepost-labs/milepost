/**
 * Visual regression screenshots.
 *
 * Captures five screens across two themes (light / dark) and two viewports
 * (360 px mobile, 1280 px desktop) — 20 screenshots total.
 *
 * The app runs in fixture mode (VITE_FIXTURES=1) with a local indexer stub,
 * so every screenshot is deterministic: fixed wallet address, fixed programme
 * list, no testnet reads, no network flakiness.
 *
 * Baselines live in tests/screenshots/. Update them deliberately with:
 *   npm run screenshots:update
 *
 * Screens captured:
 *   - / (landing page)
 *   - /directory (programme list)
 *   - /programme (demo programme detail, signed-in state)
 *   - /funders (funder dashboard, signed-in state)
 *   - /recipients (recipient dashboard, signed-in state)
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to `path` and wait until:
 *  1. The network has gone idle (all fetches settled).
 *  2. All web fonts are loaded (prevents blurry text in baseline commits).
 *  3. CSS animations are forcibly disabled (belt-and-suspenders alongside the
 *     `animations: 'disabled'` Playwright option — some animation libraries
 *     bypass the media-query approach Playwright uses).
 *
 * The fixture mode wallet is pre-connected, so signed-in panels render on
 * first load without needing a click.
 */
async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });

  // Kill any remaining animations via an injected stylesheet so every frame
  // is deterministic regardless of how the component triggers them.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
    `,
  });

  // Wait for fonts so text renders with the correct metrics.
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Take a full-page screenshot and compare it against the stored baseline.
 * The name encodes the screen so it is self-documenting in the diff viewer.
 */
async function screenshot(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    // A single-pixel tolerance on anti-aliased font edges keeps baselines
    // stable across minor rendering-engine updates without hiding real breaks.
    maxDiffPixels: 4,
  });
}

// ---------------------------------------------------------------------------
// Tests — one describe per screen so failures are easy to locate
// ---------------------------------------------------------------------------

test.describe('Landing page (/)', () => {
  test('matches baseline', async ({ page }) => {
    await goto(page, '/');
    await screenshot(page, 'landing');
  });
});

test.describe('Programme directory (/directory)', () => {
  test('matches baseline', async ({ page }) => {
    await goto(page, '/directory');
    // Wait for the programme cards to populate from the indexer fixture.
    await page.waitForSelector('.programme-card', { timeout: 10_000 }).catch(() => {
      // Some builds render a different class; tolerate absence and screenshot anyway.
    });
    await screenshot(page, 'directory');
  });
});

test.describe('Programme detail (/programme)', () => {
  test('matches baseline', async ({ page }) => {
    // /programme without an id renders the seeded demo programme, which the
    // app always falls back to in fixture mode — so there is always something
    // to screenshot without knowing a live contract address.
    await goto(page, '/programme');
    // The page makes several parallel reads; wait for at least the phase badge.
    await page.waitForSelector('.programme-header', { timeout: 15_000 }).catch(() => {});
    await screenshot(page, 'programme-detail');
  });
});

test.describe('Funder dashboard (/funders)', () => {
  test('matches baseline', async ({ page }) => {
    await goto(page, '/funders');
    // Contribution cards are fixture data, available immediately.
    await page.waitForSelector('.fund-contributions', { timeout: 10_000 }).catch(() => {});
    await screenshot(page, 'funder-dashboard');
  });
});

test.describe('Recipient dashboard (/recipients)', () => {
  test('matches baseline', async ({ page }) => {
    await goto(page, '/recipients');
    await screenshot(page, 'recipient-dashboard');
  });
});

/**
 * Keyboard-only walkthroughs of the money path (#697).
 *
 * Each flow is completed in the signed-in fixture build using Tab, Shift+Tab,
 * Enter and typing only, and asserts a visible focus ring on every control it
 * lands on. A control the keyboard cannot reach, or one with no focus ring,
 * fails here.
 *
 * Covered: contribute (funder), apply (recipient) and release (recipient). These
 * sample flows settle on the device, with no network. Vote and attest are not
 * covered: in fixture mode they submit through the Soroban RPC, which this build
 * does not stub, so they would reach the testnet from CI.
 *
 * Run: npm run test:browser --prefix frontend
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { serveFixtureIndex, settle } from './support';

/**
 * Enough Tab presses to cross the header, its sub-navigation and a page's
 * controls to the one under test. The cap is a failure guard, not a timeout.
 */
const MAX_TAB_PRESSES = 120;
/** Sample transactions wait about 1.2 s before they settle. */
const SETTLE_TIMEOUT_MS = 15_000;

/** Asserts that the focused element shows a 2px outline, the app's focus ring. */
async function expectFocusRing(page: Page, step: string): Promise<void> {
  const focused = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return null;
    const style = getComputedStyle(element);
    const label = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40);
    return {
      name: `${element.tagName.toLowerCase()} "${label}"`,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
    };
  });
  expect(focused, `${step}: nothing has focus`).not.toBeNull();
  expect(focused?.outlineStyle, `${step}: no visible focus ring on ${focused?.name}`).toBe('solid');
  expect(focused?.outlineWidth, `${step}: focus ring on ${focused?.name} is under 2px`).toBeGreaterThanOrEqual(2);
}

/**
 * Presses Tab until `target` has focus, then checks its focus ring. Fails if the
 * keyboard does not reach it within MAX_TAB_PRESSES.
 */
async function tabTo(page: Page, target: Locator, step: string): Promise<void> {
  for (let presses = 0; presses < MAX_TAB_PRESSES; presses += 1) {
    const focused = await target.evaluate((element) => element === document.activeElement).catch(() => false);
    if (focused) {
      await expectFocusRing(page, step);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`${step}: Tab never reached the control after ${MAX_TAB_PRESSES} presses`);
}

async function openPage(page: Page, path: string): Promise<void> {
  await serveFixtureIndex(page);
  await page.goto(path, { waitUntil: 'load' });
  await settle(page);
}

test.describe('money path, keyboard only', () => {
  test.describe.configure({ timeout: 60_000 });

  test('contribute: amount, review, confirm and done', async ({ page }) => {
    await openPage(page, '/funders');

    const contribute = page.getByRole('button', { name: 'Contribute', exact: true });
    await expect(contribute).toBeVisible();
    await tabTo(page, contribute, 'Contribute button');
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const amount = dialog.getByLabel('Amount', { exact: true });
    await expect(amount).toBeVisible();
    await tabTo(page, amount, 'contribute amount');
    await page.keyboard.type('100');

    const review = dialog.getByRole('button', { name: 'Review contribution', exact: true });
    await tabTo(page, review, 'contribute review');
    await page.keyboard.press('Enter');

    const confirm = dialog.getByRole('button', { name: 'Confirm in Freighter', exact: true });
    await expect(confirm).toBeEnabled({ timeout: SETTLE_TIMEOUT_MS });
    await tabTo(page, confirm, 'contribute confirm');
    await page.keyboard.press('Enter');

    const done = dialog.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await tabTo(page, done, 'contribute receipt');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
  });

  test('apply: amount, notes and submit', async ({ page }) => {
    await openPage(page, '/recipients?apply=1');

    const amount = page.getByLabel('How much do you need?', { exact: true });
    await expect(amount).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await tabTo(page, amount, 'application amount');
    await page.keyboard.type('50');

    const notes = page.getByLabel('Application notes', { exact: true });
    await tabTo(page, notes, 'application notes');
    await page.keyboard.type('Materials for the first phase of the work.');

    const submit = page.getByRole('button', { name: 'Submit application', exact: true });
    await expect(submit).toBeEnabled();
    await tabTo(page, submit, 'application submit');
    await page.keyboard.press('Enter');

    const applyAgain = page.getByRole('button', { name: 'Apply to another', exact: true });
    await expect(applyAgain).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await tabTo(page, applyAgain, 'application receipt');
  });

  test('release: open the tranche, sign and release, done', async ({ page }) => {
    await openPage(page, '/recipients');

    const releaseTranche = page.getByRole('button', { name: 'Release tranche', exact: true }).first();
    await expect(releaseTranche).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await tabTo(page, releaseTranche, 'release tranche');
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const signAndRelease = dialog.getByRole('button', { name: 'Sign and release', exact: true });
    await expect(signAndRelease).toBeEnabled();
    await tabTo(page, signAndRelease, 'release sign');
    await page.keyboard.press('Enter');

    const done = dialog.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });
    await tabTo(page, done, 'release receipt');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
  });
});

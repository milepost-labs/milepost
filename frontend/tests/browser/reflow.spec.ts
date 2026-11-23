/**
 * Reflow check: every route, at 320 CSS px, must not scroll sideways.
 *
 * WCAG 1.4.10 asks that content reflows at 400% zoom on a 1280 px screen,
 * which is 320 CSS px. Content may scroll inside its own container (a wide
 * table, for example) but the page itself may not. Runs against two builds:
 * fixture mode (signed in) and the same app with no fixtures (signed out).
 *
 * Run: npm run test:browser --prefix frontend
 */

import { test, expect } from '@playwright/test';
import { PAGE_PATHS, serveFixtureIndex, settle } from './support';

const REFLOW_WIDTH = 320;

test.describe(`no horizontal page scroll at ${REFLOW_WIDTH}px`, () => {
  for (const pagePath of PAGE_PATHS) {
    test(pagePath, async ({ page }) => {
      await serveFixtureIndex(page);
      await page.goto(pagePath, { waitUntil: 'load' });
      await settle(page);
      await page.evaluate(() => document.fonts.ready);

      const measured = await page.evaluate((limit: number) => {
        const offenders: string[] = [];
        for (const element of Array.from(document.body.querySelectorAll('*'))) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.right <= limit) continue;

          // Anything inside its own scrolling container scrolls that container,
          // not the page, so it is not a page-level failure.
          let inScrollContainer = false;
          for (let node = element.parentElement; node; node = node.parentElement) {
            const overflow = getComputedStyle(node).overflowX;
            if (overflow === 'auto' || overflow === 'scroll') {
              inScrollContainer = true;
              break;
            }
          }
          if (inScrollContainer) continue;

          const classes = element.getAttribute('class')?.trim().split(/\s+/).join('.') ?? '';
          offenders.push(`${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''} (right ${Math.round(box.right)}px)`);
          if (offenders.length === 5) break;
        }
        return { scrollWidth: document.documentElement.scrollWidth, offenders };
      }, REFLOW_WIDTH);

      const problems =
        measured.scrollWidth > REFLOW_WIDTH
          ? [
              `${pagePath}: page is ${measured.scrollWidth}px wide at ${REFLOW_WIDTH}px. ` +
                `Wider elements: ${measured.offenders.join('; ') || 'none found outside scroll containers'}`,
            ]
          : [];

      expect(problems).toEqual([]);
    });
  }
});

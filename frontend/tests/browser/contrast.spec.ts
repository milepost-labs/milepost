/**
 * Colour contrast in a real browser, on every route, in light and dark.
 *
 * The jsdom accessibility suite (src/test/accessibility.test.tsx) cannot compute
 * colours from the stylesheets, so it never checks contrast. This runs axe-core's
 * `color-contrast` rule in Chromium against the signed-in fixture build, so the
 * stylesheets, tokens and theme are the ones a visitor gets.
 *
 * Fix a failure in src/styles/tokens.css, not page by page. A failure that
 * genuinely cannot be fixed goes in CONTRAST_EXCEPTIONS below, with a reason.
 *
 * axe is served from the app's own origin rather than injected inline, because
 * the production Content-Security-Policy (script-src 'self') blocks inline scripts.
 *
 * Run: npm run test:browser --prefix frontend
 */

import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { PAGE_PATHS, serveFixtureIndex, settle } from './support';

type Theme = 'light' | 'dark';

const THEMES: Theme[] = ['light', 'dark'];
const THEME_STORAGE_KEY = 'milepost-theme';
const AXE_PATH = '/__axe-core.js';
const AXE_FILE = fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url));

interface ContrastException {
  /** Restrict to one route path, or omit to apply to every route. */
  route?: string;
  /** Restrict to elements whose CSS selector path contains this text, or omit. */
  target?: string;
  /** Why this failure is allowed. Never leave this out. */
  reason: string;
}

/**
 * Documented exceptions. Empty: any colour pair that fails 4.5:1 is fixed in
 * tokens.css. The last test in this file enforces that every entry has a reason.
 */
const CONTRAST_EXCEPTIONS: ContrastException[] = [];

interface ContrastFinding {
  target: string;
  help: string;
  html: string;
}

/** Serves the vendored axe-core from the app's origin, so the CSP allows it. */
async function serveAxe(page: Page): Promise<void> {
  await page.route(`**${AXE_PATH}`, (route) =>
    route.fulfill({ path: AXE_FILE, contentType: 'application/javascript' }),
  );
}

/** Runs only the `color-contrast` rule on the current page. */
async function contrastFindings(page: Page): Promise<ContrastFinding[]> {
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Document,
            options: object,
          ) => Promise<{
            violations: Array<{
              help: string;
              nodes: Array<{ target: string[]; html: string }>;
            }>;
          }>;
        };
      }
    ).axe;
    const results = await axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
    return results.violations.flatMap((violation) =>
      violation.nodes.map((node) => ({
        target: node.target.join(' '),
        help: violation.help,
        html: node.html.slice(0, 160),
      })),
    );
  });
}

function isExcepted(route: string, finding: ContrastFinding): boolean {
  return CONTRAST_EXCEPTIONS.some(
    (exception) =>
      (!exception.route || exception.route === route) &&
      (!exception.target || finding.target.includes(exception.target)),
  );
}

async function openInTheme(page: Page, pagePath: string, theme: Theme): Promise<void> {
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => window.localStorage.setItem(key, value),
    { key: THEME_STORAGE_KEY, value: theme },
  );
  await serveFixtureIndex(page);
  await serveAxe(page);
  await page.goto(pagePath, { waitUntil: 'load' });
  await settle(page);
  await page.waitForFunction(
    (expected: string) => document.documentElement.getAttribute('data-theme') === expected,
    theme,
  );
}

test.describe('colour contrast, every page', () => {
  for (const theme of THEMES) {
    test.describe(`${theme} theme`, () => {
      for (const pagePath of PAGE_PATHS) {
        test(pagePath, async ({ page }) => {
          await openInTheme(page, pagePath, theme);
          await page.addScriptTag({ url: new URL(AXE_PATH, page.url()).href });

          const problems = (await contrastFindings(page))
            .filter((finding) => !isExcepted(pagePath, finding))
            .map((finding) => `${pagePath} (${theme}): ${finding.help} at ${finding.target}: ${finding.html}`);

          expect(problems).toEqual([]);
        });
      }
    });
  }
});

// Proves the check can fail. A pale grey on white, added to a real page, must be
// reported, or a passing run means nothing.
test('a low-contrast element is reported', async ({ page }) => {
  await openInTheme(page, '/directory', 'light');
  await page.addScriptTag({ url: new URL(AXE_PATH, page.url()).href });
  await page.evaluate(() => {
    const probe = document.createElement('p');
    probe.id = 'contrast-probe';
    probe.textContent = 'low contrast probe';
    probe.style.color = '#eeeeee';
    probe.style.background = '#ffffff';
    document.body.append(probe);
  });

  const findings = await contrastFindings(page);
  expect(findings.some((finding) => finding.target.includes('contrast-probe'))).toBe(true);
});

test('every contrast exception has a reason', () => {
  for (const exception of CONTRAST_EXCEPTIONS) {
    expect(exception.reason.trim().length, `${exception.target ?? 'an exception'} needs a reason`).toBeGreaterThan(10);
  }
});

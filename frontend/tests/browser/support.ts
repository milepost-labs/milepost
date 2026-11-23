/**
 * Helpers shared by the browser checks in this folder (smoke.spec.ts and
 * reflow.spec.ts). Both run against a production build served with the headers
 * from vercel.json by scripts/serve-dist.mjs, so the Content-Security-Policy is
 * the one a visitor gets.
 */

import type { Page, Route } from '@playwright/test';
import { APP_ROUTES } from '../../src/routes';
import { FIXTURE_META, FIXTURE_PROGRAMMES } from '../fixtures/indexer-data';

/**
 * Every page a visitor can open: the landing page, which is not in APP_ROUTES,
 * then each route in APP_ROUTES.
 */
export const PAGE_PATHS: string[] = ['/', ...APP_ROUTES.map((route) => route.path)];

/**
 * The browser checks build with VITE_INDEXER_URL=/index, so the app reads the
 * index from its own origin. The production CSP only allows the real index
 * host, and a same-origin path is what 'self' permits.
 */
const INDEXER_PATH_PREFIX = '/index/';

/**
 * Answers the app's index reads from the fixtures, so a run never depends on
 * the network. Anything other than meta.json and programmes.json gets an empty
 * list, as the screenshot stub does.
 */
export async function serveFixtureIndex(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith(INDEXER_PATH_PREFIX),
    (route: Route) => {
      const file = new URL(route.request().url()).pathname.slice(INDEXER_PATH_PREFIX.length);
      const body =
        file === 'meta.json' ? FIXTURE_META : file === 'programmes.json' ? FIXTURE_PROGRAMMES : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  );
}

const CSP_LOG = '__cspViolations';

/**
 * Records every Content-Security-Policy violation on each page load. Must run
 * before navigation, so it is installed as an init script.
 */
export async function recordCspViolations(page: Page): Promise<void> {
  await page.addInitScript((logName: string) => {
    const log: string[] = [];
    Object.defineProperty(window, logName, { value: log });
    document.addEventListener('securitypolicyviolation', (event) => {
      log.push(`${event.violatedDirective} blocked ${event.blockedURI || '(inline)'}`);
    });
  }, CSP_LOG);
}

/** The violations recorded on the current page, as "<directive> blocked <uri>". */
export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(
    (logName: string) =>
      (window as unknown as Record<string, string[] | undefined>)[logName] ?? [],
    CSP_LOG,
  );
}

/**
 * Console messages that are expected in a fixture build. Each entry needs a
 * reason in the comment above it. Keep this list empty unless a message is
 * outside the app's control.
 */
export const ALLOWED_CONSOLE_ERRORS: RegExp[] = [];

/**
 * Starts collecting uncaught errors and console errors for `label`. Returns the
 * list that the listeners fill, so the caller reads it after the page settles.
 */
export function collectProblems(page: Page, label: string): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => {
    problems.push(`${label}: uncaught error: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (ALLOWED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) return;
    problems.push(`${label}: console error: ${text}`);
  });
  return problems;
}

/**
 * Waits for the page to go quiet. Some pages poll, so network idle may never
 * arrive. That is not a failure, so a timeout here is ignored.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

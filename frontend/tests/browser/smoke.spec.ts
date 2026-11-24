/**
 * Smoke test for the production build, served with the headers from vercel.json.
 *
 * Opens every route in src/routes.ts and fails on an uncaught error, a console
 * error that is not allowed, a blank page, or a Content-Security-Policy
 * violation. The build is fixture mode (VITE_FIXTURES=1), so the wallet is
 * connected and the index is answered from the fixtures.
 *
 * Run: npm run test:browser --prefix frontend
 */

import { test, expect, type Route } from '@playwright/test';
import { APP_ROUTES } from '../../src/routes';
import {
  PAGE_PATHS,
  collectProblems,
  cspViolations,
  recordCspViolations,
  serveFixtureIndex,
  settle,
} from './support';

const BLOCKED_HOST = 'blocked.example.test';

test.describe('every page, with the real headers', () => {
  for (const pagePath of PAGE_PATHS) {
    test(`${pagePath} loads with no error and no CSP violation`, async ({ page }) => {
      await recordCspViolations(page);
      await serveFixtureIndex(page);
      const problems = collectProblems(page, pagePath);

      await page.goto(pagePath, { waitUntil: 'load' });
      await settle(page);

      const rendered = await page.locator('#root > *').count();
      if (rendered === 0) problems.push(`${pagePath}: nothing rendered inside #root`);

      for (const violation of await cspViolations(page)) {
        problems.push(`${pagePath}: CSP blocked ${violation}`);
      }

      expect(problems).toEqual([]);
    });
  }
});

// Proves the check above can fail. A page that loads a host the CSP does not
// allow must be reported, with the route named.
test('a request the CSP blocks is reported against the route', async ({ page }) => {
  const routePath = APP_ROUTES[0].path;
  await recordCspViolations(page);
  await serveFixtureIndex(page);

  await page.route(
    (url) => url.pathname === routePath,
    async (route: Route) => {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers['content-length'];
      const html = (await response.text()).replace(
        '</body>',
        `<img alt="" src="https://${BLOCKED_HOST}/probe.png"></body>`,
      );
      await route.fulfill({ status: response.status(), headers, body: html });
    },
  );

  const problems = collectProblems(page, routePath);
  await page.goto(routePath, { waitUntil: 'load' });
  await settle(page);

  const blocked = (await cspViolations(page)).filter((violation) => violation.includes(BLOCKED_HOST));
  for (const violation of blocked) problems.push(`${routePath}: CSP blocked ${violation}`);

  expect(blocked.length).toBeGreaterThan(0);
  expect(problems.some((problem) => problem.includes(routePath) && problem.includes(BLOCKED_HOST))).toBe(true);
});

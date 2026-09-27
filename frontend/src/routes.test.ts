import { describe, it, expect } from 'vitest';
import { APP_ROUTES } from './routes';
import { ROLES, ROLE_ENTRIES } from './pages/homeContent';

describe('APP_ROUTES', () => {
  it('has no duplicate paths', () => {
    const paths = APP_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('every path is absolute and every route has a label', () => {
    for (const route of APP_ROUTES) {
      expect(route.path.startsWith('/')).toBe(true);
      expect(route.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('landing roles section', () => {
  it('reaches every app route', () => {
    const linked = new Set(ROLES.flatMap((role) => role.links.map((link) => link.path)));
    const missing = APP_ROUTES.map((route) => route.path).filter((path) => !linked.has(path));
    expect(missing).toEqual([]);
  });

  it('only links to routes the app serves', () => {
    const served = new Set(APP_ROUTES.map((route) => route.path));
    for (const role of ROLES) {
      for (const link of role.links) expect(served.has(link.path)).toBe(true);
    }
  });
});

describe('landing role entry cards', () => {
  it('sends each role to the route the app serves', () => {
    const served = new Set(APP_ROUTES.map((route) => route.path));
    for (const entry of ROLE_ENTRIES) expect(served.has(entry.path)).toBe(true);
  });

  it('offers the four entry points in the design order', () => {
    expect(ROLE_ENTRIES.map((entry) => entry.path)).toEqual([
      '/funders',
      '/recipients',
      '/verifiers',
      '/admin',
    ]);
  });
});

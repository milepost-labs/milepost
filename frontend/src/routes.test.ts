import { describe, it, expect } from 'vitest';
import { APP_ROUTES, NAV_SECTIONS, SECTION_PAGES, getSectionForPath, getSectionPageForPath } from './routes';
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

  it('every route has a title', () => {
    for (const route of APP_ROUTES) {
      expect(route.title).toBeTruthy();
      expect(typeof route.title).toBe('string');
    }
  });

  it('every route belongs to exactly one section, matching getSectionForPath', () => {
    const validSections = new Set<string>(['programmes', 'fund', 'get-funded', 'verify', 'admin']);
    for (const route of APP_ROUTES) {
      expect(validSections.has(route.section)).toBe(true);
      expect(getSectionForPath(route.path)).toBe(route.section);
    }
  });
});

describe('SECTION_PAGES', () => {
  it('only lists routes the app serves, each under its own section', () => {
    const served = new Set(APP_ROUTES.map((route) => route.path));
    for (const section of NAV_SECTIONS) {
      for (const page of SECTION_PAGES[section.key]) {
        expect(served.has(page.path)).toBe(true);
        expect(getSectionForPath(page.path)).toBe(section.key);
      }
    }
  });

  it("opens each section on one of that section's own pages", () => {
    for (const section of NAV_SECTIONS) {
      expect(SECTION_PAGES[section.key].map((page) => page.path)).toContain(section.path);
    }
  });

  it('finds the page a path sits under', () => {
    expect(getSectionPageForPath('/funders/receipt')?.label).toBe('Receipt lookup');
    expect(getSectionPageForPath('/recipients/standing')?.label).toBe('My awards');
    expect(getSectionPageForPath('/programme/CABC')?.label).toBe('Directory');
    expect(getSectionPageForPath('/admin/standing')?.label).toBe('Standing');
    expect(getSectionPageForPath('/')).toBeNull();
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

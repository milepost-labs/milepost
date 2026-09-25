import { describe, it, expect } from 'vitest';
import { APP_ROUTES } from './routes';

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

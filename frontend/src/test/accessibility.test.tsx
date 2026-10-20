import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import axe from 'axe-core';
import type * as Axe from 'axe-core';
import App from '../App';
import { APP_ROUTES } from '../routes';

/**
 * Issue #479 — automated accessibility checks on every route.
 *
 * Each route in `APP_ROUTES` is rendered in jsdom, in both themes, and run
 * through axe. A serious or critical violation fails the suite (and therefore
 * CI). Contract clients, the wallet and the index are mocked, so nothing here
 * touches the network.
 *
 * How to run it locally:
 *
 *     cd frontend
 *     npm run test:a11y
 *
 * Exceptions live in `ACCESSIBILITY_EXCEPTIONS` below. Every entry needs a
 * `reason`; the last test in this file enforces that, so a rule cannot be
 * silenced without saying why. Prefer fixing the page.
 */

type AxeViolation = Axe.Result;

interface AccessibilityException {
  /** axe rule id, e.g. `color-contrast`. */
  rule: string;
  /** Restrict to one route, or omit to apply to every route. */
  route?: string;
  /** Why this violation is allowed. Never leave this out. */
  reason: string;
}

/**
 * Documented exceptions, empty at present: every route passes on its own.
 *
 * Add one only for a violation that is genuinely unavoidable in jsdom and
 * cannot be fixed on the page. A `reason` is mandatory and reviewable.
 */
const ACCESSIBILITY_EXCEPTIONS: AccessibilityException[] = [];

// The index is mocked: its functions come from `../lib/indexer`, and no page
// may reach the real network.
const INDEX_META = vi.hoisted(() => ({
  network: 'testnet',
  registry: 'CCBQHBNIG5FIJEM6SQZQGTQRO3XXHV2BGVGGUY5JXXZ3Y55ZJSV3HMVF',
  fromLedger: 4_697_201,
  indexedToLedger: 4_698_280,
  indexedAt: new Date().toISOString(),
  complete: true,
  gap: false,
  unhandledEvents: {},
}));

// Contract reads never resolve: every screen stays in its loading state, which
// is a state a user can land on, and no real client is ever constructed.
const SOROBAN = vi.hoisted(() => {
  const pending = () => new Promise<never>(() => {});
  const client = new Proxy(
    {},
    {
      get: () => pending,
    },
  );
  return {
    state: {
      registry: client,
      attest: client,
      record: client,
      policy: client,
      programmeAt: () => client,
      demoProgramme: client,
      rpcUrl: 'https://soroban-testnet.stellar.org',
    },
  };
});

const WALLET = vi.hoisted(() => ({ address: null as string | null }));

vi.mock('../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/indexer')>()),
  fetchMeta: async () => INDEX_META,
  fetchProgrammes: async () => [],
  fetchAwards: async () => [],
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => SOROBAN.state,
  useOptionalSoroban: () => SOROBAN.state,
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: WALLET.address,
    status: WALLET.address ? 'connected' : 'disconnected',
    network: 'TESTNET',
    networkError: null,
    expectedNetwork: 'Testnet',
    connect: () => Promise.resolve(),
    disconnect: () => {},
    recheckNetwork: () => Promise.resolve(),
    signTransaction: () => Promise.resolve({ signedTxXdr: '', signerAddress: '' }),
  }),
}));

// The providers are replaced with pass-throughs so the real contract clients
// are never built; the hooks above supply the mocked state instead.
vi.mock('../context/SorobanContext', () => ({
  SorobanProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('../context/WalletContext', () => ({
  WalletProvider: ({ children }: { children?: ReactNode }) => children,
}));

const ROUTES = [...new Set(APP_ROUTES.map((route) => route.path))];
const THEMES: Array<'light' | 'dark'> = ['light', 'dark'];

function isExcepted(route: string, rule: string): boolean {
  return ACCESSIBILITY_EXCEPTIONS.some(
    (exception) => exception.rule === rule && (!exception.route || exception.route === route),
  );
}

function describeViolations(route: string, theme: string, violations: AxeViolation[]): string {
  return [
    `${violations.length} serious/critical accessibility violation(s) on ${route} (${theme} theme):`,
    ...violations.map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `  - ${violation.id} [${violation.impact}]: ${violation.help} (${targets})`;
    }),
  ].join('\n');
}

describe('accessibility', () => {
  beforeEach(() => {
    WALLET.address = null;
    // Nothing may touch the network; the indexer functions above are mocked,
    // and anything that still calls `fetch` fails loudly here.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('The accessibility test must not reach the network.');
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  describe.each(THEMES)('%s theme', (theme) => {
    it.each(ROUTES)('has no serious or critical violations on %s', async (route) => {
      window.localStorage.setItem('milepost-theme', theme);
      window.history.pushState({}, '', route);

      const view = render(<App />);

      await waitFor(() => {
        expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
      });
      // Wait for the lazy route chunk to replace the router fallback. Every
      // route renders a level-one heading once it has loaded.
      await waitFor(() => {
        expect(document.querySelector('main h1')).toBeTruthy();
      }, { timeout: 5000 });

      const results = await axe.run(view.container);
      const violations = results.violations.filter(
        (violation) =>
          (violation.impact === 'serious' || violation.impact === 'critical') &&
          !isExcepted(route, violation.id),
      );

      expect(violations, describeViolations(route, theme, violations)).toEqual([]);
    });
  });

  it('requires a reason for every documented exception', () => {
    for (const exception of ACCESSIBILITY_EXCEPTIONS) {
      expect(exception.reason.trim().length, `${exception.rule} needs a reason`).toBeGreaterThan(10);
    }
  });
});

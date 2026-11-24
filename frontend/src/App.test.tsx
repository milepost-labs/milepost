import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Every route below is a lazy chunk. On a cold run (CI, coverage) the first
// import can take longer than findBy's 1s default.
const ROUTE_LOAD = { timeout: 4_000 };

const mocks = vi.hoisted(() => ({
  isProgramme: vi.fn(async () => ({ result: false })),
  getConfig: vi.fn(async () => {
    throw new Error('MissingValue');
  }),
}));

vi.mock('./context/WalletContext', () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./context/useWallet', () => ({
  useWallet: () => ({
    address: null,
    status: 'disconnected',
    network: null,
    networkError: null,
    expectedNetwork: 'TESTNET',
    connect: vi.fn(),
    disconnect: vi.fn(),
    recheckNetwork: vi.fn(),
  }),
}));

vi.mock('./context/SorobanContext', () => ({
  SorobanProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./context/useSoroban', () => {
  const soroban = {
    rpcUrl: 'http://localhost',
    registry: {
      is_programme: (...args: unknown[]) => mocks.isProgramme(...(args as [])),
    },
    programmeAt: () => ({
      get_config: (...args: unknown[]) => mocks.getConfig(...(args as [])),
    }),
  };
  return {
    useSoroban: () => soroban,
    useOptionalSoroban: () => soroban,
  };
});

describe('App router edge cases', () => {
  beforeEach(() => {
    mocks.isProgramme.mockClear();
    mocks.getConfig.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });

  it('renders NotFound for an unknown path', async () => {
    window.history.pushState({}, '', '/no-such-route');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: /There’s no milepost here/i }, ROUTE_LOAD)).toBeTruthy();
    expect(screen.getByText('/no-such-route')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to programmes' }).getAttribute('href')).toBe('/directory');
  });

  it('shows Not a programme when programmeId is not a valid programme address', async () => {
    window.history.pushState({}, '', '/programme/not-a-valid-address');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Not a programme' }, ROUTE_LOAD)).toBeTruthy();
    expect(screen.getByText('No Milepost programme at this address')).toBeTruthy();
    expect(mocks.isProgramme).toHaveBeenCalledWith({ addr: 'not-a-valid-address' });
    expect(mocks.getConfig).toHaveBeenCalled();
  });

  it('serves the dev component gallery in development builds', async () => {
    window.history.pushState({}, '', '/dev/ui');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'UI Component Gallery' }, ROUTE_LOAD)).toBeTruthy();
  });

  it('keeps development-only pages out of the production build', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', false);

    const { default: ProdApp } = await import('./App');
    window.history.pushState({}, '', '/dev/ui');
    render(<ProdApp />);

    expect(await screen.findByRole('heading', { level: 1, name: /There’s no milepost here/i }, ROUTE_LOAD)).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'UI Component Gallery' })).toBeNull();
  });
});

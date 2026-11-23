import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import App from '../App';
import { APP_ROUTES } from '../routes';
import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { FIXTURE_ATTESTATIONS } from '../fixtures/attestationFixtures';

/**
 * #580 — on mainnet no screen may render sample data. Mount every route with
 * samples off and assert that no SampleTag and no fixture programme id or
 * name reaches the page.
 */
vi.mock('../lib/samples', () => ({ samplesEnabled: () => false }));

vi.mock('../config/network', () => ({
  NETWORK: {
    name: 'mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    rpcUrl: 'https://rpc.example.org',
    indexerUrl: 'https://index.example.org/v1',
    contracts: { registry: 'CREGISTRY', attest: 'CATTEST', record: 'CRECORD', policy: 'CPOLICY' },
    explorer: 'public',
    friendbot: false,
    demoProgrammeId: null,
  },
  explorerFor: () => 'public',
}));

const INDEX_META = vi.hoisted(() => ({
  network: 'mainnet',
  registry: 'CREGISTRY',
  fromLedger: 1,
  indexedToLedger: 2,
  indexedAt: new Date().toISOString(),
  complete: true,
  gap: false,
  unhandledEvents: {},
}));

const SOROBAN = vi.hoisted(() => {
  const pending = () => new Promise<never>(() => {});
  const client = new Proxy({}, { get: () => pending });
  return {
    state: {
      registry: client,
      attest: client,
      record: client,
      policy: client,
      programmeAt: () => client,
      demoProgramme: client,
      rpcUrl: 'https://rpc.example.org',
    },
  };
});

const WALLET = vi.hoisted(() => ({ address: 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA' as string | null }));

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
    network: 'PUBLIC',
    networkError: null,
    expectedNetwork: 'Mainnet',
    connect: () => Promise.resolve(),
    disconnect: () => {},
    recheckNetwork: () => Promise.resolve(),
    signTransaction: () => Promise.resolve({ signedTxXdr: '', signerAddress: '' }),
  }),
}));

vi.mock('../context/SorobanContext', () => ({
  SorobanProvider: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('../context/WalletContext', () => ({
  WalletProvider: ({ children }: { children?: ReactNode }) => children,
}));

const ROUTES = [...new Set(APP_ROUTES.map((route) => route.path))];

describe('no sample data on mainnet', () => {
  beforeEach(() => {
    WALLET.address = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('The mainnet samples test must not reach the network.');
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  async function renderAt(route: string) {
    window.history.pushState({}, '', route);
    const view = render(<App />);
    await waitFor(() => {
      expect(document.querySelector('main h1')).toBeTruthy();
    }, { timeout: 5000 });
    return view;
  }

  it('does not show samples even when the directory query asks for them', async () => {
    const view = await renderAt('/directory?samples=1');
    expect(view.container.querySelectorAll('.ui-sample-tag')).toHaveLength(0);
    expect(screen.queryByText(FIXTURE_PROGRAMMES[0].name!)).toBeNull();
  });

  it('offers no sample programmes in the apply form list', async () => {
    const view = await renderAt('/recipients?apply=1');
    expect(view.container.querySelectorAll('.ui-sample-tag')).toHaveLength(0);
    expect(screen.queryByText(FIXTURE_PROGRAMMES[0].name!)).toBeNull();
  });

  it('shows the not-a-programme state for a sample address', async () => {
    const view = await renderAt(`/programme/${FIXTURE_PROGRAMMES[0].id}`);
    expect(screen.getByRole('heading', { name: 'Not a programme on this network' })).toBeTruthy();
    expect(view.container.querySelectorAll('.ui-sample-tag')).toHaveLength(0);
  });

  it.each(ROUTES)('renders no sample tag or fixture programme on %s', async (route) => {
    window.history.pushState({}, '', route);
    const view = render(<App />);

    await waitFor(() => {
      expect(document.querySelector('main h1')).toBeTruthy();
    }, { timeout: 5000 });

    const text = view.container.textContent ?? '';
    expect(view.container.querySelectorAll('.ui-sample-tag')).toHaveLength(0);
    for (const programme of FIXTURE_PROGRAMMES) {
      expect(text).not.toContain(programme.id);
      if (programme.name) expect(text).not.toContain(programme.name);
    }
    for (const attestation of FIXTURE_ATTESTATIONS) {
      expect(text).not.toContain(attestation.uid);
    }
  });
});

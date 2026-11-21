import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
  samplesEnabled: () => false,
  explorerFor: () => 'public',
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ rpcUrl: 'https://rpc.example.org' }),
}));

vi.mock('../components/admin/ProtocolConfigCard', () => ({ ProtocolConfigCard: () => null }));

import { AboutDeployment } from './AboutDeployment';
import { LiveIndex } from '../components/landing/LiveIndex';

describe('#582 — landing and About name the configured network', () => {
  it('shows the mainnet name, passphrase and configured contract ids', () => {
    render(
      <MemoryRouter>
        <AboutDeployment />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Stellar mainnet, pre-audit/)).toBeTruthy();
    expect(screen.getByText('Public Global Stellar Network ; September 2015')).toBeTruthy();
    for (const id of ['CREGISTRY', 'CATTEST', 'CRECORD', 'CPOLICY']) {
      expect(screen.getByTitle(id)).toBeTruthy();
    }
    expect(screen.queryByText('Testnet pilot')).toBeNull();
  });

  it('says "Live on mainnet" on the landing page', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<LiveIndex />);
    expect(screen.getByText('Live on mainnet')).toBeTruthy();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';
import { WalletContext, type WalletState } from '../../context/walletStore';

vi.mock('../../config/network', () => ({
  NETWORK: {
    name: 'mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    rpcUrl: 'https://rpc.example.org',
    indexerUrl: 'https://index.example.org/v1',
    contracts: { registry: 'CREG', attest: 'CATT', record: 'CREC', policy: 'CPOL' },
    explorer: 'public',
    friendbot: false,
    demoProgrammeId: null,
  },
  samplesEnabled: () => false,
  explorerFor: () => 'public',
}));

import { Navbar } from './Navbar';

const ADDRESS = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

function wallet(overrides: Partial<WalletState> = {}): WalletState {
  return {
    status: 'disconnected',
    address: null,
    network: null,
    networkError: null,
    expectedNetwork: 'Mainnet',
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    recheckNetwork: vi.fn(async () => {}),
    signTransaction: vi.fn(),
    ...overrides,
  } as WalletState;
}

function renderNavbar(path: string, state: Partial<WalletState> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <WalletContext.Provider value={wallet(state)}>
          <Navbar />
        </WalletContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('the header on mainnet', () => {
  it('names the configured network without the testnet dot', () => {
    const { container } = renderNavbar('/');
    expect(screen.getByText('Mainnet')).toBeTruthy();
    expect(container.querySelector('.testnet-tag--mainnet')).toBeTruthy();
    expect(container.querySelector('.testnet-tag__dot')).toBeNull();
  });

  it('still shows a wrong wallet network in red', () => {
    const { container } = renderNavbar('/directory', {
      status: 'wrong-network',
      address: ADDRESS,
      network: 'TESTNET',
      networkError: 'Freighter is on TESTNET, but these contracts are deployed on Mainnet.',
    });
    expect(screen.getByText('Freighter: TESTNET')).toBeTruthy();
    expect(container.querySelector('.testnet-tag--wrong')).toBeTruthy();
    expect(container.querySelector('.testnet-tag__dot')).toBeTruthy();
  });
});

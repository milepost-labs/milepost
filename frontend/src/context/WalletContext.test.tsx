import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import * as freighter from '@stellar/freighter-api';
import { NETWORK } from '../config/network';
import { WalletProvider } from './WalletContext';
import { useWallet } from './useWallet';

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

const TEST_ADDRESS = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
const EXPECTED_PASSPHRASE = NETWORK.passphrase;

function Consumer() {
  const wallet = useWallet();
  const [signOutput, setSignOutput] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      await wallet.connect();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSign = async () => {
    try {
      const res = await wallet.signTransaction('AAAA_XDR_DATA');
      setSignOutput(res.signedTxXdr);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRecheck = async () => {
    try {
      await wallet.recheckNetwork();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <span role="status" aria-label="status">
        {wallet.status}
      </span>
      <span role="note" aria-label="address">
        {wallet.address ?? 'null'}
      </span>
      <span role="note" aria-label="network">
        {wallet.network ?? 'null'}
      </span>
      <span role="alert" aria-label="network-error">
        {wallet.networkError ?? 'null'}
      </span>
      <span role="note" aria-label="expected-network">
        {wallet.expectedNetwork}
      </span>
      {signOutput && (
        <span role="note" aria-label="sign-output">
          {signOutput}
        </span>
      )}
      {errorMsg && (
        <span role="alert" aria-label="error-message">
          {errorMsg}
        </span>
      )}
      <button type="button" onClick={handleConnect}>
        Connect
      </button>
      <button type="button" onClick={() => wallet.disconnect()}>
        Disconnect
      </button>
      <button type="button" onClick={handleRecheck}>
        Recheck Network
      </button>
      <button type="button" onClick={handleSign}>
        Sign Transaction
      </button>
    </div>
  );
}

function renderWallet() {
  return render(
    <WalletProvider>
      <Consumer />
    </WalletProvider>,
  );
}

describe('WalletContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path setup
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: true });
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: TEST_ADDRESS });
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: 'TESTNET',
      networkPassphrase: EXPECTED_PASSPHRASE,
    });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: TEST_ADDRESS });
    vi.mocked(freighter.signTransaction).mockResolvedValue({
      signedTxXdr: 'SIGNED_AAAA_XDR',
      signerAddress: TEST_ADDRESS,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets status to unavailable when Freighter is not installed or isConnected is false', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: false });

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('unavailable');
    });
    expect(screen.getByRole('note', { name: 'address' }).textContent).toBe('null');
  });

  it('sets status to unavailable when Freighter interrogation throws an exception', async () => {
    vi.mocked(freighter.isConnected).mockRejectedValue(new Error('Extension context invalidated'));

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('unavailable');
    });
  });

  it('sets status to disconnected when Freighter is installed but not allowed for this app', async () => {
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: false });

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    });
    expect(screen.getByRole('note', { name: 'address' }).textContent).toBe('null');
  });

  it('reconnects on load when Freighter is allowed and on expected network', async () => {
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });
    expect(screen.getByRole('note', { name: 'address' }).textContent).toBe(TEST_ADDRESS);
    expect(screen.getByRole('note', { name: 'network' }).textContent).toBe('TESTNET');
    expect(screen.getByRole('alert', { name: 'network-error' }).textContent).toBe('null');
  });

  it('sets status to disconnected when getAddress returns empty on load', async () => {
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: '' });

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    });
    expect(screen.getByRole('note', { name: 'address' }).textContent).toBe('null');
  });

  it('connects when user clicks Connect and grants access', async () => {
    // Start disconnected
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: false });
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    });

    // User clicks connect
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });
    expect(screen.getByRole('note', { name: 'address' }).textContent).toBe(TEST_ADDRESS);
  });

  it('handles a declined connection attempt when user refuses Freighter prompt', async () => {
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: false });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ error: 'User declined access' });

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: 'error-message' }).textContent).toBe('User declined access');
    });
  });

  it('handles declined connection with structured object error message', async () => {
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: false });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ error: { message: 'Rejected by user' } } as any);

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: 'error-message' }).textContent).toBe('Rejected by user');
    });
  });

  it('handles empty error object in unwrap with fallback message', async () => {
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: false });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ error: {} } as any);

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: 'error-message' }).textContent).toBe('Freighter request failed');
    });
  });

  it('flags wrong-network and shows explanation message when Freighter is on another network', async () => {
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('wrong-network');
    });
    expect(screen.getByRole('alert', { name: 'network-error' }).textContent).toContain('Freighter is on PUBLIC');
    expect(screen.getByRole('alert', { name: 'network-error' }).textContent).toContain('Switch network in Freighter to continue');
  });

  it('flags wrong-network with unknown network fallback if network name is omitted', async () => {
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: undefined,
      networkPassphrase: 'Wrong Network Passphrase',
    });

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('wrong-network');
    });
    expect(screen.getByRole('alert', { name: 'network-error' }).textContent).toContain('an unknown network');
  });

  it('disconnects and clears address when user clicks Disconnect', async () => {
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    expect(screen.getByRole('note', { name: 'address' }).textContent).toBe('null');
  });

  it('passes through transaction signing when connected and on correct network', async () => {
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign Transaction' }));

    await waitFor(() => {
      expect(screen.getByRole('note', { name: 'sign-output' }).textContent).toBe('SIGNED_AAAA_XDR');
    });
    expect(freighter.signTransaction).toHaveBeenCalledWith('AAAA_XDR_DATA', {
      networkPassphrase: EXPECTED_PASSPHRASE,
      address: TEST_ADDRESS,
    });
  });

  it('refuses signing when no wallet is connected', async () => {
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: false });
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('disconnected');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign Transaction' }));

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: 'error-message' }).textContent).toBe('Connect a wallet before signing.');
    });
  });

  it('refuses signing when on the wrong network at sign time', async () => {
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });

    // Change network right before signing
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign Transaction' }));

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: 'error-message' }).textContent).toContain(
        'Switch network in Freighter to continue.',
      );
    });
  });

  it('throws error when freighter.signTransaction returns an error', async () => {
    vi.mocked(freighter.signTransaction).mockResolvedValue({
      error: 'Hardware wallet rejected transaction',
    } as any);

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign Transaction' }));

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: 'error-message' }).textContent).toBe(
        'Hardware wallet rejected transaction',
      );
    });
  });

  it('rechecks network and transitions from wrong-network to connected after user switches network', async () => {
    // Start on wrong network
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: 'Wrong Passphrase',
    });

    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('wrong-network');
    });

    // User switches network in Freighter
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: 'TESTNET',
      networkPassphrase: EXPECTED_PASSPHRASE,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Recheck Network' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
      expect(screen.getByRole('alert', { name: 'network-error' }).textContent).toBe('null');
    });
  });

  it('rechecks network transitions to wrong-network when switching away from expected network', async () => {
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });

    // Switch to wrong network
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: 'Wrong Passphrase',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Recheck Network' }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('wrong-network');
    });
  });

  it('rechecks network keeps previous status when network read throws', async () => {
    renderWallet();

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
    });

    vi.mocked(freighter.getNetwork).mockRejectedValue(new Error('Network error'));

    fireEvent.click(screen.getByRole('button', { name: 'Recheck Network' }));

    // Status stays connected
    expect(screen.getByRole('status', { name: 'status' }).textContent).toBe('connected');
  });
});

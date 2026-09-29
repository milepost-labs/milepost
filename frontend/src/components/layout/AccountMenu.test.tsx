import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';

const mockUseWallet = vi.fn();
vi.mock('../../context/useWallet', () => ({
  useWallet: () => mockUseWallet(),
}));

const mockUseBalances = vi.fn();
vi.mock('../../hooks/useBalances', () => ({
  useBalances: (addr: string) => mockUseBalances(addr),
}));

describe('AccountMenu', () => {
  const address = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseWallet.mockReturnValue({
      disconnect: vi.fn(),
      expectedNetwork: 'testnet',
    });
  });

  it('renders balance when funded', () => {
    mockUseBalances.mockReturnValue({
      xlm: 50_000_000_000n, // 5,000 XLM
      asset: null,
      assetCode: 'XLM',
      isUnfunded: false,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <AccountMenu address={address} />
      </BrowserRouter>
    );

    expect(screen.getByText('5,000.00 XLM')).toBeTruthy();
  });

  it('shows Unavailable when balance read fails', () => {
    mockUseBalances.mockReturnValue({
      xlm: null,
      asset: null,
      assetCode: 'XLM',
      isUnfunded: false,
      loading: false,
      error: new Error('Failed to read balance'),
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <AccountMenu address={address} />
      </BrowserRouter>
    );

    expect(screen.getByText('Unavailable')).toBeTruthy();
  });

  it('shows Friendbot button when account is unfunded on testnet', async () => {
    const refetch = vi.fn();
    mockUseBalances.mockReturnValue({
      xlm: 0n,
      asset: null,
      assetCode: 'XLM',
      isUnfunded: true,
      loading: false,
      error: null,
      refetch,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    render(
      <BrowserRouter>
        <AccountMenu address={address} />
      </BrowserRouter>
    );

    const button = screen.getByRole('button', { name: /Fund with Friendbot/i });
    expect(button).toBeTruthy();

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Account funded with 10,000 testnet XLM!/i)).toBeTruthy();
    });

    expect(refetch).toHaveBeenCalled();
  });
});

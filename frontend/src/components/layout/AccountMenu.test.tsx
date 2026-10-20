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

// Issue #484: Friendbot outcomes and manual refreshes are announced through
// the shared announcer, so the tests assert on what it was told — and that the
// on-screen messages carry no live role that would read them a second time.
const mockAnnounce = vi.hoisted(() => vi.fn());
vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => mockAnnounce,
}));

const FUNDED = 'Account funded with 10,000 testnet XLM!';

describe('AccountMenu', () => {
  const address = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAnnounce.mockClear();
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

  // --- Issue #484: outcomes reach a screen reader, exactly once -------------

  it('announces Friendbot success once, politely, with no live role on screen', async () => {
    mockUseBalances.mockReturnValue({
      xlm: 0n,
      asset: null,
      assetCode: 'XLM',
      isUnfunded: true,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    render(
      <BrowserRouter>
        <AccountMenu address={address} />
      </BrowserRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fund with Friendbot/i }));

    await waitFor(() => expect(mockAnnounce).toHaveBeenCalledWith(FUNDED));
    // Once only, polite (no kind given), and the message itself is visual.
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    expect(mockAnnounce.mock.calls[0][1]).toBeUndefined();
    expect(screen.getByText(FUNDED)).not.toHaveAttribute('role');
  });

  it('announces a Friendbot failure once, as an alert', async () => {
    mockUseBalances.mockReturnValue({
      xlm: 0n,
      asset: null,
      assetCode: 'XLM',
      isUnfunded: true,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Friendbot is unavailable',
    } as unknown as Response);

    render(
      <BrowserRouter>
        <AccountMenu address={address} />
      </BrowserRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Fund with Friendbot/i }));

    await waitFor(() =>
      expect(mockAnnounce).toHaveBeenCalledWith('Friendbot is unavailable', 'alert'),
    );
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Friendbot is unavailable')).not.toHaveAttribute('role');
  });

  it('announces the new balance once after a manual refresh', async () => {
    const refetch = vi.fn();
    mockUseBalances.mockReturnValue({
      xlm: 50_000_000_000n, // 5,000 XLM
      asset: null,
      assetCode: 'XLM',
      isUnfunded: false,
      loading: false,
      error: null,
      refetch,
    });

    render(
      <BrowserRouter>
        <AccountMenu address={address} />
      </BrowserRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Refresh balances/i }));

    await waitFor(() =>
      expect(mockAnnounce).toHaveBeenCalledWith('Balance refreshed: 5,000.00 XLM.'),
    );
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('announces a failed refresh as an alert rather than silently', async () => {
    mockUseBalances.mockReturnValue({
      xlm: null,
      asset: null,
      assetCode: 'XLM',
      isUnfunded: false,
      loading: false,
      error: new Error('Horizon unreachable'),
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <AccountMenu address={address} />
      </BrowserRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Refresh balances/i }));

    await waitFor(() =>
      expect(mockAnnounce).toHaveBeenCalledWith("Couldn't refresh the XLM balance.", 'alert'),
    );
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
  });
});

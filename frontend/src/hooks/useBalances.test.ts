import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBalances } from './useBalances';

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
    status: 'connected',
    expectedNetwork: 'testnet',
  }),
}));

describe('useBalances', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reads XLM balance on successful Horizon response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        balances: [{ asset_type: 'native', balance: '100.5000000' }],
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useBalances('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.xlm).toBe(1_005_000_000n);
    expect(result.current.isUnfunded).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('marks account as unfunded when Horizon returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as unknown as Response);

    const { result } = renderHook(() => useBalances('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isUnfunded).toBe(true);
    expect(result.current.xlm).toBe(0n);
    expect(result.current.error).toBeNull();
  });

  it('sets error and null balance when Horizon request fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useBalances('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.xlm).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});

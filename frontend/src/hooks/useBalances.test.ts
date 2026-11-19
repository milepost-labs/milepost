import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Keypair, xdr } from '@stellar/stellar-sdk';
import { NETWORK } from '../config/network';
import { useBalances } from './useBalances';

const ADDRESS = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

const rpcMock = vi.hoisted(() => ({
  construct: vi.fn(),
  getLedgerEntries: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  class Server {
    constructor(url: string, options?: unknown) {
      rpcMock.construct(url, options);
    }
    getLedgerEntries(...keys: unknown[]) {
      return rpcMock.getLedgerEntries(...keys);
    }
  }
  return { ...actual, rpc: { ...actual.rpc, Server } };
});

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: ADDRESS, status: 'connected', expectedNetwork: 'testnet' }),
}));

/** The ledger entry the RPC returns for an account holding `stroops`. */
function accountEntry(stroops: bigint) {
  const account = new xdr.AccountEntry({
    accountId: Keypair.fromPublicKey(ADDRESS).xdrAccountId(),
    balance: xdr.Int64.fromString(stroops.toString()),
    seqNum: xdr.Int64.fromString('1'),
    numSubEntries: 0,
    inflationDest: null,
    flags: 0,
    homeDomain: '',
    thresholds: new Uint8Array([1, 0, 0, 0]) as never,
    signers: [],
    ext: new xdr.AccountEntryExt(0),
  });
  return { val: xdr.LedgerEntryData.account(account) };
}

describe('useBalances', () => {
  beforeEach(() => {
    rpcMock.construct.mockClear();
    rpcMock.getLedgerEntries.mockReset();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it('reads a funded balance from the account entry on the RPC from the network setting', async () => {
    rpcMock.getLedgerEntries.mockResolvedValue({ entries: [accountEntry(1_005_000_000n)] });

    const { result } = renderHook(() => useBalances(ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.xlm).toBe(1_005_000_000n);
    expect(result.current.isUnfunded).toBe(false);
    expect(result.current.error).toBeNull();
    expect(rpcMock.construct).toHaveBeenCalledWith(NETWORK.rpcUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('shows an account with no entry as unfunded', async () => {
    rpcMock.getLedgerEntries.mockResolvedValue({ entries: [] });

    const { result } = renderHook(() => useBalances(ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isUnfunded).toBe(true);
    expect(result.current.xlm).toBe(0n);
    expect(result.current.error).toBeNull();
  });

  it('shows the error state, not a zero balance, when the read fails', async () => {
    rpcMock.getLedgerEntries.mockRejectedValue(new Error('RPC down'));

    const { result } = renderHook(() => useBalances(ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.xlm).toBeNull();
    expect(result.current.isUnfunded).toBe(false);
    expect(result.current.error?.message).toBe('RPC down');
  });
});

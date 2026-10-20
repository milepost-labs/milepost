import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { lookupLedgerTime } from '../lib/ledgerTime';
import { useLedgerTime } from './useLedgerTime';

/**
 * The hook is the one place a screen reaches the RPC for a ledger close time.
 * It must stay idle without a ledger (samples and unindexed programmes) and
 * pass the ledger through to the resolver otherwise.
 */

vi.mock('../lib/ledgerTime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/ledgerTime')>()),
  lookupLedgerTime: vi.fn(),
}));

const resolveLedgerTime = vi.mocked(lookupLedgerTime);
const RPC_URL = 'https://soroban-testnet.stellar.org';

beforeEach(() => {
  resolveLedgerTime.mockReset();
});

describe('useLedgerTime', () => {
  it('does nothing when there is no ledger to resolve', () => {
    const { result } = renderHook(() => useLedgerTime(null, RPC_URL));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(resolveLedgerTime).not.toHaveBeenCalled();
  });

  it('resolves an exact date for a ledger', async () => {
    resolveLedgerTime.mockResolvedValue({ seconds: 1_772_712_000, estimated: false });

    const { result } = renderHook(() => useLedgerTime(4_811_204, RPC_URL));

    await waitFor(() =>
      expect(result.current.data).toEqual({
        seconds: 1_772_712_000,
        estimated: false,
      }),
    );
    expect(resolveLedgerTime).toHaveBeenCalledWith(expect.anything(), 4_811_204);
  });

  it('resolves the estimate for a different ledger', async () => {
    resolveLedgerTime.mockResolvedValueOnce({
      seconds: 1_772_712_000,
      estimated: false,
    });
    const { result, rerender } = renderHook(
      ({ ledger }: { ledger: number }) => useLedgerTime(ledger, RPC_URL),
      { initialProps: { ledger: 4_811_204 } },
    );

    await waitFor(() => expect(result.current.data?.estimated).toBe(false));

    resolveLedgerTime.mockResolvedValueOnce({
      seconds: 1_700_000_000,
      estimated: true,
    });
    rerender({ ledger: 4_700_000 });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        seconds: 1_700_000_000,
        estimated: true,
      }),
    );
    expect(resolveLedgerTime).toHaveBeenLastCalledWith(expect.anything(), 4_700_000);
  });

  it('surfaces a resolver failure without inventing a date', async () => {
    resolveLedgerTime.mockRejectedValue(new Error('could not resolve'));

    const { result } = renderHook(() => useLedgerTime(4_811_204, RPC_URL));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toBeNull();
  });
});

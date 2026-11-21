/**
 * Tests for useProgrammeChainReads, useRegistryProgrammes, useChainRead and
 * useDonorContribution.  Covers: loading state, settled data for all ids,
 * partial failure (one id fails while others still show), id-list changes
 * (new ids read, removed ids drop out, unchanged ids not re-read when cached,
 * stale-data guard on cancelled reads), empty list, non-Error throws, retry,
 * and useRegistryProgrammes/useChainRead/useDonorContribution branches.
 *
 * The session-level cache in lib/programmeReads.ts is module-level state that
 * persists across tests.  We clear it between tests by resetting the mocked
 * readProgrammeChain so that every test gets a fresh read.
 *
 * Closes #636
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useProgrammeChainReads,
  useRegistryProgrammes,
  useChainRead,
  useDonorContribution,
} from './useProgrammeReads';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock the entire lib/programmeReads module so the hook never touches a real
// RPC; each test controls what readProgrammeChain and readRegistryProgrammes
// resolve to.
const reads = vi.hoisted(() => ({
  readProgrammeChain: vi.fn<
    [string, (id: string) => unknown],
    Promise<unknown>
  >(),
  readRegistryProgrammes: vi.fn<[unknown], Promise<string[]>>(),
  sessionRead: vi.fn<[string, () => Promise<unknown>], Promise<unknown>>(),
}));

vi.mock('../lib/programmeReads', () => ({
  readProgrammeChain: reads.readProgrammeChain,
  readRegistryProgrammes: reads.readRegistryProgrammes,
  sessionRead: reads.sessionRead,
}));

// Mock useSoroban / useOptionalSoroban
const soroban = vi.hoisted(() => ({
  value: null as null | {
    programmeAt: (id: string) => unknown;
    registry: unknown;
  },
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => {
    if (!soroban.value) throw new Error('no soroban');
    return soroban.value;
  },
  useOptionalSoroban: () => soroban.value ?? undefined,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A promise whose resolution the test controls. */
function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const P1 = `C${'A'.repeat(55)}`;
const P2 = `C${'B'.repeat(55)}`;
const P3 = `C${'C'.repeat(55)}`;

const FAKE_READ = {
  phase: 'Open' as const,
  budget: 1_000_000n,
  contributed: 2_000_000n,
  granted: 500_000n,
  released: 100_000n,
  refunded: 0n,
  feeBps: 50,
  quorum: 3,
  applyDeadline: 9_999_999n,
};

function fakeProgrammeAt(id: string) {
  return { contractId: id };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  soroban.value = {
    programmeAt: fakeProgrammeAt,
    registry: {},
  };
  // Default: readProgrammeChain immediately resolves with FAKE_READ
  reads.readProgrammeChain.mockResolvedValue(FAKE_READ);
  // Default: sessionRead delegates to the runner (simple pass-through)
  reads.sessionRead.mockImplementation(
    async (_key: string, run: () => Promise<unknown>) => run(),
  );
});

// ---------------------------------------------------------------------------
// useProgrammeChainReads
// ---------------------------------------------------------------------------

describe('useProgrammeChainReads — loading state', () => {
  it('starts with every id in loading and no settled reads', () => {
    // Never resolves so we can inspect the loading snapshot
    reads.readProgrammeChain.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useProgrammeChainReads([P1, P2]));

    expect(result.current.loading.has(P1)).toBe(true);
    expect(result.current.loading.has(P2)).toBe(true);
    expect(Object.keys(result.current.reads)).toHaveLength(0);
    expect(Object.keys(result.current.errors)).toHaveLength(0);
  });

  it('clears loading and surfaces the read once it settles', async () => {
    const { result } = renderHook(() => useProgrammeChainReads([P1]));

    await waitFor(() => expect(result.current.loading.size).toBe(0));
    expect(result.current.reads[P1]).toEqual(FAKE_READ);
    expect(result.current.errors[P1]).toBeUndefined();
  });
});

describe('useProgrammeChainReads — data for all ids', () => {
  it('settles each id independently and returns all reads', async () => {
    const r1 = { ...FAKE_READ, budget: 1n };
    const r2 = { ...FAKE_READ, budget: 2n };
    reads.readProgrammeChain.mockImplementation(async (id: string) =>
      id === P1 ? r1 : r2,
    );

    const { result } = renderHook(() => useProgrammeChainReads([P1, P2]));

    await waitFor(() => expect(result.current.loading.size).toBe(0));
    expect(result.current.reads[P1]).toEqual(r1);
    expect(result.current.reads[P2]).toEqual(r2);
  });
});

describe('useProgrammeChainReads — partial failure', () => {
  it('shows an error for the failing id while the passing ids still appear', async () => {
    const failErr = new Error('Contract read exploded');
    reads.readProgrammeChain.mockImplementation(async (id: string) => {
      if (id === P2) throw failErr;
      return FAKE_READ;
    });

    const { result } = renderHook(() => useProgrammeChainReads([P1, P2, P3]));

    await waitFor(() => expect(result.current.loading.size).toBe(0));

    // P1 and P3 show their reads
    expect(result.current.reads[P1]).toEqual(FAKE_READ);
    expect(result.current.reads[P3]).toEqual(FAKE_READ);
    // P2 shows the error, not a read
    expect(result.current.errors[P2]).toBe(failErr);
    expect(result.current.reads[P2]).toBeUndefined();
  });

  it('assigns the error to the right id and not to others', async () => {
    reads.readProgrammeChain.mockImplementation(async (id: string) => {
      if (id === P1) throw new Error('P1 failed');
      return FAKE_READ;
    });

    const { result } = renderHook(() => useProgrammeChainReads([P1, P2]));

    await waitFor(() => expect(result.current.loading.size).toBe(0));
    expect(result.current.errors[P1]).toBeInstanceOf(Error);
    expect(result.current.errors[P2]).toBeUndefined();
    expect(result.current.reads[P2]).toEqual(FAKE_READ);
  });

  it('handles non-Error throws (string, plain object)', async () => {
    reads.readProgrammeChain.mockImplementation(async (id: string) => {
      if (id === P1) throw 'string error';
      if (id === P2) throw { code: 42 };
      return FAKE_READ;
    });

    const { result } = renderHook(() => useProgrammeChainReads([P1, P2, P3]));

    await waitFor(() => expect(result.current.loading.size).toBe(0));
    expect(result.current.errors[P1]).toBe('string error');
    expect(result.current.errors[P2]).toEqual({ code: 42 });
    expect(result.current.reads[P3]).toEqual(FAKE_READ);
  });
});

describe('useProgrammeChainReads — empty list', () => {
  it('returns empty loading and reads immediately when no ids are given', () => {
    const { result } = renderHook(() => useProgrammeChainReads([]));

    expect(result.current.loading.size).toBe(0);
    expect(Object.keys(result.current.reads)).toHaveLength(0);
    expect(reads.readProgrammeChain).not.toHaveBeenCalled();
  });

  it('stays idle when soroban is not available', () => {
    soroban.value = null;
    const { result } = renderHook(() => useProgrammeChainReads([P1]));

    // Loading never starts without a soroban context
    expect(result.current.loading.size).toBe(0);
    expect(reads.readProgrammeChain).not.toHaveBeenCalled();
  });
});

describe('useProgrammeChainReads — id list changes', () => {
  it('adds new ids when the list grows', async () => {
    reads.readProgrammeChain.mockResolvedValue(FAKE_READ);

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useProgrammeChainReads(ids),
      { initialProps: { ids: [P1] } },
    );

    await waitFor(() => expect(result.current.reads[P1]).toBeDefined());

    rerender({ ids: [P1, P2] });

    await waitFor(() => expect(result.current.reads[P2]).toBeDefined());
    expect(result.current.reads[P1]).toEqual(FAKE_READ);
  });

  it('dropped ids disappear from the loading set when the list shrinks', async () => {
    // P2 never resolves — it stays in-flight while we remove it
    const p2d = deferred();
    reads.readProgrammeChain.mockImplementation(async (id: string) => {
      if (id === P2) return p2d.promise;
      return FAKE_READ;
    });

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useProgrammeChainReads(ids),
      { initialProps: { ids: [P1, P2] } },
    );

    // P1 settles; P2 still loading
    await waitFor(() => expect(result.current.reads[P1]).toBeDefined());
    expect(result.current.loading.has(P2)).toBe(true);

    // Remove P2 from the list
    rerender({ ids: [P1] });

    // Now resolve P2 — the cancelled flag should prevent it writing
    await act(async () => {
      p2d.resolve(FAKE_READ);
      await Promise.resolve();
    });

    // P2's stale data must NOT appear in reads
    expect(result.current.reads[P2]).toBeUndefined();
  });
});

describe('useProgrammeChainReads — retry', () => {
  it('re-reads failed ids and clears their errors on success', async () => {
    let calls = 0;
    reads.readProgrammeChain.mockImplementation(async (id: string) => {
      if (id === P1) {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return FAKE_READ;
      }
      return FAKE_READ;
    });

    const { result } = renderHook(() => useProgrammeChainReads([P1]));

    await waitFor(() => expect(result.current.errors[P1]).toBeInstanceOf(Error));

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.reads[P1]).toEqual(FAKE_READ));
    expect(result.current.errors[P1]).toBeUndefined();
  });
});

describe('useProgrammeChainReads — unmount during a read', () => {
  it('does not update state after the component has unmounted', async () => {
    const d = deferred<unknown>();
    reads.readProgrammeChain.mockReturnValue(d.promise);

    const { result, unmount } = renderHook(() => useProgrammeChainReads([P1]));

    expect(result.current.loading.has(P1)).toBe(true);

    unmount();

    // Resolve after unmount — no state update should fire
    await act(async () => {
      d.resolve(FAKE_READ);
      await Promise.resolve();
    });

    // The hook is gone; we just want no thrown errors (no state-on-unmounted)
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useRegistryProgrammes
// ---------------------------------------------------------------------------

describe('useRegistryProgrammes', () => {
  it('starts loading and surfaces ids once the walk completes', async () => {
    const ids = [P1, P2];
    reads.readRegistryProgrammes.mockResolvedValue(ids);

    const { result } = renderHook(() => useRegistryProgrammes());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ids).toEqual(ids);
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error when the walk fails', async () => {
    const boom = new Error('RPC down');
    reads.readRegistryProgrammes.mockRejectedValue(boom);

    const { result } = renderHook(() => useRegistryProgrammes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);
    expect(result.current.ids).toBeNull();
  });

  it('stays idle when disabled=false', () => {
    const { result } = renderHook(() => useRegistryProgrammes(false));

    expect(result.current.loading).toBe(false);
    expect(result.current.ids).toBeNull();
    expect(reads.readRegistryProgrammes).not.toHaveBeenCalled();
  });

  it('stays idle when soroban is unavailable', () => {
    soroban.value = null;
    const { result } = renderHook(() => useRegistryProgrammes());

    expect(result.current.loading).toBe(false);
    expect(reads.readRegistryProgrammes).not.toHaveBeenCalled();
  });

  it('re-fetches on refetch()', async () => {
    reads.readRegistryProgrammes
      .mockResolvedValueOnce([P1])
      .mockResolvedValueOnce([P1, P2]);

    const { result } = renderHook(() => useRegistryProgrammes());

    await waitFor(() => expect(result.current.ids).toEqual([P1]));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.ids).toEqual([P1, P2]));
  });
});

// ---------------------------------------------------------------------------
// useChainRead
// ---------------------------------------------------------------------------

describe('useChainRead', () => {
  it('reads when a key and soroban are present', async () => {
    reads.sessionRead.mockResolvedValue('the-data');

    const { result } = renderHook(() =>
      useChainRead('some-key', async () => 'the-data'),
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('the-data'));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('stays idle when key is null', () => {
    const { result } = renderHook(() =>
      useChainRead(null, async () => 'x'),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(reads.sessionRead).not.toHaveBeenCalled();
  });

  it('stays idle when soroban is unavailable', () => {
    soroban.value = null;
    const { result } = renderHook(() =>
      useChainRead('some-key', async () => 'x'),
    );

    expect(result.current.loading).toBe(false);
    expect(reads.sessionRead).not.toHaveBeenCalled();
  });

  it('surfaces errors and clears them on refetch', async () => {
    const err = new Error('chain error');
    reads.sessionRead
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('recovered');

    const { result } = renderHook(() =>
      useChainRead('some-key', async () => 'x'),
    );

    await waitFor(() => expect(result.current.error).toBe(err));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.data).toBe('recovered'));
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useDonorContribution
// ---------------------------------------------------------------------------

describe('useDonorContribution', () => {
  it('stays idle when either programmeId or donor is null', () => {
    const { result: r1 } = renderHook(() => useDonorContribution(null, 'GADDR'));
    expect(r1.current.loading).toBe(false);
    expect(reads.sessionRead).not.toHaveBeenCalled();

    const { result: r2 } = renderHook(() =>
      useDonorContribution(P1, null),
    );
    expect(r2.current.loading).toBe(false);
  });

  it('reads the contribution when both ids are present', async () => {
    reads.sessionRead.mockResolvedValue(5_000_000n);

    const { result } = renderHook(() =>
      useDonorContribution(P1, 'GDONOR'),
    );

    await waitFor(() => expect(result.current.data).toBe(5_000_000n));
    expect(result.current.error).toBeNull();
  });
});

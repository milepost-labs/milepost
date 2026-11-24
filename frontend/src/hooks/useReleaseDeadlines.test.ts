import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReleaseDeadlines } from './useReleaseDeadlines';

const mocks = vi.hoisted(() => ({ programmeAt: vi.fn() }));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: mocks.programmeAt }),
}));

const DEADLINE = 1_800_000_000n;
const configResult = (release_deadline: bigint | number) => ({
  result: { unwrap: () => ({ release_deadline }) },
});

describe('useReleaseDeadlines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.programmeAt.mockImplementation((id: string) => ({
      get_config: vi.fn().mockResolvedValue(configResult(DEADLINE + BigInt(id.length))),
    }));
  });

  it('reads only real ids and preserves deadlines at the second before, the deadline, and the second after', async () => {
    const getConfig = vi.fn()
      .mockResolvedValueOnce(configResult(DEADLINE - 1n))
      .mockResolvedValueOnce(configResult(DEADLINE))
      .mockResolvedValueOnce(configResult(DEADLINE + 1n));
    mocks.programmeAt.mockImplementation(() => ({ get_config: getConfig }));

    const { result } = renderHook(() =>
      useReleaseDeadlines(['before', 'on', 'after', 'sample'], new Set(['sample'])),
    );

    await waitFor(() => expect(result.current.size).toBe(3));
    expect(result.current).toEqual(new Map([
      ['before', DEADLINE - 1n],
      ['on', DEADLINE],
      ['after', DEADLINE + 1n],
    ]));
    expect(mocks.programmeAt).toHaveBeenCalledTimes(3);
    expect(mocks.programmeAt).not.toHaveBeenCalledWith('sample');
  });

  it('returns an empty map without reading when there are no real ids', () => {
    const { result } = renderHook(() => useReleaseDeadlines(['sample'], new Set(['sample'])));

    expect(result.current).toEqual(new Map());
    expect(mocks.programmeAt).not.toHaveBeenCalled();
  });

  it('omits a programme whose config read or unwrap fails', async () => {
    mocks.programmeAt.mockImplementation((id: string) => ({
      get_config: id === 'reject'
        ? vi.fn().mockRejectedValue(new Error('offline'))
        : vi.fn().mockResolvedValue({ result: { unwrap: () => { throw new Error('bad result'); } } }),
    }));

    const { result } = renderHook(() => useReleaseDeadlines(['reject', 'unwrap'], new Set()));

    await waitFor(() => expect(result.current.size).toBe(0));
  });

  it('replaces the map when the real id set changes, regardless of array identity or order', async () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useReleaseDeadlines(ids, new Set(['sample'])),
      { initialProps: { ids: ['a', 'b', 'sample'] } },
    );
    await waitFor(() => expect(result.current.size).toBe(2));
    const readsAfterInitial = mocks.programmeAt.mock.calls.length;

    rerender({ ids: ['b', 'sample', 'a'] });
    expect(mocks.programmeAt).toHaveBeenCalledTimes(readsAfterInitial);

    rerender({ ids: ['b', 'c'] });
    // The old map also has two entries, so wait for the new one to land.
    await waitFor(() => expect(result.current.has('c')).toBe(true));
    expect(result.current.has('a')).toBe(false);
    expect(result.current.size).toBe(2);
  });

  it('ignores results from an effect cancelled by an id change', async () => {
    let resolveOld!: (value: ReturnType<typeof configResult>) => void;
    mocks.programmeAt.mockImplementation((id: string) => ({
      get_config: () => (id === 'old'
        ? new Promise((resolve) => { resolveOld = resolve; })
        : Promise.resolve(configResult(DEADLINE))),
    }));
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useReleaseDeadlines([id], new Set()),
      { initialProps: { id: 'old' } },
    );

    rerender({ id: 'new' });
    await waitFor(() => expect(result.current.has('new')).toBe(true));
    await act(async () => { resolveOld(configResult(DEADLINE + 1n)); });
    expect(result.current).toEqual(new Map([['new', DEADLINE]]));
  });
});

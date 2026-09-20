import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useIndexedList } from './useIndexedList';

/** Settles a promise on demand, which is what every race test here needs. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useIndexedList', () => {
  it('loads a list', async () => {
    const load = vi.fn().mockResolvedValue(['a', 'b']);

    const { result } = renderHook(() => useIndexedList(load, []));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['a', 'b']));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('makes no request while disabled', () => {
    const load = vi.fn();

    const { result } = renderHook(() => useIndexedList(load, [], { enabled: false }));

    expect(load).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('keeps the failure and clears it on a retry that succeeds', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(['a']);

    const { result } = renderHook(() => useIndexedList(load, []));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect(result.current.error).toBeNull();
  });

  it('does not let a slow earlier response overwrite a newer one', async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ id }) => useIndexedList(load, [id]), {
      initialProps: { id: 'a' },
    });
    rerender({ id: 'b' });

    await act(async () => {
      second.resolve(['newer']);
    });
    await waitFor(() => expect(result.current.data).toEqual(['newer']));

    await act(async () => {
      first.resolve(['older']);
    });
    expect(result.current.data).toEqual(['newer']);
  });

  it('keeps the last list visible while refetching', async () => {
    const second = deferred<string[]>();
    const load = vi.fn().mockResolvedValueOnce(['first']).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useIndexedList(load, []));
    await waitFor(() => expect(result.current.data).toEqual(['first']));

    act(() => result.current.refetch());

    expect(result.current.fetching).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(['first']);

    await act(async () => {
      second.resolve(['second']);
    });
    await waitFor(() => expect(result.current.data).toEqual(['second']));
  });
});

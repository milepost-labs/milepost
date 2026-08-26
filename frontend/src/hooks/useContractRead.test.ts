import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useContractRead, useContractResult } from './useContractRead';

/**
 * These lock down the two things this hook exists to get right and that are
 * invisible until they break: a slow response landing after a newer one, and a
 * refetch not showing a spinner over data already on screen.
 */

/** A promise whose resolution the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useContractRead', () => {
  it('starts loading, then shows data', async () => {
    const call = vi.fn().mockResolvedValue({ result: 42 });

    const { result } = renderHook(() => useContractRead(call, []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.data).toBe(42));
    expect(result.current.loading).toBe(false);
    expect(result.current.fetching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a rejection as error, not data', async () => {
    const failure = new Error('rpc exploded');
    const call = vi.fn().mockRejectedValue(failure);

    const { result } = renderHook(() => useContractRead(call, []));

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.fetching).toBe(false);
  });

  it('does not let a slow earlier response overwrite a newer one', async () => {
    const first = deferred<{ result: string }>();
    const second = deferred<{ result: string }>();
    const call = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { result, rerender } = renderHook(
      ({ deps }: { deps: unknown[] }) => useContractRead(call, deps),
      { initialProps: { deps: [1] } },
    );

    // Programme changes mid-flight: a second, faster request goes out.
    rerender({ deps: [2] });
    expect(call).toHaveBeenCalledTimes(2);

    // The newer request comes back first and wins.
    await act(async () => {
      second.resolve({ result: 'new' });
    });
    expect(result.current.data).toBe('new');

    // The older, slower response lands afterwards and must be ignored.
    await act(async () => {
      first.resolve({ result: 'stale' });
    });
    expect(result.current.data).toBe('new');
  });

  it('refetch re-runs the call and updates state', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ result: 'before' })
      .mockResolvedValueOnce({ result: 'after' });

    const { result } = renderHook(() => useContractRead(call, []));

    await waitFor(() => expect(result.current.data).toBe('before'));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.data).toBe('after'));
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('keeps existing data visible during a refetch instead of showing loading', async () => {
    const first = deferred<{ result: string }>();
    const second = deferred<{ result: string }>();
    const call = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { result } = renderHook(() => useContractRead(call, []));

    await act(async () => {
      first.resolve({ result: 'data' });
    });
    expect(result.current.data).toBe('data');

    act(() => {
      result.current.refetch();
    });

    // A refetch is a background refresh: data stays, loading does not flip back.
    expect(result.current.data).toBe('data');
    expect(result.current.loading).toBe(false);
    expect(result.current.fetching).toBe(true);

    await act(async () => {
      second.resolve({ result: 'refreshed' });
    });
    expect(result.current.data).toBe('refreshed');
    expect(result.current.fetching).toBe(false);
  });

  it('clears a previous error when refetching', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ result: 'recovered' });

    const { result } = renderHook(() => useContractRead(call, []));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    act(() => {
      result.current.refetch();
    });
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.data).toBe('recovered'));
  });

  it('does not call while disabled, and runs once enabled', async () => {
    const call = vi.fn().mockResolvedValue({ result: 'go' });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useContractRead(call, [], { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(call).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.data).toBe('go'));
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when a caller passes a fresh inline closure each render', async () => {
    const inner = vi.fn().mockResolvedValue({ result: 1 });

    const { result, rerender } = renderHook(() =>
      // New function identity on every render; deps are stable.
      useContractRead(() => inner(), []),
    );

    await waitFor(() => expect(result.current.data).toBe(1));
    rerender();
    rerender();

    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('useContractResult', () => {
  it('unwraps a Result-wrapped response', async () => {
    const call = vi.fn().mockResolvedValue({ result: { unwrap: () => 'inside' } });

    const { result } = renderHook(() => useContractResult(call, []));

    await waitFor(() => expect(result.current.data).toBe('inside'));
  });

  it('reports a throwing unwrap as an error', async () => {
    const boom = new Error('NothingToRefund');
    const call = vi.fn().mockResolvedValue({
      result: {
        unwrap: () => {
          throw boom;
        },
      },
    });

    const { result } = renderHook(() => useContractResult(call, []));

    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.data).toBeNull();
  });
});

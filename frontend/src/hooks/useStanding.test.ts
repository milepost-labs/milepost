import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useStanding } from './useStanding';

const SUBJECT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const clients = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ record: { get: clients.get } }),
}));

/** The aggregates `record.get` returns, as `unwrap()` hands them back. */
function standing(overrides: Record<string, unknown> = {}) {
  return {
    first_seen: 1774000000n,
    last_seen: 1774500000n,
    programmes: 3,
    subject: SUBJECT,
    total_received: 46_300_000_000n,
    tranches: 5,
    ...overrides,
  };
}

const read = (value: unknown) => ({ result: { unwrap: () => value } });

describe('useStanding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads record.get for the subject and maps the aggregates', async () => {
    clients.get.mockResolvedValue(read(standing()));

    const { result } = renderHook(() => useStanding(SUBJECT));

    await waitFor(() => expect(result.current.standing).not.toBeNull());
    expect(clients.get).toHaveBeenCalledWith({ subject: SUBJECT });
    expect(result.current.standing).toEqual({
      programmes: 3,
      tranchesReleased: 5,
      totalReceived: 46_300_000_000n,
    });
    expect(result.current.error).toBeNull();
  });

  it('treats NotFound (error 2) as no standing, not a failure', async () => {
    clients.get.mockRejectedValue(new Error('Error(Contract, #2)'));

    const { result } = renderHook(() => useStanding(SUBJECT));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.standing).toBeNull();
    // An address with no history is an ordinary answer; the panel shows the
    // empty state rather than an error.
    expect(result.current.error).toBeNull();
  });

  it('surfaces a failed read rather than showing nothing', async () => {
    clients.get.mockRejectedValue(new Error('Error(Contract, #1)'));

    const { result } = renderHook(() => useStanding(SUBJECT));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.standing).toBeNull();
  });

  it('reads nothing without a subject', () => {
    const { result } = renderHook(() => useStanding(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.standing).toBeNull();
    expect(result.current.error).toBeNull();
    expect(clients.get).not.toHaveBeenCalled();
  });

  it('refreshes the read after a transaction lands', async () => {
    clients.get.mockResolvedValue(read(standing()));

    const { result } = renderHook(() => useStanding(SUBJECT));
    await waitFor(() => expect(result.current.standing?.tranchesReleased).toBe(5));

    clients.get.mockResolvedValue(read(standing({ tranches: 7 })));
    act(() => {
      window.dispatchEvent(new Event('milepost:transaction-success'));
    });

    await waitFor(() => expect(result.current.standing?.tranchesReleased).toBe(7));
  });
});

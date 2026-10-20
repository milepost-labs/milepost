import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRecipientAwards } from './useRecipientAwards';

// A recipient address and two real contract ids (56-char C-prefixed) that
// isSampleProgrammeId will treat as real contracts, not fixtures.
const RECIPIENT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const REAL_A = `C${'A'.repeat(55)}`; // Direct mode
const REAL_B = `C${'B'.repeat(55)}`; // Allocated mode
const REAL_C = `C${'C'.repeat(55)}`; // programme with no award (error 19)
// A sample programme id — not a valid contract address, present in FIXTURE_MY_AWARDS.
const SAMPLE = 'CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB';

const index = vi.hoisted(() => ({ programmes: [] as { id: string }[] }));
vi.mock('../lib/indexer', () => ({
  fetchProgrammes: async () => index.programmes,
}));

const wallet = vi.hoisted(() => ({ address: RECIPIENT as string | null }));
vi.mock('../context/useWallet', () => ({ useWallet: () => ({ address: wallet.address }) }));

const clients = vi.hoisted(() => ({ map: {} as Record<string, unknown> }));
vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: (id: string) => clients.map[id] }),
}));

/** Build a minimal Award struct as the bindings return it. */
function award(overrides: Record<string, unknown> = {}) {
  return {
    recipient: RECIPIENT,
    granted: 30_000_000_000n,       // 3,000 USDC
    released: 10_000_000_000n,       // 1,000 USDC
    tranches: 3,
    tranches_released: 1,
    payee: RECIPIENT,                // non-Direct mode — same as recipient
    mode: { tag: 'Restricted', values: undefined },
    ...overrides,
  };
}

/** Build a mock programme client. */
function client(opts: {
  awardData?: unknown;
  fails?: unknown;
  allocation?: bigint;
} = {}) {
  return {
    get_award: vi.fn(async () => {
      if (opts.fails) throw opts.fails;
      return { result: { unwrap: () => opts.awardData ?? award() } };
    }),
    allocation_of: vi.fn(async () => ({
      result: opts.allocation ?? 5_000_000_000n,
    })),
  };
}

describe('useRecipientAwards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = RECIPIENT;
    // Two real programmes, one that returns no award, one sample.
    index.programmes = [{ id: REAL_A }, { id: REAL_B }, { id: REAL_C }];
    clients.map = {
      [REAL_A]: client({
        awardData: award({ mode: { tag: 'Direct', values: undefined }, payee: 'GPAYEEAAAA' }),
      }),
      // Error 19 = AwardNotFound — the ordinary "no award here" answer.
      [REAL_C]: client({ fails: new Error('Error(Contract, #19)') }),
    };
  });

  it('reads each real programme and drops the ones with no award', async () => {
    clients.map[REAL_B] = client({ fails: new Error('Error(Contract, #19)') });

    const { result } = renderHook(() => useRecipientAwards());

    await waitFor(() =>
      expect(result.current.awards.some((a) => a.programmeId === REAL_A)).toBe(true),
    );

    const entry = result.current.awards.find((a) => a.programmeId === REAL_A);
    expect(entry).toMatchObject({
      programmeId: REAL_A,
      mode: 'Direct',
      tranches: 3,
      tranchesReleased: 1,
      granted: '30000000000',
      released: '10000000000',
      sample: false,
    });

    // Direct mode: payee is shown as the verified payee address.
    expect(entry?.payee).toBe('GPAYEEAAAA');

    // Programme with no award is absent, not shown as a failure.
    expect(result.current.awards.some((a) => a.programmeId === REAL_C)).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reads allocation_of for Allocated mode awards', async () => {
    clients.map[REAL_B] = client({
      awardData: award({
        mode: { tag: 'Allocated', values: undefined },
        payee: RECIPIENT,
      }),
      allocation: 8_000_000_000n,
    });

    const { result } = renderHook(() => useRecipientAwards());

    await waitFor(() =>
      expect(result.current.awards.some((a) => a.programmeId === REAL_B)).toBe(true),
    );

    const entry = result.current.awards.find((a) => a.programmeId === REAL_B);
    expect(entry?.mode).toBe('Allocated');
    // Escrow from allocation_of is surfaced.
    expect(entry?.escrow).toBe('8000000000');
    // payee is null for non-Direct modes.
    expect(entry?.payee).toBeNull();

    // allocation_of was called exactly once for this programme.
    expect((clients.map[REAL_B] as ReturnType<typeof client>).allocation_of).toHaveBeenCalledWith({
      recipient: RECIPIENT,
    });
  });

  it('does not call allocation_of for non-Allocated modes', async () => {
    clients.map[REAL_B] = client({ fails: new Error('Error(Contract, #19)') });

    const { result } = renderHook(() => useRecipientAwards());
    await waitFor(() => expect(result.current.awards.length).toBeGreaterThanOrEqual(1));

    const clientA = clients.map[REAL_A] as ReturnType<typeof client>;
    expect(clientA.allocation_of).not.toHaveBeenCalled();
  });

  it('keeps a sample programme as a tagged stand-in without making a contract call', async () => {
    // Add the sample id to the index so mergeProgrammes picks it up.
    index.programmes = [{ id: SAMPLE }];

    const { result } = renderHook(() => useRecipientAwards());

    await waitFor(() =>
      expect(result.current.awards.some((a) => a.programmeId === SAMPLE)).toBe(true),
    );

    const sample = result.current.awards.find((a) => a.programmeId === SAMPLE);
    expect(sample?.sample).toBe(true);
    // programmeAt is never called for a sample id, so clients.map[SAMPLE]
    // is never accessed and the hook does not throw.
    expect(result.current.error).toBeNull();
  });

  it('surfaces a failed read (non-19 error) rather than silently showing nothing', async () => {
    // Error 1 = NotAuthorized — a real fault, not an ordinary "no award".
    clients.map[REAL_A] = client({ fails: new Error('Error(Contract, #1)') });
    clients.map[REAL_B] = client({ fails: new Error('Error(Contract, #19)') });

    const { result } = renderHook(() => useRecipientAwards());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.awards).toEqual([]);
  });

  it('reads nothing and stays idle when no wallet is connected', () => {
    wallet.address = null;

    const { result } = renderHook(() => useRecipientAwards());

    expect(result.current.loading).toBe(false);
    expect(result.current.awards).toEqual([]);
    expect((clients.map[REAL_A] as ReturnType<typeof client>).get_award).not.toHaveBeenCalled();
  });

  it('covers Restricted and Open modes without calling allocation_of', async () => {
    const restrictedClient = client({
      awardData: award({ mode: { tag: 'Restricted', values: undefined } }),
    });
    const openClient = client({
      awardData: award({ mode: { tag: 'Open', values: undefined } }),
    });
    index.programmes = [{ id: REAL_A }, { id: REAL_B }];
    clients.map = { [REAL_A]: restrictedClient, [REAL_B]: openClient };

    const { result } = renderHook(() => useRecipientAwards());

    await waitFor(() => expect(result.current.awards.length).toBe(2));

    const modes = result.current.awards.map((a) => a.mode).sort();
    expect(modes).toEqual(['Open', 'Restricted']);

    expect(restrictedClient.allocation_of).not.toHaveBeenCalled();
    expect(openClient.allocation_of).not.toHaveBeenCalled();

    // payee is null for both non-Direct modes.
    result.current.awards.forEach((a) => expect(a.payee).toBeNull());
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRecipientApplications } from './useRecipientApplications';

const APPLICANT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const REAL = `C${'A'.repeat(55)}`;
const OTHER = `C${'B'.repeat(55)}`;
const SAMPLE = 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC';

const index = vi.hoisted(() => ({ programmes: [] as { id: string }[] }));
vi.mock('../lib/indexer', () => ({
  fetchProgrammes: async () => index.programmes,
}));

const wallet = vi.hoisted(() => ({ address: APPLICANT as string | null }));
vi.mock('../context/useWallet', () => ({ useWallet: () => ({ address: wallet.address }) }));

const clients = vi.hoisted(() => ({ map: {} as Record<string, unknown> }));
vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: (id: string) => clients.map[id] }),
}));

function application(overrides: Record<string, unknown> = {}) {
  return {
    applicant: APPLICANT,
    requested: 12000000000n, // 1,200 USDC
    submitted_at: 1774000000n,
    votes: [9000000000n, 12000000000n],
    finalized: false,
    withdrawn: false,
    ...overrides,
  };
}

function client(opts: {
  application?: unknown;
  fails?: unknown;
  quorum?: number;
  phase?: string;
} = {}) {
  return {
    get_application: vi.fn(async () => {
      if (opts.fails) throw opts.fails;
      return { result: { unwrap: () => opts.application ?? application() } };
    }),
    get_config: vi.fn(async () => ({
      result: { unwrap: () => ({ quorum: opts.quorum ?? 3 }) },
    })),
    get_phase: vi.fn(async () => ({
      result: { unwrap: () => ({ tag: opts.phase ?? 'Review' }) },
    })),
  };
}

describe('useRecipientApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = APPLICANT;
    index.programmes = [{ id: REAL }, { id: OTHER }];
    clients.map = {
      [REAL]: client({ quorum: 5, phase: 'Review' }),
      // Error 8 is the contract's ordinary "no application from this account".
      [OTHER]: client({ fails: new Error('Error(Contract, #8)') }),
    };
  });

  it('reads each known programme and drops the ones with no application', async () => {
    const { result } = renderHook(() => useRecipientApplications());

    await waitFor(() => expect(result.current.applications.some((a) => a.programmeId === REAL)).toBe(true));

    const entry = result.current.applications.find((a) => a.programmeId === REAL);
    expect(entry).toMatchObject({
      requested: '12000000000',
      votes: ['9000000000', '12000000000'],
      quorum: 5,
      phase: 'Review',
      finalized: false,
      withdrawn: false,
      sample: false,
    });

    // The programme with no application is absent, not shown as a failure.
    expect(result.current.applications.some((a) => a.programmeId === OTHER)).toBe(false);
    expect(result.current.error).toBeNull();

    // Only the programme that exists is asked for its config and phase.
    const other = clients.map[OTHER] as ReturnType<typeof client>;
    expect(other.get_config).not.toHaveBeenCalled();
    expect(other.get_phase).not.toHaveBeenCalled();
  });

  it('keeps a sample programme as a tagged stand-in and never reads a contract for it', async () => {
    const { result } = renderHook(() => useRecipientApplications());

    await waitFor(() =>
      expect(result.current.applications.some((a) => a.programmeId === SAMPLE)).toBe(true),
    );

    const sample = result.current.applications.find((a) => a.programmeId === SAMPLE);
    expect(sample?.sample).toBe(true);
    // `programmeAt` returns undefined for a sample, so a read would have thrown.
    expect(result.current.error).toBeNull();
  });

  it('surfaces a failed read rather than showing nothing', async () => {
    clients.map[REAL] = client({ fails: new Error('Error(Contract, #1)') });
    clients.map[OTHER] = client({ fails: new Error('Error(Contract, #8)') });

    const { result } = renderHook(() => useRecipientApplications());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.applications).toEqual([]);
  });

  it('reads nothing until a wallet is connected', () => {
    wallet.address = null;

    const { result } = renderHook(() => useRecipientApplications());

    expect(result.current.loading).toBe(false);
    expect(result.current.applications).toEqual([]);
    expect((clients.map[REAL] as ReturnType<typeof client>).get_application).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOpenProgrammes } from './useOpenProgrammes';

// Two real contract-id-shaped programme ids (56-char C-prefixed).
// isSampleProgrammeId returns false for these — they are treated as live
// contracts, not fixtures.
const REAL_OPEN   = `C${'A'.repeat(55)}`;
const REAL_CLOSED = `C${'B'.repeat(55)}`;
const REAL_FAULT  = `C${'C'.repeat(55)}`;

// A sample programme id present in FIXTURE_PROGRAMMES whose fixture phase is Open.
const SAMPLE_OPEN = 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY';
// A sample programme id whose fixture phase is NOT Open (it is Review).
const SAMPLE_CLOSED = 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC';

// ---------- module mocks ---------------------------------------------------

const index = vi.hoisted(() => ({ programmes: [] as { id: string }[] }));
vi.mock('../lib/indexer', () => ({
  fetchProgrammes: async () => index.programmes,
}));

const clients = vi.hoisted(() => ({ map: {} as Record<string, unknown> }));
vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: (id: string) => clients.map[id],
  }),
}));

// ---------- helpers --------------------------------------------------------

function phaseClient(tag: string) {
  return {
    get_phase: vi.fn(async () => ({
      result: { unwrap: () => ({ tag }) },
    })),
  };
}

function faultClient(message: string) {
  return {
    get_phase: vi.fn(async () => {
      throw new Error(message);
    }),
  };
}

// ---------- tests ----------------------------------------------------------

describe('useOpenProgrammes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    index.programmes = [{ id: REAL_OPEN }, { id: REAL_CLOSED }];
    clients.map = {
      [REAL_OPEN]:   phaseClient('Open'),
      [REAL_CLOSED]: phaseClient('Settled'),
    };
  });

  it('includes real Open programmes and excludes non-Open ones', async () => {
    const { result } = renderHook(() => useOpenProgrammes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.real.map((p) => p.id)).toEqual([REAL_OPEN]);
    expect(result.current.real.every((p) => !p.sample)).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('includes Open sample programmes in the samples group, not real', async () => {
    // No real programmes — only the sample ids show up via mergeProgrammes.
    index.programmes = [];

    const { result } = renderHook(() => useOpenProgrammes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // SAMPLE_OPEN has fixture phase 'Open', so it appears in samples.
    expect(result.current.samples.some((p) => p.id === SAMPLE_OPEN)).toBe(true);
    // SAMPLE_CLOSED has fixture phase 'Review', so it is excluded entirely.
    expect(result.current.samples.some((p) => p.id === SAMPLE_CLOSED)).toBe(false);

    // Samples are never in the real group.
    expect(result.current.real).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('does not call get_phase for sample programmes', async () => {
    // One sample id in the index (will be merged via FIXTURE_PROGRAMMES too).
    index.programmes = [{ id: SAMPLE_OPEN }];

    const { result } = renderHook(() => useOpenProgrammes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // No client registered for the sample id — if the hook tried to call
    // programmeAt(SAMPLE_OPEN).get_phase() it would throw.
    expect(result.current.error).toBeNull();
  });

  it('excludes a real Cancelled programme without surfacing an error', async () => {
    clients.map = {
      [REAL_OPEN]:   phaseClient('Open'),
      [REAL_CLOSED]: phaseClient('Cancelled'),
    };

    const { result } = renderHook(() => useOpenProgrammes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.real.map((p) => p.id)).toEqual([REAL_OPEN]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a genuine fault (non-phase error) from a real programme', async () => {
    index.programmes = [{ id: REAL_OPEN }, { id: REAL_FAULT }];
    clients.map = {
      [REAL_OPEN]:  phaseClient('Open'),
      // Error 1 = NotAuthorized — a real fault, not an ordinary phase answer.
      [REAL_FAULT]: faultClient('Error(Contract, #1)'),
    };

    const { result } = renderHook(() => useOpenProgrammes());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.real).toEqual([]);
  });

  it('returns samples only when the index is empty', async () => {
    index.programmes = [];

    const { result } = renderHook(() => useOpenProgrammes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The fixture set is always merged in; Open-phase samples surface.
    expect(result.current.samples.length).toBeGreaterThan(0);
    expect(result.current.real).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns all real Open programmes when several exist', async () => {
    const REAL_B = `C${'D'.repeat(55)}`;
    const REAL_C = `C${'E'.repeat(55)}`;
    index.programmes = [{ id: REAL_OPEN }, { id: REAL_B }, { id: REAL_C }];
    clients.map = {
      [REAL_OPEN]: phaseClient('Open'),
      [REAL_B]:    phaseClient('Open'),
      [REAL_C]:    phaseClient('Review'),
    };

    const { result } = renderHook(() => useOpenProgrammes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.real.map((p) => p.id).sort();
    expect(ids).toEqual([REAL_B, REAL_OPEN].sort());
    expect(result.current.error).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLedgerCloseTime } from './ledgerTime';

// The session cache persists across calls within a module, so we need to
// isolate each test from the others. Re-importing the module resets the cache.
vi.mock('./programmeReads', async (importOriginal) => {
  // Replace sessionRead with a passthrough so the cache does not bleed
  // between tests — we control the RPC mock at the rpcServer level instead.
  const original = await importOriginal<typeof import('./programmeReads')>();
  return {
    ...original,
    sessionRead: vi.fn((_key: string, run: () => Promise<unknown>) => run()),
  };
});

vi.mock('./rpcHealth', () => ({
  reportRpcSuccess: vi.fn(),
  reportRpcFailure: vi.fn(),
  isRpcFailure: vi.fn(() => false),
}));

// A minimal rpc.Server stand-in. Each test overrides the methods it needs.
const mockGetLedgers = vi.fn();
const mockGetLatestLedger = vi.fn();

vi.mock('./txLookup', () => ({
  rpcServer: vi.fn(() => ({
    getLedgers: mockGetLedgers,
    getLatestLedger: mockGetLatestLedger,
  })),
}));

const RPC_URL = 'https://rpc.example.com';
const LEDGER_SEQ = 5_000_000;
// A plausible Unix timestamp — 2024-01-15 UTC
const EXACT_CLOSE_TIME = 1_705_276_800;

describe('fetchLedgerCloseTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an exact time when the ledger is inside the retention window', async () => {
    mockGetLedgers.mockResolvedValue({
      ledgers: [{ sequence: LEDGER_SEQ, ledgerCloseTime: String(EXACT_CLOSE_TIME) }],
    });

    const result = await fetchLedgerCloseTime(RPC_URL, LEDGER_SEQ);

    expect(result.closeTime).toBe(EXACT_CLOSE_TIME);
    expect(result.isEstimate).toBe(false);
    expect(mockGetLedgers).toHaveBeenCalledWith({
      startLedger: LEDGER_SEQ,
      pagination: { limit: 1 },
    });
    expect(mockGetLatestLedger).not.toHaveBeenCalled();
  });

  it('falls back to an estimate when getLedgers returns an empty list', async () => {
    // Empty response means the ledger is outside the retention window.
    mockGetLedgers.mockResolvedValue({ ledgers: [] });

    const latestSeq = LEDGER_SEQ + 1_000_000;
    const nowSeconds = Math.floor(Date.now() / 1000);
    mockGetLatestLedger.mockResolvedValue({ sequence: latestSeq });

    const result = await fetchLedgerCloseTime(RPC_URL, LEDGER_SEQ);

    expect(result.isEstimate).toBe(true);
    // Should be approximately (nowSeconds - 1_000_000 * 5) seconds
    const expectedApprox = nowSeconds - 1_000_000 * 5;
    expect(result.closeTime).toBeCloseTo(expectedApprox, -2); // within ~100 seconds
    expect(mockGetLatestLedger).toHaveBeenCalled();
  });

  it('falls back to an estimate when getLedgers returns a different ledger sequence', async () => {
    // The RPC returned a ledger but its sequence does not match what we asked.
    mockGetLedgers.mockResolvedValue({
      ledgers: [{ sequence: LEDGER_SEQ + 1, ledgerCloseTime: String(EXACT_CLOSE_TIME) }],
    });

    const latestSeq = LEDGER_SEQ + 500;
    mockGetLatestLedger.mockResolvedValue({ sequence: latestSeq });

    const result = await fetchLedgerCloseTime(RPC_URL, LEDGER_SEQ);

    expect(result.isEstimate).toBe(true);
  });

  it('falls back to an estimate when getLedgers throws', async () => {
    mockGetLedgers.mockRejectedValue(new Error('Network error'));

    const latestSeq = LEDGER_SEQ + 200;
    mockGetLatestLedger.mockResolvedValue({ sequence: latestSeq });

    const result = await fetchLedgerCloseTime(RPC_URL, LEDGER_SEQ);

    expect(result.isEstimate).toBe(true);
    expect(mockGetLatestLedger).toHaveBeenCalled();
  });

  it('throws when both getLedgers and getLatestLedger fail', async () => {
    mockGetLedgers.mockRejectedValue(new Error('Network error'));
    mockGetLatestLedger.mockRejectedValue(new Error('Also unavailable'));

    await expect(fetchLedgerCloseTime(RPC_URL, LEDGER_SEQ)).rejects.toThrow('Also unavailable');
  });

  it('computes the estimate at ~5 seconds per ledger from the latest', async () => {
    mockGetLedgers.mockResolvedValue({ ledgers: [] });

    const delta = 10_000; // 10,000 ledgers behind latest
    const latestSeq = LEDGER_SEQ + delta;
    // Pin wall-clock time so the test is deterministic.
    const fixedNow = 1_705_276_800_000; // milliseconds
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    mockGetLatestLedger.mockResolvedValue({ sequence: latestSeq });

    const result = await fetchLedgerCloseTime(RPC_URL, LEDGER_SEQ);

    expect(result.isEstimate).toBe(true);
    // Expected: fixedNow/1000 - delta * 5
    const expected = fixedNow / 1000 - delta * 5;
    expect(result.closeTime).toBe(expected);
  });
});

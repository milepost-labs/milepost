import { describe, expect, it, vi } from 'vitest';
import { rpc } from '@milepost/program';
import {
  estimateLedgerTime,
  LEDGER_CLOSE_SECONDS,
  lookupLedgerTime,
} from './ledgerTime';

/**
 * A programme header's date may be exact (the RPC still retains that ledger)
 * or estimated from the latest ledger. Both paths must produce a real date,
 * and an unknowable one must come back as null rather than a plausible-looking
 * wrong date.
 */

const CLOSE_SECONDS = Math.floor(Date.parse('2026-03-12T10:00:00Z') / 1000);
const CLOSE_ISO = '2026-03-12T10:00:00Z';

function fakeServer(options: {
  getLedgers?: (request: { startLedger: number }) => Promise<unknown>;
  getLatestLedger?: () => Promise<unknown>;
}): rpc.Server {
  return {
    getLedgers: vi.fn(
      options.getLedgers ?? (async () => ({ ledgers: [] })),
    ),
    getLatestLedger: vi.fn(options.getLatestLedger ?? (async () => ({}))),
  } as unknown as rpc.Server;
}

describe('estimateLedgerTime', () => {
  it('counts back from the latest ledger at the testnet cadence', () => {
    expect(estimateLedgerTime(990, 1000, CLOSE_SECONDS)).toEqual({
      seconds: CLOSE_SECONDS - 10 * LEDGER_CLOSE_SECONDS,
      estimated: true,
    });
  });

  it('accepts the latest ledger itself as the created ledger', () => {
    expect(estimateLedgerTime(1000, 1000, CLOSE_SECONDS)).toEqual({
      seconds: CLOSE_SECONDS,
      estimated: true,
    });
  });

  it('refuses to invent a date from unusable inputs', () => {
    expect(estimateLedgerTime(990, 1000, null)).toBeNull();
    expect(estimateLedgerTime(Number.NaN, 1000, CLOSE_SECONDS)).toBeNull();
    expect(estimateLedgerTime(990, Number.NaN, CLOSE_SECONDS)).toBeNull();
    // A created ledger ahead of the latest is not something to guess about.
    expect(estimateLedgerTime(1001, 1000, CLOSE_SECONDS)).toBeNull();
  });
});

describe('lookupLedgerTime', () => {
  it('returns an exact date when the RPC still retains the ledger', async () => {
    const getLedgers = vi.fn(async (request: { startLedger: number }) => ({
      ledgers: [{ sequence: request.startLedger, ledgerCloseTime: CLOSE_ISO }],
    }));
    const getLatestLedger = vi.fn(async () => ({ sequence: 5_000, closeTime: CLOSE_SECONDS }));

    const result = await lookupLedgerTime(
      fakeServer({ getLedgers, getLatestLedger }),
      4_811_204,
    );

    expect(result).toEqual({ seconds: CLOSE_SECONDS, estimated: false });
    expect(getLedgers).toHaveBeenCalledWith({
      startLedger: 4_811_204,
      pagination: { limit: 1 },
    });
    expect(getLatestLedger).not.toHaveBeenCalled();
  });

  it('estimates from the latest ledger when the created ledger has aged out', async () => {
    const getLedgers = vi.fn(async (request: { startLedger: number }) => {
      // The RPC starts at the earliest ledger it retains, not the one asked for.
      if (request.startLedger === 4_811_204) {
        return { ledgers: [{ sequence: 4_900_000, ledgerCloseTime: CLOSE_ISO }] };
      }
      return { ledgers: [] };
    });

    const result = await lookupLedgerTime(
      fakeServer({
        getLedgers,
        getLatestLedger: async () => ({ sequence: 5_000_000, closeTime: CLOSE_SECONDS }),
      }),
      4_811_204,
    );

    expect(result).toEqual({
      seconds: CLOSE_SECONDS - (5_000_000 - 4_811_204) * LEDGER_CLOSE_SECONDS,
      estimated: true,
    });
  });

  it('falls back to reading the latest ledger when getLatestLedger omits its close time', async () => {
    const getLedgers = vi.fn(async (request: { startLedger: number }) => {
      if (request.startLedger === 4_811_204) return { ledgers: [] };
      if (request.startLedger === 5_000_000) {
        return {
          ledgers: [
            { sequence: request.startLedger, ledgerCloseTime: CLOSE_SECONDS * 1000 },
          ],
        };
      }
      return { ledgers: [] };
    });

    const result = await lookupLedgerTime(
      fakeServer({
        getLedgers,
        getLatestLedger: async () => ({ sequence: 5_000_000 }),
      }),
      4_811_204,
    );

    expect(result).toEqual({
      seconds: CLOSE_SECONDS - (5_000_000 - 4_811_204) * LEDGER_CLOSE_SECONDS,
      estimated: true,
    });
    expect(getLedgers).toHaveBeenCalledWith({
      startLedger: 5_000_000,
      pagination: { limit: 1 },
    });
  });

  it('accepts a close time reported as a numeric string', async () => {
    const result = await lookupLedgerTime(
      fakeServer({
        getLedgers: async (request: { startLedger: number }) => ({
          ledgers: [
            {
              sequence: request.startLedger,
              ledgerCloseTime: String(CLOSE_SECONDS),
            },
          ],
        }),
      }),
      123,
    );

    expect(result).toEqual({ seconds: CLOSE_SECONDS, estimated: false });
  });

  it('returns null when the RPC cannot supply either an exact or a latest close time', async () => {
    expect(
      await lookupLedgerTime(
        fakeServer({
          getLedgers: async () => {
            throw new Error('RPC unavailable');
          },
          getLatestLedger: async () => {
            throw new Error('RPC unavailable');
          },
        }),
        123,
      ),
    ).toBeNull();

    // getLedgers answers, but with no usable close time, and the latest ledger
    // has neither a close time nor a readable ledger.
    expect(
      await lookupLedgerTime(
        fakeServer({
          getLedgers: async () => ({ ledgers: [{ sequence: 123, ledgerCloseTime: 'not a date' }] }),
          getLatestLedger: async () => ({ sequence: 900 }),
        }),
        123,
      ),
    ).toBeNull();
  });

  it('returns null when the latest ledger sequence is unusable', async () => {
    expect(
      await lookupLedgerTime(
        fakeServer({
          getLedgers: async () => ({ ledgers: [] }),
          getLatestLedger: async () => ({ sequence: 'not a number' }),
        }),
        123,
      ),
    ).toBeNull();
  });

  it('does not use a different ledger as if it were the requested one', async () => {
    const result = await lookupLedgerTime(
      fakeServer({
        getLedgers: async () => ({
          ledgers: [{ sequence: 999, ledgerCloseTime: CLOSE_ISO }],
        }),
        getLatestLedger: async () => ({ sequence: 999 }),
      }),
      123,
    );

    // The mismatched record is not treated as an exact answer; the fallback
    // estimates from the latest ledger instead.
    expect(result).toEqual({
      seconds: CLOSE_SECONDS - (999 - 123) * LEDGER_CLOSE_SECONDS,
      estimated: true,
    });
  });
});

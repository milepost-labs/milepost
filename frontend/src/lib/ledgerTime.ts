/**
 * When a ledger closed, in Unix seconds.
 *
 * A programme's header can show the ledger it was created in, but a ledger
 * number says nothing to someone deciding whether a programme is new or
 * abandoned. The RPC's `getLedgers` returns a ledger's close time while it is
 * in the retention window; for older ledgers the date is estimated from the
 * latest ledger and marked as approximate.
 *
 * Testnet closes a ledger roughly every five seconds. That is the cadence the
 * estimate uses, and the reason an approximate date is good to within hours
 * even for a programme created months ago.
 */

import { rpc } from '@milepost/program';

/** Observed testnet cadence: one ledger about every five seconds. */
export const LEDGER_CLOSE_SECONDS = 5;

export interface LedgerTime {
  /** Unix seconds. */
  seconds: number;
  /** True when derived from the latest ledger rather than read for this one. */
  estimated: boolean;
}

interface LedgerRecord {
  sequence?: number | string;
  ledgerCloseTime?: unknown;
}

interface GetLedgersLike {
  ledgers?: LedgerRecord[];
}

interface GetLatestLedgerLike {
  sequence?: number | string;
  closeTime?: unknown;
}

/**
 * Turn a close time the RPC may report as seconds, milliseconds or an ISO
 * string into Unix seconds. Anything unusable is null, never a plausible-looking
 * wrong date.
 */
function unixSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value > 1e12 ? value / 1000 : value);
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return null;
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return unixSeconds(numeric);
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }
  return null;
}

/** Read one ledger's close time, or null when it is outside the window. */
async function readCloseTime(server: rpc.Server, ledger: number): Promise<number | null> {
  try {
    const response = (await server.getLedgers({
      startLedger: ledger,
      pagination: { limit: 1 },
    })) as unknown as GetLedgersLike;
    // Ask for this ledger explicitly. A ledger older than the retention window
    // either makes the RPC refuse the request or makes it start at the earliest
    // ledger it still has; a returned record is only this ledger's date if its
    // sequence matches.
    const record = response.ledgers?.find(
      (entry) => Number(entry.sequence) === ledger,
    );
    return record ? unixSeconds(record.ledgerCloseTime) : null;
  } catch {
    return null;
  }
}

/**
 * Estimate a ledger's close time from the latest ledger.
 *
 * Returns null when the inputs cannot describe a real date — a future ledger,
 * a missing close time — rather than inventing one.
 */
export function estimateLedgerTime(
  createdLedger: number,
  latestSequence: number,
  latestCloseTime: number | null,
): LedgerTime | null {
  if (
    latestCloseTime === null ||
    !Number.isFinite(createdLedger) ||
    !Number.isFinite(latestSequence) ||
    createdLedger > latestSequence
  ) {
    return null;
  }

  const elapsed = (latestSequence - createdLedger) * LEDGER_CLOSE_SECONDS;
  return { seconds: latestCloseTime - elapsed, estimated: true };
}

/**
 * The creation date for a ledger: exact when the RPC still retains it,
 * otherwise estimated from the latest ledger. Null when neither is possible.
 */
export async function lookupLedgerTime(
  server: rpc.Server,
  createdLedger: number,
): Promise<LedgerTime | null> {
  const exact = await readCloseTime(server, createdLedger);
  if (exact !== null) return { seconds: exact, estimated: false };

  try {
    const latest = (await server.getLatestLedger()) as unknown as GetLatestLedgerLike;
    const latestSequence = Number(latest.sequence);
    if (!Number.isFinite(latestSequence)) return null;

    const latestCloseTime =
      unixSeconds(latest.closeTime) ?? (await readCloseTime(server, latestSequence));

    return estimateLedgerTime(createdLedger, latestSequence, latestCloseTime);
  } catch {
    return null;
  }
}

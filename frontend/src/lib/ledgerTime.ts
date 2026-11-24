/**
 * Resolve a ledger sequence number to its close time (Unix seconds).
 *
 * Recent ledgers: the RPC's `getLedgers` returns an exact close time.
 * Old ledgers outside the RPC's retention window return an empty list; those
 * are estimated from the latest ledger's close time at ~5 seconds per ledger.
 * The estimate is marked approximate by the `isEstimate` flag so callers can
 * label it "about" in the UI.
 *
 * Results are cached for the session via `sessionRead` — a ledger's close
 * time is immutable once confirmed, so a resolved value is good forever.
 */

import { rpc } from '@milepost/program';
import { sessionRead } from './programmeReads';
import { reportRpcSuccess, reportRpcFailure, isRpcFailure } from './rpcHealth';
import { rpcServer } from './txLookup';

/** Stellar closes a ledger roughly every 5 seconds. */
const SECONDS_PER_LEDGER = 5;

export interface LedgerCloseTime {
  /** Unix seconds of the ledger's close. */
  closeTime: number;
  /** True when the value was estimated rather than read from the RPC. */
  isEstimate: boolean;
}

/**
 * Resolve `ledgerSeq` to a close time.
 *
 * Tries `getLedgers` first. If the ledger is outside the RPC's retention
 * window (empty result) or the call fails entirely, falls back to an estimate
 * derived from the latest ledger's close time and sequence number.
 */
export async function fetchLedgerCloseTime(
  rpcUrl: string,
  ledgerSeq: number,
): Promise<LedgerCloseTime> {
  return sessionRead(`ledger-close-time:${ledgerSeq}`, async () => {
    const server = rpcServer(rpcUrl);

    // --- Exact path: ledger is inside the RPC's retention window ---
    try {
      const response = await server.getLedgers({
        startLedger: ledgerSeq,
        pagination: { limit: 1 },
      });
      reportRpcSuccess();
      const ledger = response.ledgers[0];
      if (ledger && ledger.sequence === ledgerSeq) {
        return {
          closeTime: Number(ledger.ledgerCloseTime),
          isEstimate: false,
        };
      }
      // Response was empty or returned a different ledger — fall through to
      // the estimate path.
    } catch (err) {
      if (isRpcFailure(err)) reportRpcFailure();
      // Any RPC error falls through to the estimate path so the UI degrades
      // gracefully rather than showing nothing.
    }

    // --- Estimate path: derive from the latest ledger ---
    try {
      const latest = await fetchLatestLedger(server);
      reportRpcSuccess();
      const deltaSeconds = (latest.sequence - ledgerSeq) * SECONDS_PER_LEDGER;
      return {
        closeTime: latest.closeTime - deltaSeconds,
        isEstimate: true,
      };
    } catch (err) {
      if (isRpcFailure(err)) reportRpcFailure();
      throw err;
    }
  });
}

interface LatestLedger {
  sequence: number;
  closeTime: number;
}

/** Read the latest ledger sequence and close time from the RPC in one call. */
async function fetchLatestLedger(server: rpc.Server): Promise<LatestLedger> {
  const response = await server.getLatestLedger();
  return {
    sequence: response.sequence,
    // getLatestLedger does not return a close time directly; use wall-clock
    // time as the best available stand-in. The error is at most a few seconds.
    closeTime: Math.floor(Date.now() / 1000),
  };
}

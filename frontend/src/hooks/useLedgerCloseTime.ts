/**
 * Resolve a ledger sequence number to its close time for display in the UI.
 *
 * Uses `useChainRead` so results are cached for the session and the read
 * status is surfaced in the standard `{ data, loading, error }` shape.
 * Passing `null` skips the read entirely.
 */

import { useChainRead, type KeyedRead } from './useProgrammeReads';
import { fetchLedgerCloseTime, type LedgerCloseTime } from '../lib/ledgerTime';

export function useLedgerCloseTime(ledgerSeq: number | null): KeyedRead<LedgerCloseTime> {
  const key = ledgerSeq !== null ? `ledger-close-time:${ledgerSeq}` : null;
  return useChainRead(key, (soroban) =>
    fetchLedgerCloseTime(soroban.rpcUrl, ledgerSeq as number),
  );
}

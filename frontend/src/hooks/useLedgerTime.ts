import { useMemo } from 'react';
import { rpc } from '@milepost/program';
import { lookupLedgerTime, type LedgerTime } from '../lib/ledgerTime';
import { useContractRead, type ContractRead } from './useContractRead';

/**
 * Resolve the creation date for a programme's ledger.
 *
 * Disabled when there is no ledger to resolve (a sample programme, or an index
 * entry without one), so nothing invents a ledger time. The result is exact
 * when the RPC retains the ledger and estimated otherwise; see
 * `lib/ledgerTime.ts`.
 */
export function useLedgerTime(
  createdLedger: number | null,
  rpcUrl: string,
): ContractRead<LedgerTime | null> {
  const server = useMemo(
    () => new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') }),
    [rpcUrl],
  );

  return useContractRead<LedgerTime | null>(
    async () => ({
      result:
        createdLedger === null
          ? null
          : await lookupLedgerTime(server, createdLedger),
    }),
    [server, createdLedger],
    { enabled: createdLedger !== null },
  );
}

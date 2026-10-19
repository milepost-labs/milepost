import { useMemo } from 'react';
import { useSoroban } from '../context/useSoroban';
import { useContractRead } from './useContractRead';

/**
 * How much of their refund this donor has already claimed from a programme.
 *
 * Reads `refunded_to({ donor })` on the programme contract — an infallible
 * view that returns 0 when the address has never claimed anything. The read
 * is skipped for sample programmes (no contract behind them) and when no
 * donor address is available.
 *
 * Refetch is not wired to a transaction-success event here; callers that need
 * fresh data after a claim (`ContributionItem`) trigger a page-level refresh
 * via `onRefunded` instead.
 */
export function useRefundedTo(
  programmeId: string | null,
  donor: string | null,
  sample: boolean,
): { refundedSoFar: bigint; loading: boolean } {
  const { programmeAt } = useSoroban();

  const client = useMemo(
    () => (programmeId && !sample ? programmeAt(programmeId) : null),
    [programmeId, sample, programmeAt],
  );

  const read = useContractRead(
    () => client!.refunded_to({ donor: donor! }),
    [client, donor],
    { enabled: Boolean(client) && Boolean(donor) },
  );

  return {
    refundedSoFar: read.data ?? 0n,
    loading: read.loading,
  };
}

import { useEffect, useMemo } from 'react';
import type { Standing } from '@milepost/record';
import { useSoroban } from '../context/useSoroban';
import { explain, isFailure } from '../lib/errors';
import type { StandingView } from '../lib/standing';
import { useContractResult } from './useContractRead';

/**
 * A recipient's standing, read from the `record` contract.
 *
 * `record.get(subject)` returns the aggregates — the distinct programmes that
 * have credited this address, the tranches released and the total received.
 * It answers `NotFound` (error 2) for an address that has never been credited,
 * which is an ordinary answer rather than a fault, so it becomes the empty
 * state instead of an error.
 *
 * The figures the contract does not carry — the awarded-tranche denominator
 * and the entry's remaining life — are left off the read rather than invented.
 */

export interface StandingState {
  /** The aggregates, or null while reading, when there is no subject, or when the chain reports none. */
  standing: StandingView | null;
  /** True only on the first read for a subject. */
  loading: boolean;
  /** A failed read. Null when there is simply no standing yet, or none was asked for. */
  error: unknown;
  refetch: () => void;
}

/** The contract's aggregates, shaped for the panel. */
function toStanding(standing: Standing): StandingView {
  return {
    programmes: Number(standing.programmes),
    tranchesReleased: Number(standing.tranches),
    totalReceived: standing.total_received,
  };
}

export function useStanding(subject: string | null): StandingState {
  const { record } = useSoroban();

  const read = useContractResult<Standing>(
    () => record.get({ subject: subject! }),
    [record, subject],
    { contract: 'record', enabled: Boolean(subject) },
  );
  const { refetch } = read;

  // A release elsewhere, or a keepalive on this entry, changes the read; the
  // one event the writes dispatch refreshes it.
  useEffect(() => {
    window.addEventListener('milepost:transaction-success', refetch);
    return () => {
      window.removeEventListener('milepost:transaction-success', refetch);
    };
  }, [refetch]);

  return useMemo(() => {
    const explained = read.error ? explain(read.error, 'record') : null;
    return {
      standing: read.data ? toStanding(read.data) : null,
      loading: Boolean(subject) && read.loading,
      // `NotFound` (error 2) is the contract's ordinary answer for an address
      // that has never been credited, not a fault: it leaves `error` null so
      // the panel shows the empty state rather than a failure.
      error: explained && isFailure(explained) ? read.error : null,
      refetch,
    };
  }, [subject, read.data, read.error, read.loading, refetch]);
}

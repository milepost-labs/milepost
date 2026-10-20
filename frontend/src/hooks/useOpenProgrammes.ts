import { useCallback, useMemo } from 'react';
import type { Client as Programme } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { explain, isFailure } from '../lib/errors';
import { fetchProgrammes } from '../lib/indexer';
import { mergeProgrammes, type DirectoryProgramme } from '../lib/programmeView';
import { useContractRead } from './useContractRead';
import { useIndexedList } from './useIndexedList';

/**
 * Read one programme's on-chain phase and return it if Open, or null
 * otherwise.
 *
 * `get_phase` is a public read — no wallet required. `WrongPhase` and
 * `Cancelled` are normal answers, not errors; only a genuine fault (network
 * failure, bad contract id) is re-thrown so the caller can surface it.
 */
async function readIfOpen(
  programme: DirectoryProgramme,
  programmeAt: (contractId: string) => Programme,
): Promise<DirectoryProgramme | null> {
  // Sample programmes have no contract; their phase comes from the fixture.
  if (programme.sample) return null;

  try {
    const response = await programmeAt(programme.id).get_phase();
    const phase = response.result.unwrap();
    return phase.tag === 'Open' ? programme : null;
  } catch (caught) {
    // A non-fault answer (e.g. Cancelled rendered as a contract enum) can
    // surface as an "error" from unwrap when the phase is not Open.
    // isFailure() == false means it is an ordinary non-open answer.
    if (!isFailure(explain(caught, 'program'))) return null;
    throw caught;
  }
}

export interface OpenProgrammesState {
  /**
   * Real programmes (from the index) whose on-chain phase is Open, in the
   * order the index lists them.
   */
  real: DirectoryProgramme[];
  /**
   * Sample programmes whose fixture phase is Open. Kept separate so the form
   * can label them as sample data.
   */
  samples: DirectoryProgramme[];
  /** True only on the first load before any result is available. */
  loading: boolean;
  /** True while any read is in flight, including a background refresh. */
  fetching: boolean;
  /**
   * A failed chain read. A stale or unavailable index is not an error here —
   * it only means the real list is unknown and only samples show.
   */
  error: unknown;
  refetch: () => void;
}

/**
 * The programmes a recipient can apply to right now.
 *
 * Walks the published programme list (merged with the fixture set) and asks
 * each real programme's contract for its current phase. Only Open programmes
 * are returned in `real`; sample programmes with an Open fixture phase are
 * returned in `samples` so the form can group and label them separately.
 *
 * No wallet connection is required — phase reads are public.
 */
export function useOpenProgrammes(): OpenProgrammesState {
  const { programmeAt } = useSoroban();

  const programmesRead = useIndexedList(() => fetchProgrammes(), []);
  const allProgrammes = useMemo(
    () => mergeProgrammes(programmesRead.data),
    [programmesRead.data],
  );

  // Split up front so the contract read only fires for real programmes.
  const realProgrammes = useMemo(
    () => allProgrammes.filter((p) => !p.sample),
    [allProgrammes],
  );

  const sampleProgrammes = useMemo(
    () => allProgrammes.filter((p) => p.sample && p.chain.phase === 'Open'),
    [allProgrammes],
  );

  const phaseRead = useContractRead<DirectoryProgramme[]>(
    async () => {
      const results = await Promise.all(
        realProgrammes.map((p) => readIfOpen(p, programmeAt)),
      );
      return { result: results.filter((p): p is DirectoryProgramme => p !== null) };
    },
    [realProgrammes, programmeAt],
    // Always enabled — no wallet needed for public phase reads.
    { enabled: true },
  );

  const { refetch: refetchPhases } = phaseRead;
  const { refetch: refetchProgrammes } = programmesRead;
  const refetch = useCallback(() => {
    refetchProgrammes();
    refetchPhases();
  }, [refetchProgrammes, refetchPhases]);

  return {
    real: phaseRead.data ?? [],
    samples: sampleProgrammes,
    loading: phaseRead.loading || programmesRead.loading,
    fetching: phaseRead.fetching || programmesRead.fetching,
    error: phaseRead.error,
    refetch,
  };
}

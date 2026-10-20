import { useCallback, useEffect, useMemo } from 'react';
import type { Application, Client as Programme, Phase, ProgrammeConfig } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import {
  FIXTURE_APPLICATIONS,
  type RecipientApplicationFixture,
} from '../fixtures/recipientFixtures';
import { explain, isFailure } from '../lib/errors';
import { fetchProgrammes } from '../lib/indexer';
import { mergeProgrammes, type DirectoryProgramme } from '../lib/programmeView';
import { useContractRead } from './useContractRead';
import { useIndexedList } from './useIndexedList';

/**
 * A recipient's applications, read from the chain.
 *
 * The contracts store applications under the applicant's address and keep no
 * list, so there is no on-chain way to ask "which programmes have I applied
 * to?". The published index says which programmes exist; each one is then
 * asked directly, and the answer is what the screen shows.
 *
 * A programme whose id is a fixture id has no contract behind it, so its
 * sample entry stands in and keeps its "Sample data" tag — see
 * `isSampleProgrammeId`.
 */

export interface RecipientApplicationsState {
  applications: RecipientApplicationFixture[];
  /** True only on the first load, and only once there is a wallet to read for. */
  loading: boolean;
  /** True while any read is in flight, including a background refresh. */
  fetching: boolean;
  /**
   * A failed chain read. An index that will not load is not an error here: it
   * only means the list of programmes is unknown, and the samples still show.
   */
  error: unknown;
  refetch: () => void;
}

/** The sample entry for a fixture programme, tagged as sample data. */
function sampleApplication(programme: DirectoryProgramme): RecipientApplicationFixture | null {
  const fixture = FIXTURE_APPLICATIONS.find((entry) => entry.programmeId === programme.id);
  return fixture ? { ...fixture, sample: true } : null;
}

/**
 * Read one programme's application for `applicant`, or null when the chain
 * says there is none.
 *
 * `get_application` answers error 8 — "No application from this account yet" —
 * for any programme the applicant has not applied to, which is the ordinary
 * answer rather than a fault, so it is dropped from the list. Anything else is
 * re-thrown: a programme we could not read must not look like a programme with
 * no application.
 */
async function readApplication(
  programme: DirectoryProgramme,
  applicant: string,
  programmeAt: (contractId: string) => Programme,
): Promise<RecipientApplicationFixture | null> {
  if (programme.sample) return sampleApplication(programme);

  const client = programmeAt(programme.id);

  let application: Application;
  try {
    application = (await client.get_application({ applicant })).result.unwrap();
  } catch (caught) {
    if (!isFailure(explain(caught, 'program'))) return null;
    throw caught;
  }

  // Only read the rest once the application is known to exist, so programmes
  // the applicant never applied to cost a single read each.
  const [config, phase] = await Promise.all([
    client.get_config().then((response) => response.result.unwrap() as ProgrammeConfig),
    client.get_phase().then((response) => response.result.unwrap() as Phase),
  ]);

  return {
    programmeId: programme.id,
    programmeName: programme.name,
    phase: phase.tag,
    requested: application.requested.toString(),
    submittedAt: Number(application.submitted_at),
    votes: application.votes.map((vote) => vote.toString()),
    quorum: config.quorum,
    finalized: application.finalized,
    withdrawn: application.withdrawn,
    sample: false,
  };
}

/** Every known programme, asked once each. Kept in the order the directory lists them. */
async function readApplications(
  programmes: DirectoryProgramme[],
  applicant: string,
  programmeAt: (contractId: string) => Programme,
): Promise<RecipientApplicationFixture[]> {
  const read = await Promise.all(
    programmes.map((programme) => readApplication(programme, applicant, programmeAt)),
  );
  return read.filter((application): application is RecipientApplicationFixture => application !== null);
}

export function useRecipientApplications(
  options: { enabled?: boolean } = {},
): RecipientApplicationsState {
  const { enabled = true } = options;
  const { address } = useWallet();
  const { programmeAt } = useSoroban();

  const programmesRead = useIndexedList(() => fetchProgrammes(), [], { enabled });
  const programmes = useMemo(() => mergeProgrammes(programmesRead.data), [programmesRead.data]);

  const read = useContractRead<RecipientApplicationFixture[]>(
    async () => ({ result: await readApplications(programmes, address!, programmeAt) }),
    [programmes, address],
    { enabled: enabled && Boolean(address) },
  );

  // A withdrawal re-reads the application, and an application re-reads the
  // list, so both refresh from the one event the writes already dispatch.
  const { refetch } = read;
  useEffect(() => {
    window.addEventListener('milepost:transaction-success', refetch);
    return () => {
      window.removeEventListener('milepost:transaction-success', refetch);
    };
  }, [refetch]);

  const { refetch: refetchProgrammes } = programmesRead;
  const refetchAll = useCallback(() => {
    refetchProgrammes();
    refetch();
  }, [refetchProgrammes, refetch]);

  return {
    applications: read.data ?? [],
    loading: enabled && (read.loading || (Boolean(address) && programmesRead.loading)),
    fetching: read.fetching || programmesRead.fetching,
    error: enabled && address ? read.error : null,
    refetch: refetchAll,
  };
}

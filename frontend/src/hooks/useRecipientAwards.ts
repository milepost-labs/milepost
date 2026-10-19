import { useCallback, useEffect, useMemo } from 'react';
import type { Award, Client as Programme } from '@milepost/program';
import { useSoroban } from '../context/useSoroban';
import { useWallet } from '../context/useWallet';
import { FIXTURE_MY_AWARDS, type RecipientAwardFixture } from '../fixtures/recipientFixtures';
import { explain, isFailure } from '../lib/errors';
import { fetchProgrammes } from '../lib/indexer';
import { mergeProgrammes, type DirectoryProgramme } from '../lib/programmeView';
import { useContractRead } from './useContractRead';
import { useIndexedList } from './useIndexedList';

/**
 * The sample entry for a fixture programme, tagged so the card can label it.
 * Mirrors the same pattern used in useRecipientApplications.
 */
function sampleAward(programme: DirectoryProgramme): RecipientAwardFixture | null {
  const fixture = FIXTURE_MY_AWARDS.find((a) => a.programmeId === programme.id);
  return fixture ? { ...fixture, sample: true } : null;
}

/**
 * Read one programme's award for `recipient`, or null when there is none.
 *
 * `get_award` answers error 19 — "No award for this account yet" — for any
 * programme the recipient has no award in, which is the ordinary answer rather
 * than a fault, so it is dropped from the list. Anything else is re-thrown: a
 * programme we could not read must not look like a programme with no award.
 *
 * For Allocated mode awards the escrow balance (`allocation_of`) is read in
 * the same pass. `allocation_of` is infallible and returns `i128` directly,
 * so no `.unwrap()` is needed — confirmed in the binding interface and
 * consistent with how AllocatedSpending.tsx calls it.
 */
async function readAward(
  programme: DirectoryProgramme,
  recipient: string,
  programmeAt: (contractId: string) => Programme,
): Promise<RecipientAwardFixture | null> {
  if (programme.sample) return sampleAward(programme);

  const client = programmeAt(programme.id);

  let award: Award;
  try {
    award = (await client.get_award({ recipient })).result.unwrap();
  } catch (caught) {
    // AwardNotFound (19) is kind: 'none' — the ordinary answer for a
    // programme this recipient has no award in. Silently skip it.
    if (!isFailure(explain(caught, 'program'))) return null;
    throw caught;
  }

  // For Allocated mode, also read the escrowed balance the recipient may still
  // direct. allocation_of is infallible; read it in parallel with nothing else
  // to avoid holding a Promise.all slot unnecessarily.
  let escrow: bigint | undefined;
  if (award.mode.tag === 'Allocated') {
    const { result } = await client.allocation_of({ recipient });
    escrow = result;
  }

  return {
    programmeId: programme.id,
    programmeName: programme.name,
    recipient: award.recipient,
    granted: award.granted.toString(),
    released: award.released.toString(),
    tranches: award.tranches,
    tranchesReleased: award.tranches_released,
    // payee is the recipient's own address in non-Direct modes; don't show it
    // as a distinct payee because it carries no useful information there.
    payee: award.mode.tag === 'Direct' ? award.payee : null,
    mode: award.mode.tag,
    // updatedLedger has no on-chain source in get_award; 0 is a safe sentinel
    // that callers may filter on when the indexer later provides this.
    updatedLedger: 0,
    // attestationReady needs a separate attest read which is out of scope
    // for this wave. False means "not confirmed yet", which is the safe default.
    attestationReady: false,
    // condition comes from off-chain programme metadata — not available from
    // get_award. Empty string keeps the AwardCard render path valid.
    condition: '',
    escrow: escrow !== undefined ? escrow.toString() : undefined,
    sample: false,
  };
}

/**
 * Every known programme, asked once each. Awards whose read throws a real
 * (non-AwardNotFound) error are re-thrown rather than silently dropped, so a
 * partial failure is visible rather than indistinguishable from "no award".
 */
async function readAwards(
  programmes: DirectoryProgramme[],
  recipient: string,
  programmeAt: (contractId: string) => Programme,
): Promise<RecipientAwardFixture[]> {
  const results = await Promise.all(
    programmes.map((programme) => readAward(programme, recipient, programmeAt)),
  );
  return results.filter((a): a is RecipientAwardFixture => a !== null);
}

export interface RecipientAwardsState {
  awards: RecipientAwardFixture[];
  /** True only on the first load, and only once there is a wallet to read for. */
  loading: boolean;
  /** True while any read is in flight, including a background refresh. */
  fetching: boolean;
  /**
   * A failed chain read. An index that will not load is not an error here:
   * it only means the programme list is unknown, and the samples still show.
   */
  error: unknown;
  refetch: () => void;
}

/**
 * The signed-in recipient's awards across all known programmes.
 *
 * Walks the published programme list (merged with the fixture set) and calls
 * `get_award(recipient)` on each contract. Programmes with no award are
 * silently skipped; sample programmes fall back to their fixture entries.
 *
 * Allocated awards include the current escrow balance from `allocation_of`.
 *
 * Refetches on every `milepost:transaction-success` so a released tranche or
 * a directed allocation is reflected immediately.
 */
export function useRecipientAwards(options: { enabled?: boolean } = {}): RecipientAwardsState {
  const { enabled = true } = options;
  const { address } = useWallet();
  const { programmeAt } = useSoroban();

  const programmesRead = useIndexedList(() => fetchProgrammes(), [], { enabled });
  const programmes = useMemo(() => mergeProgrammes(programmesRead.data), [programmesRead.data]);

  const read = useContractRead<RecipientAwardFixture[]>(
    async () => ({ result: await readAwards(programmes, address!, programmeAt) }),
    [programmes, address],
    { enabled: enabled && Boolean(address) },
  );

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
    awards: read.data ?? [],
    loading: enabled && (read.loading || (Boolean(address) && programmesRead.loading)),
    fetching: read.fetching || programmesRead.fetching,
    error: enabled && address ? read.error : null,
    refetch: refetchAll,
  };
}

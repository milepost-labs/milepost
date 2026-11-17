/**
 * How `finalize` turns reviewer votes into an award, exactly as
 * `contracts/program/src/lib.rs` does it.
 *
 * The contract keeps votes sorted from lowest and takes the vote at index
 * `(quorum - 1) / 2`. With exactly `quorum` votes that is the median (the
 * lower of the two middles for an even quorum, never an average). Votes beyond
 * the quorum sit in the same sorted list, so they can only lower the award or
 * leave it unchanged, never raise it.
 *
 * Null until the quorum is in, because the contract refuses to finalize before
 * then (`QuorumNotReached`).
 */
export function awardFromVotes(votes: readonly bigint[], quorum: number): bigint | null {
  if (quorum <= 0 || votes.length < quorum) return null;
  const sorted = [...votes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor((quorum - 1) / 2)];
}

/** The rule in one sentence, for screens that explain it. */
export const AWARD_RULE =
  'The award is the middle vote once the quorum is in, never an average. Votes beyond the quorum can only lower it.';

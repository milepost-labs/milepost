/**
 * Stand-in data for the finalize screen (`/finalize`).
 *
 * Every export here is named `FIXTURE_*` and is **shaped like the read it
 * stands in for**, so replacing it with the real call is a change of source
 * rather than a change of shape:
 *
 * - `FIXTURE_REVIEW_APPLICATIONS` is shaped like `program.get_application`
 *   results (applicant, requested, and the sorted vote vector) for the
 *   applications awaiting finalization on the Review-phase sample programme.
 *   The contracts keep no "all applications" list, so a real version of this
 *   list would come from an indexer handler that does not exist yet.
 *
 * Amounts are stroop strings, exactly as the bindings return them — never
 * `number`, which loses precision past 2^53.
 *
 * Anything rendered from these is tagged in the UI as "Sample data" so it is
 * never mistaken for a live figure. One `grep` for `FIXTURE_` finds all of it.
 */

/** Shaped like a `program.get_application` result awaiting finalization. */
export interface FixtureReviewApplication {
  applicant: string;
  /** Stroops, as a decimal string. */
  requested: string;
  /** Approved amounts in ascending order, stroops as decimal strings. */
  votes: string[];
}

/**
 * Applications in review for the Review-phase sample programme
 * (`CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC`). Shaped like
 * `program.get_application` + votes.
 */
export const FIXTURE_REVIEW_APPLICATIONS: FixtureReviewApplication[] = [
  {
    applicant: `GAPL${'A'.repeat(48)}234A`,
    requested: '12000000000',
    votes: ['9000000000', '10000000000', '11000000000', '12000000000', '12000000000'],
  },
  {
    applicant: `GAPL${'B'.repeat(48)}234B`,
    requested: '20000000000',
    votes: ['15000000000', '18000000000', '18000000000', '19000000000', '20000000000'],
  },
  {
    applicant: `GAPL${'C'.repeat(48)}234C`,
    requested: '15000000000',
    votes: ['12000000000', '14000000000', '15000000000', '15000000000', '15000000000'],
  },
  {
    applicant: `GAPL${'D'.repeat(48)}234D`,
    requested: '9000000000',
    votes: ['8000000000', '9000000000', '9000000000'],
  },
  {
    applicant: `GAPL${'E'.repeat(48)}234E`,
    requested: '8000000000',
    votes: ['5000000000', '6000000000', '6000000000', '7000000000', '8000000000'],
  },
];

/**
 * The award `finalize` would settle on: the vote at index `(quorum - 1) / 2`
 * of the sorted votes — the lower of the two middles for an even count.
 * This is the same lookup the contract performs, so the median shown here
 * matches what finalization would actually settle on.
 */
export function medianForQuorum(votes: bigint[], quorum: number): bigint | null {
  if (quorum <= 0 || votes.length < quorum) return null;
  return votes[Math.floor((quorum - 1) / 2)];
}

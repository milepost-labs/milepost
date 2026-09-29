/**
 * Stand-in data for the recipient standing screen.
 *
 * `FIXTURE_STANDING` is shaped like the reads the screen performs:
 * `record.get(subject)` returns the aggregates (distinct programmes, tranches
 * released, total received, first and last seen), the awards index supplies the
 * awarded-tranche denominator, and a TTL read supplies how long the entry stays
 * live. Swapping to the real calls is a change of source, not of shape.
 *
 * Standing is counts and totals only. There is deliberately nothing here that
 * could be mistaken for a transaction list, because the contract stores no such
 * list.
 */
export interface StandingFixture {
  /** Distinct programmes that have credited this recipient. */
  programmes: number;
  /** Tranches released across every programme — `Standing.tranches`. */
  tranchesReleased: number;
  /** Tranches awarded across every programme, for the "of N" denominator. */
  tranchesAwarded: number;
  /** Total received, in stroops — `Standing.total_received`. */
  totalReceived: bigint;
  /** Days until the standing entry is archived if nobody extends it. */
  liveForDays: number;
}

export const FIXTURE_STANDING: StandingFixture = {
  programmes: 3,
  tranchesReleased: 5,
  tranchesAwarded: 9,
  totalReceived: 46_300_000_000n,
  liveForDays: 23,
};

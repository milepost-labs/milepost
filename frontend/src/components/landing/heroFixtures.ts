/**
 * Stand-in data for the landing hero demo (design phase).
 *
 * Shaped like the award read it stands in for, so swapping to a real call is
 * a change of source: tranches carry per-tranche amounts, plus the condition
 * the verifier confirms and who confirms it. Illustrative only — the demo
 * card never implies a real transaction.
 */

export interface HeroAwardFixture {
  tranches: number[];
  condition: string;
  verifier: string;
}

export const FIXTURE_HERO_AWARD: HeroAwardFixture = {
  tranches: [500, 500, 500],
  condition: 'Term 1 enrolment confirmed',
  verifier: 'Registrar, Kisumu Academy',
};

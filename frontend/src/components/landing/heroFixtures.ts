/**
 * Stand-in data for the landing hero demo.
 *
 * One worked example: a bursary paid in three tranches, each unlocked when the
 * school registrar confirms enrolment for a term. Shaped like the award read
 * it stands in for (tranche amounts, the condition, who confirms it, who is
 * paid). Illustrative only: the demo never implies a real transaction, and
 * "school" and "tuition" belong to this example, not to the product.
 */

export interface HeroAwardFixture {
  recipient: string;
  purpose: string;
  asset: string;
  /** Amount per tranche, in whole units. */
  tranches: number[];
  /** What each milepost sign is counted in: "Term 01". */
  unit: string;
  /** The condition, completed with the tranche number. */
  condition: string;
  verifier: string;
  /** Who signs, as the button names them. */
  verifierRole: string;
  verifierAddress: string;
  payee: string;
  payeeFor: string;
}

export const FIXTURE_HERO_AWARD: HeroAwardFixture = {
  recipient: 'Amina O.',
  purpose: 'secondary-school bursary',
  asset: 'USDC',
  tranches: [500, 500, 500],
  unit: 'Term',
  condition: 'Enrolled for term',
  verifier: 'the school registrar',
  verifierRole: 'registrar',
  verifierAddress: 'GBX4…K2LQ',
  payee: 'the school',
  payeeFor: 'For tuition',
};

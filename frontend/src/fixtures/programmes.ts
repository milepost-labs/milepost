/**
 * Stand-in data for the directory and programme screens.
 *
 * Every export here is named `FIXTURE_*` and is **shaped like the read it
 * stands in for**, so replacing it with the real call is a change of source
 * rather than a change of shape:
 *
 * - `FIXTURE_PROGRAMMES` is shaped like an entry in the published index
 *   (`programmes.json`, see `lib/indexer.ts`).
 * - `FIXTURE_CHAIN` / `FIXTURE_CHAIN_DEFAULT` are shaped like the on-chain
 *   read a programme screen performs (phase, mode, amounts in stroops as the
 *   i128 bindings return them).
 *
 * Anything rendered from these is tagged in the UI as "Sample data" /
 * "Sample chain read" so it is never mistaken for a live figure.
 */

/** Phase a programme can be in, mirrored from `@milepost/program`. */
export type FixturePhase = 'Open' | 'Review' | 'Settled' | 'Cancelled';

/** Payout mode, mirrored from `@milepost/program`. */
export type FixtureMode = 'Direct' | 'Allocated' | 'Restricted' | 'Open';

/** Shaped like an `IndexedProgramme` entry. */
export interface FixtureProgramme {
  id: string;
  name: string | null;
  creator: string | null;
  createdLedger: number | null;
}

/** Shaped like a programme contract read. Amounts are stroop strings. */
export interface FixtureChainRead {
  phase: FixturePhase;
  mode: FixtureMode;
  contributed: string;
  fee: string;
  awarded: string;
  released: string;
  refundable: string;
  quorum: number;
  applicants: number;
  closesInDays?: number;
}

export const FIXTURE_PROGRAMMES: FixtureProgramme[] = [
  {
    id: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    name: 'Secondary school bursaries 2026',
    creator: 'GAKR7W…D2QX',
    createdLedger: 4811204,
  },
  {
    id: 'CCM2SMALLHOLDERINPUTSLR26A9FK3XU7PZ4E8QT2BN',
    name: 'Smallholder inputs, long rains',
    creator: 'GD5TQ4…9LKA',
    createdLedger: 4798551,
  },
  {
    id: 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC',
    name: 'Vocational bursaries, cohort 3',
    creator: 'GB2ZHM…Q7RP',
    createdLedger: 4702316,
  },
  {
    id: 'CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB',
    name: 'SME supplier microgrants Q2',
    creator: 'GCX8NE…4FTM',
    createdLedger: 4611087,
  },
  {
    id: 'CBF9FLOODRESPONSETANA6QW2XM4RP7KZ3HT8LN5DVA',
    name: 'Flood response cash transfers',
    creator: 'GAKR7W…D2QX',
    createdLedger: 4655420,
  },
];

export const FIXTURE_CHAIN: Record<string, FixtureChainRead> = {
  CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY: {
    phase: 'Open',
    mode: 'Direct',
    contributed: '126000000000',
    fee: '1260000000',
    awarded: '0',
    released: '0',
    refundable: '0',
    quorum: 3,
    applicants: 41,
    closesInDays: 9,
  },
  CCM2SMALLHOLDERINPUTSLR26A9FK3XU7PZ4E8QT2BN: {
    phase: 'Open',
    mode: 'Allocated',
    contributed: '48500000000',
    fee: '485000000',
    awarded: '0',
    released: '0',
    refundable: '0',
    quorum: 3,
    applicants: 12,
    closesInDays: 21,
  },
  CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC: {
    phase: 'Review',
    mode: 'Direct',
    contributed: '80000000000',
    fee: '800000000',
    awarded: '31500000000',
    released: '0',
    refundable: '0',
    quorum: 5,
    applicants: 64,
  },
  CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB: {
    phase: 'Settled',
    mode: 'Restricted',
    contributed: '150000000000',
    fee: '1500000000',
    awarded: '132000000000',
    released: '88000000000',
    refundable: '16500000000',
    quorum: 3,
    applicants: 38,
  },
  CBF9FLOODRESPONSETANA6QW2XM4RP7KZ3HT8LN5DVA: {
    phase: 'Cancelled',
    mode: 'Direct',
    contributed: '22000000000',
    fee: '220000000',
    awarded: '0',
    released: '0',
    refundable: '21780000000',
    quorum: 3,
    applicants: 0,
  },
};

/** Used for index programmes the fixture set does not name. */
export const FIXTURE_CHAIN_DEFAULT: FixtureChainRead = {
  phase: 'Settled',
  mode: 'Allocated',
  contributed: '60000000000',
  fee: '600000000',
  awarded: '52000000000',
  released: '17500000000',
  refundable: '0',
  quorum: 3,
  applicants: 23,
};

/** The stand-in chain read for `id`, falling back to the default entry. */
export function chainFor(id: string): FixtureChainRead {
  return FIXTURE_CHAIN[id] ?? FIXTURE_CHAIN_DEFAULT;
}

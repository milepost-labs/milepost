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
 *
 * Sample ids are real-format contract addresses (56 characters, `C` plus
 * base32, valid StrKey checksum) so every id check treats samples exactly like
 * real programmes. Each is derived from a fixed seed and cannot collide with a
 * deployed contract, whose id comes from a deployer address and salt:
 *
 *   StrKey.encodeContract(sha256(`milepost-sample:${seed}`))
 *
 * `SAMPLE_PROGRAMME_SEEDS` lists the seeds; a test recomputes every id.
 */

/** Seed behind each sample programme id (see the derivation above). */
export const SAMPLE_PROGRAMME_SEEDS: Record<string, string> = {
  CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7: 'community-resilience-2026',
  CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI: 'smallholder-inputs-long-rains',
  CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C: 'workforce-skills-cohort-3',
  CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM: 'sme-supplier-microgrants-q2',
  CBUESJW3MUDDN2NVG7RPQK7N2JSJMSKHDQMIQZMDXZMR6GNNZWX46LNU: 'flood-response-cash-transfers',
};

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

/**
 * Shaped like a programme contract read. Amounts are stroop strings.
 *
 * `mode` and `applicants` are knowable only from ledger data the contracts
 * deliberately keep no list of, so a real chain read maps onto this shape
 * without them — they stay optional rather than being invented for real
 * programmes, and copy that mentions them degrades honestly.
 */
export interface FixtureChainRead {
  phase: FixturePhase;
  mode?: FixtureMode;
  contributed: string;
  fee: string;
  awarded: string;
  released: string;
  refundable: string;
  quorum: number;
  applicants?: number;
  closesInDays?: number;
}

export const FIXTURE_PROGRAMMES: FixtureProgramme[] = [
  {
    id: 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7',
    name: 'Community resilience grants 2026',
    creator: 'GAKR7W…D2QX',
    createdLedger: 4811204,
  },
  {
    id: 'CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI',
    name: 'Smallholder inputs, long rains',
    creator: 'GD5TQ4…9LKA',
    createdLedger: 4798551,
  },
  {
    id: 'CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C',
    name: 'Workforce skills grants, cohort 3',
    creator: 'GB2ZHM…Q7RP',
    createdLedger: 4702316,
  },
  {
    id: 'CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM',
    name: 'SME supplier microgrants Q2',
    creator: 'GCX8NE…4FTM',
    createdLedger: 4611087,
  },
  {
    id: 'CBUESJW3MUDDN2NVG7RPQK7N2JSJMSKHDQMIQZMDXZMR6GNNZWX46LNU',
    name: 'Flood response cash transfers',
    creator: 'GAKR7W…D2QX',
    createdLedger: 4655420,
  },
];

export const FIXTURE_CHAIN: Record<string, FixtureChainRead> = {
  CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7: {
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
  CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI: {
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
  CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C: {
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
  CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM: {
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
  CBUESJW3MUDDN2NVG7RPQK7N2JSJMSKHDQMIQZMDXZMR6GNNZWX46LNU: {
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

/** True when `id` names one of the stand-in programmes, not a deployed contract. */
export function isSampleProgrammeId(id: string): boolean {
  return FIXTURE_PROGRAMMES.some((programme) => programme.id === id);
}

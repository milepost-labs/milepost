import type { IndexedAward } from '../lib/indexer';

export interface VerifierFixture {
  address: string;
  label: string;
  schema: string;
}

/**
 * Programme verifier roster stand-in.
 * Unwired until published by the indexer.
 */
export const FIXTURE_VERIFIERS: VerifierFixture[] = [
  {
    address: 'GCVR4TGK5YV3QW3K4Y2D6V8M9J8QHN',
    label: 'Programme verifier A',
    schema: 'condition-met/v1',
  },
  {
    address: 'GDLX2PV4V7L8Z1M5N2K9C3WKA4R9B',
    label: 'Programme verifier B',
    schema: 'condition-met/v1',
  },
];

/**
 * Awards stand-in shaped like the read from programmes/<id>/awards.json.
 * Amounts are decimal strings in stroops.
 */
export const FIXTURE_AWARDS: IndexedAward[] = [
  {
    recipient: 'GBB4Q2L9W8K1X5N4P7M3Y8T19',
    granted: '140000000000',
    released: '140000000000',
    tranches: 3,
    tranchesReleased: 3,
    payee: 'GC2B8V9KMA',
    mode: 'Direct',
    updatedLedger: 4635510,
  },
  {
    recipient: 'GDKL91V2M3K4P8R5T7W14LA2',
    granted: '90000000000',
    released: '60000000000',
    tranches: 3,
    tranchesReleased: 2,
    payee: 'GC7L3Q1ZZN',
    mode: 'Direct',
    updatedLedger: 4635514,
  },
  {
    recipient: 'GAM37TR5K2W8P4M1N9L9PLA',
    granted: '50000000000',
    released: '0',
    tranches: 2,
    tranchesReleased: 0,
    payee: 'GBZ98K4QAA',
    mode: 'Allocated',
    updatedLedger: 4635517,
  },
  {
    recipient: 'GCPA88W4N2K8V5M7P1KOP',
    granted: '80000000000',
    released: '26660000000',
    tranches: 3,
    tranchesReleased: 1,
    payee: 'GCPAY48NBE',
    mode: 'Restricted',
    updatedLedger: 4635519,
  },
];

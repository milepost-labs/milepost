/**
 * Stand-in data for recipient awards, payees, applications, and standing.
 *
 * Shaped like the reads they stand in for, so swapping to live on-chain
 * reads or index data is a change of source.
 */

export interface RecipientAwardFixture {
  programmeId: string;
  programmeName: string;
  recipient: string;
  granted: string; // stroops as decimal string
  released: string; // stroops as decimal string
  tranches: number;
  tranchesReleased: number;
  payee: string | null;
  mode: 'Direct' | 'Allocated' | 'Restricted' | 'Open';
  updatedLedger: number;
  attestationReady: boolean;
  condition: string;
  escrow?: string; // stroops as decimal string for Allocated mode
}

export interface VerifiedPayeeFixture {
  address: string;
  label: string;
}

export interface RecipientApplicationFixture {
  programmeId: string;
  programmeName: string;
  phase: 'Open' | 'Review' | 'Settled' | 'Cancelled';
  requested: string; // stroops as decimal string
  submittedLedger: number;
  votes: string[]; // stroops as decimal strings
  quorum: number; // reviewer quorum, capped at 16
}

export interface RecipientStandingFixture {
  programmes: number;
  received: string; // stroops as decimal string
  tranchesReleased: number;
  tranchesAwarded: number;
  liveForDays: number;
}

/**
 * Recipient awards fixture covering all four modes:
 * Restricted, Allocated, Direct, and Open.
 */
export const FIXTURE_MY_AWARDS: RecipientAwardFixture[] = [
  {
    programmeId: 'CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB',
    programmeName: 'SME Microgrants Cohort 2',
    recipient: 'GD4KQ2…2QXW',
    granted: '40000000000', // 4,000 USDC
    released: '13300000000', // 1,330 USDC
    tranches: 3,
    tranchesReleased: 1,
    payee: null,
    mode: 'Restricted',
    updatedLedger: 4640021,
    attestationReady: true,
    condition: 'Supplier invoice for milestone 2 approved',
  },
  {
    programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    programmeName: 'Secondary School Bursaries 2026',
    recipient: 'GD4KQ2…2QXW',
    granted: '30000000000', // 3,000 USDC
    released: '10000000000', // 1,000 USDC
    tranches: 3,
    tranchesReleased: 1,
    payee: null,
    mode: 'Allocated',
    updatedLedger: 4851002,
    attestationReady: false,
    condition: 'Shifts for this month confirmed by supervisor',
    escrow: '10000000000', // 1,000 USDC held in escrow
  },
  {
    programmeId: 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC',
    programmeName: 'Vocational Training Stipends Q3',
    recipient: 'GD4KQ2…2QXW',
    granted: '20000000000', // 2,000 USDC
    released: '20000000000', // 2,000 USDC
    tranches: 2,
    tranchesReleased: 2,
    payee: 'GCPAY1…Q2LM',
    mode: 'Direct',
    updatedLedger: 4712000,
    attestationReady: false,
    condition: 'Graduation certificate verified',
  },
  {
    programmeId: 'COPENCOMMUNITYRESEARCHGRANTS99887766554433',
    programmeName: 'Community Open Research Grants',
    recipient: 'GD4KQ2…2QXW',
    granted: '15000000000', // 1,500 USDC
    released: '5000000000', // 500 USDC
    tranches: 3,
    tranchesReleased: 1,
    payee: null,
    mode: 'Open',
    updatedLedger: 4750000,
    attestationReady: true,
    condition: 'Preliminary research report published',
  },
];

/**
 * Verified payees roster stand-in.
 */
export const FIXTURE_PAYEES: VerifiedPayeeFixture[] = [
  {
    address: 'GCPAY7R2W8PL3KTM4HQ9VN19AZ',
    label: 'Verified payee · Pharmacy',
  },
  {
    address: 'GCPAY8D4V2MX9QRA7TL5KJ88BE',
    label: 'Verified payee · Transport co-op',
  },
];

/**
 * Recipient applications stand-in.
 */
export const FIXTURE_APPLICATIONS: RecipientApplicationFixture[] = [
  {
    programmeId: 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC',
    programmeName: 'Vocational Training Stipends Q3',
    phase: 'Review',
    requested: '12000000000', // 1,200 USDC
    submittedLedger: 4704410,
    votes: ['12000000000', '9000000000'],
    quorum: 5,
  },
  {
    programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    programmeName: 'Secondary School Bursaries 2026',
    phase: 'Open',
    requested: '5000000000', // 500 USDC
    submittedLedger: 4818330,
    votes: [],
    quorum: 3,
  },
];

/**
 * Recipient standing aggregate stand-in.
 */
export const FIXTURE_STANDING: RecipientStandingFixture = {
  programmes: 3,
  received: '46300000000',
  tranchesReleased: 5,
  tranchesAwarded: 9,
  liveForDays: 23,
};

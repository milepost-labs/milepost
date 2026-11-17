/**
 * Copy and data for the landing page.
 *
 * Kept out of the components so tests can check it against the app's routes
 * and the contracts without rendering the page. This is real copy, not
 * stand-in data, so none of it is named FIXTURE_. The one worked example (a
 * bursary paid in three tranches) lives in `components/landing/heroFixtures.ts`.
 */

/* ── "What brings you here?" ─────────────────────────────────────────────── */

export interface RoleEntry {
  /** Short label beside the number: "Fund", "Verify". */
  key: string;
  want: string;
  detail: string;
  /** A route the app serves, or an in-page anchor. */
  path: string;
}

export const ROLE_ENTRIES: RoleEntry[] = [
  {
    key: 'Fund',
    want: 'I want to fund a programme',
    detail: "Contribute, follow every release, and get a proportional refund of whatever isn't paid out.",
    path: '/funders',
  },
  {
    key: 'Get funded',
    want: 'I need funding',
    detail: 'Ask for the amount you actually need, track each tranche, and carry a record of what you delivered.',
    path: '/recipients',
  },
  {
    key: 'Verify',
    want: 'I confirm conditions',
    detail:
      "You're a school, clinic, field partner or mentor. Your signature unlocks exactly one tranche for one person.",
    path: '/verifiers',
  },
  {
    key: 'Build',
    want: 'I build on Stellar',
    detail: 'Five Soroban contracts, typed TypeScript bindings, and an open indexer. Deploy a programme without asking anyone.',
    path: '#developers',
  },
];

/* ── The problem ─────────────────────────────────────────────────────────── */

export interface ProblemQuestion {
  n: string;
  question: string;
  detail: string;
}

export const PROBLEM_EYEBROW = 'The problem';
/** The heading is drawn in three parts so "selection." can be struck through. */
export const PROBLEM_HEADING = { before: 'Most grant tools stop at', struck: 'selection.', after: 'Milepost starts there.' };
export const PROBLEM_FOOT =
  'Milepost answers all three by tying each payment to a signed proof, and keeping every release on a public record.';

export const PROBLEM_QUESTIONS: ProblemQuestion[] = [
  { n: '01', question: 'Did the money reach the person?', detail: 'A transparent vote, then a lump sum, then silence.' },
  {
    n: '02',
    question: 'Could they spend it on what it was for?',
    detail: 'Tuition, seeds, shifts worked. The purpose gets lost after the transfer.',
  },
  { n: '03', question: 'Can anyone prove it afterwards?', detail: 'The next funder starts from zero, every time.' },
];

/* ── How it works ────────────────────────────────────────────────────────── */

export type SquareState = 'released' | 'locked' | 'unawarded' | 'refundable';

export interface HowStep {
  title: string;
  /** Set on the three steps where money actually moves. */
  money?: 'Money in' | 'Money moves' | 'Money out';
  body: string;
  /** A worked line in mono under the body. */
  example?: string;
  /** Example reviewer votes, as many as the quorum; the one the award takes is marked. */
  votes?: { amount: string; median?: boolean }[];
  board: {
    /** How many of the 40 squares are in each state, in drawing order. */
    released: number;
    locked: number;
    unawarded: number;
    refundable: number;
    /** Squares ringed as "asked for", from the first. */
    asked?: number;
    figure: string;
    /** Bold opening phrase, then the rest of the caption. */
    lead: string;
    caption: string;
  };
}

/**
 * The seven steps of the money path, plus what happens after the release
 * window. The board figures follow one worked example: 10,000 contributed at
 * a 2.5% fee. The fee is set in the registry and capped at 10%
 * (`MAX_FEE_BPS` in `contracts/registry/src/lib.rs`).
 */
export const HOW_STEPS: HowStep[] = [
  {
    title: 'Contribute',
    money: 'Money in',
    body: 'Funders put money into a programme. The budget is contributions minus the protocol fee, which the protocol caps at 10%.',
    example: '10,000 in − 250 fee = 9,750 budget',
    board: {
      released: 0,
      locked: 0,
      unawarded: 40,
      refundable: 0,
      figure: '9,750',
      lead: '10,000 USDC contributed.',
      caption: 'After a 2.5% fee, 9,750 is the budget. Each square is 1/40 of it.',
    },
  },
  {
    title: 'Apply',
    body: "Each applicant states how much they need. One person needs 200 for exam fees, another 5,000 for tuition. Splitting equally isn't funding.",
    board: {
      released: 0,
      locked: 0,
      unawarded: 40,
      refundable: 0,
      asked: 28,
      figure: '9,750',
      lead: 'Applicants ask for what they need:',
      caption: '200, 1,800, 5,000. Together they ask for about 7 of every 10 squares.',
    },
  },
  {
    title: 'Review',
    body: 'Each reviewer approves an amount, up to what was asked. Here the quorum is five.',
    votes: [
      { amount: '4,200' },
      { amount: '4,500' },
      { amount: '4,800', median: true },
      { amount: '5,000' },
      { amount: '5,000' },
    ],
    board: {
      released: 0,
      locked: 0,
      unawarded: 40,
      refundable: 0,
      asked: 28,
      figure: '9,750',
      lead: 'Reviewers vote an amount',
      caption: 'for each applicant, never more than was asked.',
    },
  },
  {
    title: 'Finalize',
    body: 'The award is the middle vote once the quorum is in, never an average. Anyone can press it, and the budget can never be exceeded.',
    board: {
      released: 0,
      locked: 28,
      unawarded: 12,
      refundable: 0,
      figure: '6,825 awarded',
      lead: 'Awards set at the middle vote.',
      caption: '6,825 is now awarded but locked. Nothing has left the programme.',
    },
  },
  {
    title: 'Attest',
    body: 'A trusted verifier, such as a school, clinic or field partner, signs that the condition was met.',
    board: {
      released: 0,
      locked: 28,
      unawarded: 12,
      refundable: 0,
      figure: '6,825 awarded',
      lead: 'A verifier signs',
      caption: "that a condition was met. The proof is ready, but the money hasn't moved yet.",
    },
  },
  {
    title: 'Release',
    money: 'Money moves',
    body: "One valid proof unlocks one tranche. A proof can't be used twice in the same programme.",
    board: {
      released: 10,
      locked: 18,
      unawarded: 12,
      refundable: 0,
      figure: '2,437 released',
      lead: 'The proof unlocks one tranche.',
      caption: 'Those squares are released, and the rest stay locked until their own proof.',
    },
  },
  {
    title: 'Spend',
    money: 'Money out',
    body: 'Where it goes depends on the payment mode: a verified payee, an escrow the recipient controls, a policy wallet, or the recipient directly.',
    board: {
      released: 10,
      locked: 18,
      unawarded: 12,
      refundable: 0,
      figure: '2,437 released',
      lead: 'The released money goes out',
      caption: "according to the award's mode, for example straight to a verified clinic or supplier.",
    },
  },
  {
    title: 'After the window',
    body: "Whatever wasn't paid out goes back to funders in proportion to what each put in: a fair share of what is left.",
    board: {
      released: 10,
      locked: 0,
      unawarded: 0,
      refundable: 30,
      figure: '7,313 refundable',
      lead: 'The window closes.',
      caption: 'Everything unpaid goes back to funders in proportion to what each put in.',
    },
  },
];

const BOARD_SQUARES = 40;

/** The state of each of the 40 squares for a step, in drawing order. */
export function boardSquares(board: HowStep['board']): SquareState[] {
  const out: SquareState[] = [];
  const push = (state: SquareState, count: number) => {
    for (let i = 0; i < count && out.length < BOARD_SQUARES; i += 1) out.push(state);
  };
  push('released', board.released);
  push('locked', board.locked);
  push('unawarded', board.unawarded);
  push('refundable', board.refundable);
  return out;
}

/* ── Payment modes ───────────────────────────────────────────────────────── */

export type FlowIcon = 'programme' | 'escrow' | 'payee' | 'recipient' | 'wallet' | 'unknown';

export interface FlowNode {
  icon: FlowIcon;
  title: string;
  note: string;
  /** How the node is drawn: money held, a checked destination, or unchecked. */
  kind?: 'hold' | 'end' | 'risk';
}

export interface LandingMode {
  /** Matches `ModeName` in `lib/modes.ts`, which holds the strength ranking. */
  name: 'Allocated' | 'Direct' | 'Restricted' | 'Open';
  label: string;
  where: string;
  who: string;
  tradeoff: string;
  /** False where the trade-off is a weakness the reader should not miss. */
  sound: boolean;
  flow: FlowNode[];
  /** True when nothing checks the last hop of the flow. */
  unchecked?: boolean;
}

/** Strongest guarantee first, the order every list of modes uses. */
export const LANDING_MODES: LandingMode[] = [
  {
    name: 'Allocated',
    label: 'Depends on nothing outside the contract',
    where: 'Held in escrow for the recipient',
    who: 'The recipient picks among verified payees, and when',
    tradeoff:
      'The money never leaves the contract until it reaches a verified payee, and the recipient still chooses. Use this when you can.',
    sound: true,
    flow: [
      { icon: 'programme', title: 'Programme', note: 'Award released after the proof' },
      { icon: 'escrow', title: 'Escrow', note: 'Held for the recipient', kind: 'hold' },
      { icon: 'payee', title: 'Verified payee', note: 'Chosen by the recipient', kind: 'end' },
    ],
  },
  {
    name: 'Direct',
    label: 'Accountable, but the recipient never holds it',
    where: 'Straight to a verified payee',
    who: 'Whoever finalizes the award, at that moment',
    tradeoff:
      'Fully accountable, but the recipient has no say. The school, clinic or supplier is fixed when the award is set.',
    sound: true,
    flow: [
      { icon: 'programme', title: 'Programme', note: 'Award released after the proof' },
      { icon: 'payee', title: 'Verified payee', note: 'Fixed at award time', kind: 'end' },
    ],
  },
  {
    name: 'Restricted',
    label: 'The policy limits one signer, not the wallet',
    where: "Into the recipient's smart wallet, behind a spending policy",
    who: "The recipient, within the policy's payees and cap",
    tradeoff:
      'The policy limits one signer, not the whole wallet. A misconfigured wallet quietly becomes unrestricted.',
    sound: false,
    flow: [
      { icon: 'programme', title: 'Programme', note: 'Award released after the proof' },
      { icon: 'wallet', title: "Recipient's smart wallet", note: 'Spending policy on one signer', kind: 'hold' },
      { icon: 'payee', title: 'Allowed payees', note: 'Within the cap, if configured', kind: 'end' },
    ],
    unchecked: true,
  },
  {
    name: 'Open',
    label: 'Nothing checks it after release',
    where: 'Straight to the recipient',
    who: 'The recipient, freely',
    tradeoff:
      "Simplest and most respectful of the recipient's choices. Nothing checks where the money goes after release.",
    sound: false,
    flow: [
      { icon: 'programme', title: 'Programme', note: 'Award released after the proof' },
      { icon: 'recipient', title: 'Recipient', note: 'Their own wallet', kind: 'hold' },
      { icon: 'unknown', title: 'Anywhere', note: 'Not tracked', kind: 'risk' },
    ],
    unchecked: true,
  },
];

/* ── Sectors ─────────────────────────────────────────────────────────────── */

export interface Sector {
  /** Short name on the pill. */
  pill: string;
  /** Full name in the table. */
  name: string;
  /** The three slots of "X confirms Y, and Z gets paid." */
  verifier: string;
  confirms: string;
  paid: string;
  /** The same three, as table cells. */
  condition: string;
  payee: string;
}

/**
 * Education is one row among six. The contracts carry no subject matter; a
 * verifier, a condition and a payee are all a programme needs.
 */
export const SECTORS: Sector[] = [
  {
    pill: 'Education',
    name: 'Education',
    verifier: 'The school',
    confirms: 'enrolment for the term',
    paid: 'the school, for tuition,',
    condition: 'Enrolled for the term',
    payee: 'The school, for tuition',
  },
  {
    pill: 'Health stipends',
    name: 'Health worker stipends',
    verifier: 'The district clinic',
    confirms: 'the shifts worked this month',
    paid: 'the health worker',
    condition: 'Shifts worked this month',
    payee: 'The health worker',
  },
  {
    pill: 'Farm inputs',
    name: 'Agricultural inputs',
    verifier: 'An extension officer',
    confirms: 'the land is prepared for planting',
    paid: 'an approved seed supplier',
    condition: 'Land prepared for planting',
    payee: 'An approved seed and fertiliser supplier',
  },
  {
    pill: 'Vocational',
    name: 'Vocational training',
    verifier: 'The training centre',
    confirms: 'the module is completed',
    paid: 'the training centre',
    condition: 'Module completed',
    payee: 'The training centre',
  },
  {
    pill: 'Humanitarian cash',
    name: 'Humanitarian cash',
    verifier: 'A field partner',
    confirms: 'the household was reached',
    paid: 'the household',
    condition: 'Household registered and reached',
    payee: 'The household',
  },
  {
    pill: 'SME microgrants',
    name: 'SME microgrants',
    verifier: 'A business mentor',
    confirms: 'a business-plan milestone',
    paid: 'the business',
    condition: 'Business-plan milestone met',
    payee: 'The business or its suppliers',
  },
];

/* ── The people ──────────────────────────────────────────────────────────── */

export interface Person {
  who: string;
  does: string;
  wallet: string;
}

export const PEOPLE: Person[] = [
  { who: 'Funders', does: 'Contribute, follow releases, claim a proportional refund.', wallet: 'Wallet needed' },
  { who: 'Recipients', does: 'Apply, release proven tranches, carry their standing.', wallet: 'Wallet needed' },
  {
    who: 'Programme creators',
    does: 'Deploy and run a programme: payees, verifiers, pause, cancel, extend.',
    wallet: 'Wallet needed',
  },
  {
    who: 'Visitors and anyone',
    does: 'Browse freely. Anyone can finalize awards or sweep leftovers, on purpose.',
    wallet: 'Browsing: no wallet',
  },
];

/* ── Why Stellar ─────────────────────────────────────────────────────────── */

export interface StellarPoint {
  /** Whether this exists today or is only on the roadmap. Never blurred. */
  today: boolean;
  title: string;
  body: string;
}

export const STELLAR_POINTS: StellarPoint[] = [
  {
    today: true,
    title: 'Five Soroban contracts',
    body: 'Programme logic, attestations and standing live on chain. Each programme pays in its own asset: XLM on testnet, USDC in our examples.',
  },
  {
    today: true,
    title: 'Sign in with Freighter',
    body: 'Use the Freighter browser wallet. You pay your own network fees, which on Stellar are a tiny fraction of a cent.',
  },
  {
    today: false,
    title: 'Cash out to local money',
    body: "Stellar anchors (SEP-24 and SEP-31) are why the network fits this work. Milepost doesn't connect to any anchor yet.",
  },
];

/* ── Guarantees and limits ───────────────────────────────────────────────── */

export interface Claim {
  title: string;
  detail: string;
}

/**
 * What the contracts promise. Each line is checked against the module docs in
 * `contracts/program/src/lib.rs` (budget, refund, sweep, one proof per
 * tranche) and `contracts/record/src/lib.rs` (standing), not paraphrased from
 * memory. Standing is not called permanent: ledger entries expire unless
 * someone extends them.
 */
export const GUARANTEES: Claim[] = [
  { title: 'The budget is never exceeded.', detail: 'Awards stop when the money does.' },
  {
    title: 'Unused money goes back to funders, in proportion.',
    detail: 'What nobody claims is swept to the treasury after a grace period.',
  },
  { title: 'One proof, one tranche.', detail: "An attestation can't be reused in the same programme." },
  {
    title: 'Standing travels with the recipient.',
    detail: 'A non-transferable record of totals received and delivered. Counts only, never a list.',
  },
];

/** What they don't. Stated at the same weight as the guarantees, on purpose. */
export const LIMITS: Claim[] = [
  {
    title: "First to finalize decides who's funded.",
    detail:
      "Finalize is open to anyone so no applicant is stranded. When a programme is oversubscribed, the budget is protected but the ordering isn't fair.",
  },
  {
    title: 'Lists are advisory.',
    detail:
      'The contracts keep no lists. A public index rebuilds them every few hours, and anything you act on is re-read on chain first.',
  },
  { title: 'Restricted mode is weaker than it looks.', detail: 'Its policy limits one signer, not the whole wallet.' },
  {
    title: 'Testnet, pre-audit.',
    detail:
      "Don't put real money in yet. One attestation can unlock a tranche in two programmes that trust the same verifier, by design.",
  },
];

/* ── For developers ──────────────────────────────────────────────────────── */

export const REPO_URL = 'https://github.com/milepost-labs/milepost';

/** The published bindings, one package per contract. */
export const INSTALL_COMMAND =
  'npm install @milepost/registry @milepost/program @milepost/attest @milepost/record @milepost/policy-spend';

export interface ContractLine {
  name: string;
  description: string;
  href?: string;
}

/** The contracts under their real names. The registry keeps no list of programmes. */
export const CONTRACTS: ContractLine[] = [
  { name: 'registry', description: 'Deploys programmes and holds the protocol fee and treasury.' },
  { name: 'program', description: 'Contributions, applications, votes, middle-vote awards, tranches, refunds.' },
  { name: 'attest', description: 'Schemas and the signed proofs verifiers issue, with revocation.' },
  { name: 'record', description: "The recipient's non-transferable record of totals." },
  { name: 'policy_spend', description: 'The smart-wallet policy behind Restricted mode.' },
  {
    name: 'milepost-indexer',
    description: 'Reads contract events and publishes the lists, because the contracts keep none.',
    href: 'https://github.com/milepost-labs/milepost-indexer',
  },
];

/**
 * `docs/end-to-end-tutorial.md` does not exist in the repository yet, so it is
 * not linked. Add it back once that doc exists.
 */
export const DOC_LINKS = [
  { label: 'README', href: `${REPO_URL}#readme` },
  { label: 'Contributing', href: `${REPO_URL}/blob/main/CONTRIBUTING.md` },
  { label: 'Glossary', href: `${REPO_URL}/blob/main/docs/glossary.md` },
  { label: 'Security policy', href: `${REPO_URL}/blob/main/SECURITY.md` },
  { label: 'Licence', href: `${REPO_URL}/blob/main/LICENSE` },
];

/* ── Footer ──────────────────────────────────────────────────────────────── */

export interface FooterGroup {
  heading: string;
  links: { label: string; path: string }[];
}

/**
 * Between them the groups cover every route in `APP_ROUTES`, so nothing the
 * app's navigation exposes is unreachable from the landing page.
 * `routes.test.ts` checks that stays true.
 */
export const FOOTER_GROUPS: FooterGroup[] = [
  {
    heading: 'Use',
    links: [
      { label: 'Programmes', path: '/directory' },
      { label: 'Programme detail', path: '/programme' },
      { label: 'Fund', path: '/funders' },
      { label: 'Get funded', path: '/recipients' },
      { label: 'Verify', path: '/verifiers' },
      { label: 'Spend policy', path: '/policy' },
    ],
  },
  {
    heading: 'Check',
    links: [
      { label: 'Attestation lookup', path: '/attestations' },
      { label: 'Receipt lookup', path: '/funders/receipt' },
      { label: 'Propose a programme', path: '/funders/propose' },
      { label: 'Standing', path: '/recipients/standing' },
      { label: 'Award progress', path: '/recipients/award-progress' },
      { label: 'Application timeline', path: '/recipients/application-timeline' },
      { label: 'Index status', path: '/status' },
    ],
  },
  {
    heading: 'Run',
    links: [
      { label: 'Deploy a programme', path: '/admin' },
      { label: 'Finalize awards', path: '/finalize' },
      { label: 'Payee management', path: '/admin/payees' },
      { label: 'Register a schema', path: '/schemas/register' },
      { label: 'Standing writers', path: '/admin/standing' },
      { label: 'Keepalive', path: '/keepalive' },
      { label: 'About this deployment', path: '/about' },
    ],
  },
];

/**
 * Copy for the landing page's content sections.
 *
 * Kept out of `Home.tsx` so tests can check it against the app's routes
 * without rendering the page. This is real copy, not stand-in data, so none
 * of it is named FIXTURE_.
 */

export interface RoleLink {
  label: string;
  path: string;
}

export interface Role {
  role: string;
  does: string;
  body: string;
  links: RoleLink[];
}

/**
 * Between them the links cover every role route in `APP_ROUTES`, so nothing
 * the navbar exposes is unreachable from this section. `routes.test.ts`
 * checks that stays true.
 */
export const ROLES: Role[] = [
  {
    role: 'Funder',
    does: 'Commit money to a programme',
    body: 'Contribute, follow every release, and get unawarded funds back in proportion.',
    links: [
      { label: 'Funder dashboard', path: '/funders' },
      { label: 'Browse programmes', path: '/directory' },
      { label: 'Programme detail', path: '/programme' },
    ],
  },
  {
    role: 'Recipient',
    does: 'Apply, then receive in tranches',
    body: 'Request what you need, track each tranche, and carry your standing to the next programme.',
    links: [
      { label: 'Recipient dashboard', path: '/recipients' },
      { label: 'Award progress', path: '/recipients/award-progress' },
      { label: 'Application timeline', path: '/recipients/application-timeline' },
      { label: 'Standing', path: '/recipients/standing' },
      { label: 'Spend policy', path: '/policy' },
    ],
  },
  {
    role: 'Verifier',
    does: 'Attest that a condition was met',
    body: 'Each attestation you sign unlocks exactly one tranche for one recipient. You never decide how much anyone gets.',
    links: [
      { label: 'Verifier dashboard', path: '/verifiers' },
      { label: 'Look up attestations', path: '/attestations' },
    ],
  },
  {
    role: 'Admin',
    does: 'Deploy and settle programmes',
    body: 'Configure schemas and programmes through the registry, and finalize awards.',
    links: [
      { label: 'Registry admin', path: '/admin' },
      { label: 'Finalize awards', path: '/finalize' },
      { label: 'Register schema', path: '/schemas/register' },
      { label: 'Standing lookup', path: '/admin/standing' },
    ],
  },
];

/**
 * The four ways someone arrives at the page, in their own words, each a
 * direct link to the route for that role. This is landing section 2 — the
 * cards sit directly below the hero so a visitor does not have to read the
 * whole page to find their own door.
 *
 * `path` must be a route the app actually serves; `routes.test.ts` checks it.
 */
export interface RoleEntry {
  /** The role stated as the visitor would say it, not as the protocol names it. */
  want: string;
  /** The dashboard this card opens, used for the quieter second line. */
  role: string;
  path: string;
}

export const ROLE_ENTRIES: RoleEntry[] = [
  { want: 'I want to fund', role: 'Funder', path: '/funders' },
  { want: 'I need funding', role: 'Recipient', path: '/recipients' },
  { want: 'I confirm conditions', role: 'Verifier', path: '/verifiers' },
  { want: 'I run programmes', role: 'Admin', path: '/admin' },
];

/**
 * Landing section 3. The project exists because grant tooling stops at
 * selection; this states that plainly, then asks the three questions the rest
 * of the product answers. `eyebrow` is rendered in `--refund`, not the accent,
 * so the section reads as a problem rather than a feature.
 */
export interface ProblemQuestion {
  n: string;
  question: string;
}

export const PROBLEM_EYEBROW = 'The problem';
export const PROBLEM_HEADING = 'Most grant tools stop at selection.';
export const PROBLEM_BODY =
  'They make the vote transparent, transfer a lump sum, and end. Milepost is about everything after the transfer.';

export const PROBLEM_QUESTIONS: ProblemQuestion[] = [
  { n: '01', question: 'Did the money reach the person?' },
  { n: '02', question: 'Could they spend it on the thing it was for?' },
  { n: '03', question: 'Can anyone prove it afterwards?' },
];

export interface Claim {
  title: string;
  detail: string;
}

/**
 * What the contracts promise. Each line is checked against the module docs in
 * `contracts/program/src/lib.rs` (budget, refund, sweep) and
 * `contracts/record/src/lib.rs` (standing), not paraphrased from memory.
 */
export const GUARANTEES: Claim[] = [
  {
    title: 'The budget is never exceeded',
    detail: 'Awards that would overspend are rejected by the contract, whatever order they arrive in.',
  },
  {
    title: 'Unused money goes back',
    detail:
      'Once the release window closes, contributors can claim back their share of anything never paid out, in proportion to what they put in. What nobody claims is swept to the treasury after a grace period.',
  },
  {
    title: 'Standing travels with the recipient',
    detail:
      'A non-transferable record of what someone received and delivered, across every programme, that the next funder can underwrite against.',
  },
];

/** What they don't. Stated at the same weight as the guarantees, on purpose. */
export const LIMITS: Claim[] = [
  {
    title: 'Anyone can finalize, so order matters',
    detail:
      'Finalize is permissionless so no one can strand an applicant by not pressing a button. When a programme is oversubscribed, whoever finalizes first decides who is funded. The budget is protected; ordering fairness is not.',
  },
  {
    title: 'Published lists are advisory',
    detail:
      'The index is rebuilt from events every few hours. Every entry is re-checked on-chain before it is acted on.',
  },
];

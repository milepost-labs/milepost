/**
 * Pure view logic for the programme directory.
 *
 * Kept out of the page component so the filtering, counting and copy rules can
 * be unit-tested without rendering. Everything here works over a
 * {@link DirectoryProgramme}, which pairs an index entry (name, id, creator,
 * ledger) with a chain read (phase, mode, amounts) so the card has one shape to
 * render regardless of which source is real.
 */

import { formatAmount } from './amount';
import type { IndexedProgramme } from './indexer';
import { isProgrammeContractId } from './registryVerification';
import { chainFor,
  FIXTURE_CHAIN,
  FIXTURE_PROGRAMMES,
  type FixtureChainRead,
  type FixturePhase,
} from '../fixtures/programmes';
import type { ProgrammeChainRead } from './programmeReads';
import type { UserRole } from '../fixtures/userRoles';

/**
 * The one decision for whether a programme is a sample.
 *
 * A programme is a sample only when its id is listed in the fixture set AND is
 * not a contract id. The second condition is the guard: a fixture can never
 * claim a registry-deployed programme, even if someone adds a real id to
 * `FIXTURE_PROGRAMMES` by mistake.
 */
export function isSampleProgrammeId(id: string): boolean {
  return !isProgrammeContractId(id) && FIXTURE_PROGRAMMES.some((p) => p.id === id);
}

export type DirectoryPhase = 'All' | FixturePhase;

/** Filter pills, in display order. */
export const DIRECTORY_PHASES: DirectoryPhase[] = ['All', 'Open', 'Review', 'Settled', 'Cancelled'];

export const DIRECTORY_SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'closing-soonest', label: 'Closing soonest' },
  { value: 'largest-budget', label: 'Largest budget' },
] as const;

export type DirectorySort = (typeof DIRECTORY_SORTS)[number]['value'];

export const DEFAULT_DIRECTORY_SORT: DirectorySort = 'newest';

/**
 * The directory's own query keys, in the order they are rebuilt.
 *
 * A programme link carries these through from the directory, so the header's
 * "All programmes" link can hand the reader back the filtered list they came
 * from. Anything else in the URL did not come from the directory and is
 * dropped rather than replayed.
 */
const DIRECTORY_PARAM_KEYS = ['q', 'phase', 'sort', 'yours'] as const;

/** The directory filter query a programme link carries, without the leading "?". */
export function directorySearch(search: string): string {
  const input = new URLSearchParams(search);
  const carried = new URLSearchParams();
  for (const key of DIRECTORY_PARAM_KEYS) {
    const value = input.get(key);
    if (value) carried.set(key, value);
  }
  return carried.toString();
}

/** "/directory", with whatever filters the current URL carried from it. */
export function directoryHref(search: string): string {
  const carried = directorySearch(search);
  return carried ? `/directory?${carried}` : '/directory';
}

export interface DirectoryProgramme {
  id: string;
  name: string;
  creator: string | null;
  createdLedger: number | null;
  /** True for stand-in entries, so the card can tag them. See {@link isSampleProgrammeId}. */
  sample: boolean;
  chain: FixtureChainRead;
  /** The current user's roles in this programme, if signed in. */
  userRoles?: UserRole[];
  /**
   * Where the entry came from: the published index, or the registry walk that
   * stands in for it when the index is unreachable or has not caught up. A
   * registry-only entry has no name — the contract stores none — so the card
   * shows the id until the index catches up.
   */
  source?: 'index' | 'registry';
  /**
   * True once this entry's figures were read from the chain (see
   * {@link hydrateRealProgrammes}). Until then a real entry's `chain` holds
   * fixture-default stand-ins that must not be presented as live figures.
   */
  real?: boolean;
}

/**
 * Pair the published index with the stand-in set. Real entries come first;
 * fixture entries are appended after deduping on id so a fixture that happens
 * to name a real programme does not render twice.
 *
 * `registryOnlyIds` — the registry's own programme addresses — join between
 * the two: they are real programmes the index does not name yet, so they rank
 * with real entries, marked by source so the card can say where they came
 * from. Names live only in the index, so a registry-only entry shows its id.
 */
export function mergeProgrammes(
  index: IndexedProgramme[] | null | undefined,
  userRoles?: Record<string, UserRole[]>,
  options?: { showSamples?: boolean },
  registryOnlyIds?: readonly string[],
): DirectoryProgramme[] {
  const seen = new Set<string>();
  const out: DirectoryProgramme[] = [];

  for (const entry of index ?? []) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push({
      id: entry.id,
      name: entry.name ?? 'Unnamed programme',
      creator: entry.creator,
      createdLedger: entry.createdLedger,
      sample: false,
      chain: chainFor(entry.id),
      userRoles: userRoles?.[entry.id],
      source: 'index',
    });
  }

  for (const id of registryOnlyIds ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: id,
      creator: null,
      createdLedger: null,
      sample: false,
      chain: chainFor(id),
      userRoles: userRoles?.[id],
      source: 'registry',
    });
  }

  const includeSamples = options?.showSamples ?? true;
  if (includeSamples) {
    for (const entry of FIXTURE_PROGRAMMES) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push({
        id: entry.id,
        name: entry.name ?? 'Unnamed programme',
        creator: entry.creator,
        createdLedger: entry.createdLedger,
        sample: true,
        chain: FIXTURE_CHAIN[entry.id] ?? chainFor(entry.id),
        userRoles: userRoles?.[entry.id],
      });
    }
  for (const entry of FIXTURE_PROGRAMMES) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push({
      id: entry.id,
      name: entry.name ?? 'Unnamed programme',
      creator: entry.creator,
      createdLedger: entry.createdLedger,
      sample: isSampleProgrammeId(entry.id),
      chain: FIXTURE_CHAIN[entry.id] ?? chainFor(entry.id),
      userRoles: userRoles?.[entry.id],
    });
  }

  return out;
}

/**
 * One programme's real chain read, mapped onto the card's chain shape so the
 * view logic below stays single-sourced.
 *
 * The contract only records `budget` (contributions less the fee), and the
 * fee rate on top: the donor-facing `contributed` figure is derived back from
 * it, rounding up so a displayed contribution never under-covers the budget.
 * When the fee rate did not read, no rate is invented — the whole amount is
 * shown as budget and the fee half of the derivation is left at zero.
 *
 * Returns null when the read lacks a phase or a budget: a card without them
 * still says "reading the chain", it never shows a guessed phase.
 */
export function chainFromRead(
  read: ProgrammeChainRead,
  now: Date = new Date(),
): FixtureChainRead | null {
  if (read.phase === null || read.budget === null) return null;

  const budget = read.budget;
  const fee = read.feeBps === null ? 0n : deriveFee(budget, BigInt(read.feeBps));
  const contributed = budget + fee;

  const closesInDays =
    read.phase === 'Open' && read.applyDeadline !== null
      ? daysUntil(read.applyDeadline, now)
      : undefined;

  return {
    phase: read.phase,
    contributed: contributed.toString(),
    fee: fee.toString(),
    awarded: (read.granted ?? 0n).toString(),
    released: (read.released ?? 0n).toString(),
    refundable: (read.refunded ?? 0n).toString(),
    quorum: read.quorum ?? 0,
    closesInDays,
  };
}

/** The fee taken from the contribution that left `budget` awardable. */
function deriveFee(budget: bigint, feeBps: bigint): bigint {
  const FEE_DENOMINATOR = 10_000n;
  const rate = FEE_DENOMINATOR - feeBps;
  if (rate <= 0n) return 0n;
  const contributed = (budget * FEE_DENOMINATOR + rate - 1n) / rate;
  return contributed - budget;
}

/** Days until a Unix-seconds deadline, or undefined once it has passed. */
function daysUntil(deadline: bigint, now: Date): number | undefined {
  const ms = Number(deadline) * 1000 - now.getTime();
  if (Number.isNaN(ms) || ms <= 0) return undefined;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/**
 * Fill in real programmes' figures from their settled chain reads, leaving
 * fixtures and anything still reading untouched — a real card whose read has
 * not landed yet is in {@link ProgrammeCard} terms still "reading the chain".
 */
export function hydrateRealProgrammes(
  programmes: DirectoryProgramme[],
  reads: Record<string, ProgrammeChainRead>,
): DirectoryProgramme[] {
  return programmes.map((programme) => {
    if (programme.sample || programme.real) return programme;
    const read = reads[programme.id];
    if (!read) return programme;
    const chain = chainFromRead(read);
    if (!chain) return programme;
    return { ...programme, chain, real: true };
  });
}

/** Where a card's foot tag. One line, never two proof-of-source claims. */
export function programmeSourceTag(programme: {
  sample: boolean;
  real?: boolean;
  source?: 'index' | 'registry';
}): string {
  if (programme.sample) return 'Sample data';
  if (!programme.real) return 'Reading the chain…';
  if (programme.source === 'registry') return 'Not in the index yet';
  return 'Live on chain';
}

export function matchesQuery(programme: DirectoryProgramme, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return programme.name.toLowerCase().includes(q) || programme.id.toLowerCase().includes(q);
}

/** Programmes matching both the search text, phase pill and optionally the "yours" filter. */
export function filterProgrammes(
  all: DirectoryProgramme[],
  query: string,
  phase: DirectoryPhase,
  yoursOnly = false,
): DirectoryProgramme[] {
  return all.filter(
    (programme) =>
      matchesQuery(programme, query) &&
      (phase === 'All' || programme.chain.phase === phase) &&
      (!yoursOnly || (programme.userRoles != null && programme.userRoles.length > 0)),
  );
}

function budgetOf(programme: DirectoryProgramme): bigint {
  return BigInt(programme.chain.contributed || '0') - BigInt(programme.chain.fee || '0');
}

function compareBigIntDesc(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function compareNewest(left: DirectoryProgramme, right: DirectoryProgramme): number {
  return (right.createdLedger ?? -1) - (left.createdLedger ?? -1);
}

function compareClosingSoonest(left: DirectoryProgramme, right: DirectoryProgramme): number {
  const leftDays = left.chain.closesInDays ?? Number.POSITIVE_INFINITY;
  const rightDays = right.chain.closesInDays ?? Number.POSITIVE_INFINITY;
  if (leftDays !== rightDays) return leftDays - rightDays;
  return compareNewest(left, right);
}

/** Sort choices for the directory. Amounts stay as BigInt stroops. */
export function sortProgrammes(
  programmes: DirectoryProgramme[],
  sort: DirectorySort = DEFAULT_DIRECTORY_SORT,
): DirectoryProgramme[] {
  return [...programmes].sort((left, right) => {
    switch (sort) {
      case 'closing-soonest':
        return compareClosingSoonest(left, right);
      case 'largest-budget': {
        const budgetOrder = compareBigIntDesc(budgetOf(left), budgetOf(right));
        return budgetOrder === 0 ? compareNewest(left, right) : budgetOrder;
      }
      case 'newest':
        return compareNewest(left, right);
    }
  });
}

/** Counts per pill, over programmes matching the current search text. */
export function phaseCounts(all: DirectoryProgramme[], query: string): Record<DirectoryPhase, number> {
  const matching = all.filter((programme) => matchesQuery(programme, query));
  const counts = {} as Record<DirectoryPhase, number>;
  for (const phase of DIRECTORY_PHASES) {
    counts[phase] =
      phase === 'All'
        ? matching.length
        : matching.filter((programme) => programme.chain.phase === phase).length;
  }
  return counts;
}

/** One sentence per phase, describing where the programme is. */
export function programmeStatus(chain: FixtureChainRead): string {
  switch (chain.phase) {
    case 'Open':
      return `Taking contributions and applications${
        chain.applicants !== undefined ? ` · ${chain.applicants} applied` : ''
      }${chain.closesInDays ? ` · closes in ${chain.closesInDays} days` : ''}`;
    case 'Review':
      return `${
        chain.applicants !== undefined ? `Reviewers are voting on ${chain.applicants} applications.` : 'Reviewers are voting.'
      } Awards are not final.`;
    case 'Settled':
      return 'Awards are final. Tranches release as verifiers confirm conditions.';
    case 'Cancelled':
      return 'Cancelled. Contributors can claim their share of what was not paid out, in proportion to their contribution and after the protocol fee.';
  }
}

/** The card's call to action, which varies by phase. */
export function programmeCta(phase: FixturePhase): string {
  return {
    Open: 'Fund or apply',
    Review: 'Follow review',
    Settled: 'See releases',
    Cancelled: 'Claim refund',
  }[phase];
}

export function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;
}

/** Humanised age of the index, e.g. "3 h ago". */
export function formatAgo(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Stroop string/bigint → "1,260,000 USDC" (no trailing ".00"). */
export function formatUsdc(stroops: string | bigint): string {
  const value = typeof stroops === 'bigint' ? stroops : BigInt(stroops || '0');
  const formatted = formatAmount(value, { decimals: 2 }).replace(/\.00$/, '');
  return `${formatted} USDC`;
}

/**
 * The n-square money row, coloured by bucket: released, then awarded-but-locked,
 * then refundable (from the right), with the remainder shown as unawarded.
 */
export function moneySquares(chain: FixtureChainRead, n: number): string[] {
  const budget = BigInt(chain.contributed || '0') - BigInt(chain.fee || '0');
  if (budget <= 0n) return Array.from({ length: n }, () => 'var(--surface-raised)');

  const share = (stroops: string): number => {
    const value = BigInt(stroops || '0');
    const scaled = (value * BigInt(n) + budget / 2n) / budget;
    if (scaled <= 0n) return 0;
    if (scaled >= BigInt(n)) return n;
    return Number(scaled);
  };

  const released = share(chain.released);
  const awarded = share(chain.awarded);
  const refundable = share(chain.refundable);

  return Array.from({ length: n }, (_, i) => {
    if (i < released) return 'var(--accent)';
    if (i < awarded) return 'var(--locked)';
    if (i >= n - refundable) return 'var(--refund)';
    return 'var(--accent-soft)';
  });
}

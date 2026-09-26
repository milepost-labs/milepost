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
import {
  chainFor,
  FIXTURE_CHAIN,
  FIXTURE_PROGRAMMES,
  type FixtureChainRead,
  type FixturePhase,
} from '../fixtures/programmes';

export type DirectoryPhase = 'All' | FixturePhase;

/** Filter pills, in display order. */
export const DIRECTORY_PHASES: DirectoryPhase[] = ['All', 'Open', 'Review', 'Settled', 'Cancelled'];

export interface DirectoryProgramme {
  id: string;
  name: string;
  creator: string | null;
  createdLedger: number | null;
  /** True for stand-in entries, so the card can tag them. */
  sample: boolean;
  chain: FixtureChainRead;
}

/**
 * Pair the published index with the stand-in set. Real entries come first;
 * fixture entries are appended after deduping on id so a fixture that happens
 * to name a real programme does not render twice.
 */
export function mergeProgrammes(index: IndexedProgramme[] | null | undefined): DirectoryProgramme[] {
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
      sample: true,
      chain: FIXTURE_CHAIN[entry.id] ?? chainFor(entry.id),
    });
  }

  return out;
}

export function matchesQuery(programme: DirectoryProgramme, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return programme.name.toLowerCase().includes(q) || programme.id.toLowerCase().includes(q);
}

/** Programmes matching both the search text and the phase pill. */
export function filterProgrammes(
  all: DirectoryProgramme[],
  query: string,
  phase: DirectoryPhase,
): DirectoryProgramme[] {
  return all.filter(
    (programme) => matchesQuery(programme, query) && (phase === 'All' || programme.chain.phase === phase),
  );
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
      return `Taking contributions and applications · ${chain.applicants} applied${
        chain.closesInDays ? ` · closes in ${chain.closesInDays} days` : ''
      }`;
    case 'Review':
      return `Reviewers are voting on ${chain.applicants} applications. Awards are not final.`;
    case 'Settled':
      return 'Awards are final. Tranches release as verifiers confirm conditions.';
    case 'Cancelled':
      return 'Cancelled. Contributors can claim a full refund.';
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
  const budget = Number(chain.contributed) - Number(chain.fee);
  if (budget <= 0) return Array.from({ length: n }, () => 'var(--surface-raised)');
  const released = Math.round((Number(chain.released) / budget) * n);
  const awarded = Math.round((Number(chain.awarded) / budget) * n);
  const refundable = Math.round((Number(chain.refundable) / budget) * n);

  return Array.from({ length: n }, (_, i) => {
    if (i < released) return 'var(--accent)';
    if (i < awarded) return 'var(--locked)';
    if (i >= n - refundable) return 'var(--refund)';
    return 'var(--accent-soft)';
  });
}

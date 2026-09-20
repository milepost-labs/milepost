/**
 * The published index.
 *
 * The contracts store everything under per-address keys and keep no lists, so
 * there is no on-chain way to ask "who holds an award in this programme?".
 * [milepost-indexer](https://github.com/milepost-labs/milepost-indexer) reads
 * the events, rebuilds the lists and publishes them as static JSON every hour.
 *
 * **A list here says where to look, never what is true.** Every entry must be
 * read back from the contract before the app shows it as fact: the index can
 * be minutes behind, and a wrong entry must only ever cost an extra read, not
 * put something false on screen. A failed fetch is likewise not an error worth
 * blocking a screen for — fall back to whatever the page can do without it.
 */

const DEFAULT_BASE = 'https://milepost-labs.github.io/milepost-indexer/v1';

/** Trailing slashes are dropped so a configured URL with one still builds valid paths. */
export const INDEXER_BASE_URL = (import.meta.env.VITE_INDEXER_URL || DEFAULT_BASE).replace(/\/+$/, '');

export interface IndexerMeta {
  network: string;
  /** The registry the index follows. A different one means it has been rebuilt for a new deployment. */
  registry: string;
  fromLedger: number;
  indexedToLedger: number;
  /** ISO 8601, from the run that published this. */
  indexedAt: string;
  /** False when indexing started after the deployment, so early events are missing. */
  complete: boolean;
  /** True when runs stopped for longer than the RPC keeps events, so some were lost. */
  gap: boolean;
  /** `<contract>:<Event>` → how many events no handler covers yet. */
  unhandledEvents: Record<string, number>;
}

export interface IndexedProgramme {
  id: string;
  /** Recorded only in the creation event, so null for a programme created before the indexer's window. */
  name: string | null;
  creator: string | null;
  createdLedger: number | null;
}

export interface IndexedAward {
  recipient: string;
  /** Stroops as a decimal string, because JSON numbers cannot hold an i128. Parse with BigInt. */
  granted: string;
  released: string;
  tranches: number;
  tranchesReleased: number;
  payee: string;
  /** `Direct`, `Allocated`, `Restricted` or `Open`. */
  mode: string;
  /** Ledger of the event this entry was taken from; amounts are as of then. */
  updatedLedger: number;
}

async function readJson<T>(path: string): Promise<T> {
  const url = `${INDEXER_BASE_URL}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The index returned ${response.status} for ${path}.`);
  return (await response.json()) as T;
}

export function fetchMeta(): Promise<IndexerMeta> {
  return readJson<IndexerMeta>('meta.json');
}

export function fetchProgrammes(): Promise<IndexedProgramme[]> {
  return readJson<IndexedProgramme[]>('programmes.json');
}

/** The awards in one programme. Empty for a programme with none; 404 for one the index has never seen. */
export function fetchAwards(programmeId: string): Promise<IndexedAward[]> {
  return readJson<IndexedAward[]>(`programmes/${programmeId}/awards.json`);
}

/**
 * How old `indexedAt` may be before the index counts as stale.
 *
 * The workflow asks to run hourly, but GitHub starts scheduled runs when it
 * has capacity: across twelve consecutive days, a sibling repository's daily
 * job started between 4 and 5.8 hours after its cron time, never on time. A
 * threshold of a few hours would therefore report a healthy index as stopped
 * almost every time. Twelve hours is past any delay observed, so crossing it
 * means indexing has genuinely stopped rather than queued.
 */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function isStale(meta: IndexerMeta, now: number = Date.now()): boolean {
  const indexedAt = Date.parse(meta.indexedAt);
  if (Number.isNaN(indexedAt)) return true;
  return now - indexedAt > STALE_AFTER_MS;
}

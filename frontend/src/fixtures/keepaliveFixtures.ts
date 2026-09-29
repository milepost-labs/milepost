/**
 * Stand-in data for the keepalive screen (`/keepalive`).
 *
 * Every export here is named `FIXTURE_*` and is **shaped like the read it
 * stands in for**, so replacing it with the real call is a change of source
 * rather than a change of shape:
 *
 * - `FIXTURE_TTL` is shaped like per-entry TTL reads (ledgers left, shown as
 *   days) for one programme: the programme contract itself plus its awards,
 *   contributions, and applications/votes entries. Unwired.
 *
 * Anything rendered from these is tagged in the UI as "Sample data" so it is
 * never mistaken for a live figure. One `grep` for `FIXTURE_` finds all of it.
 */

/** Shaped like a per-entry TTL read. */
export interface FixtureTtlEntry {
  key: string;
  label: string;
  note: string;
  /** Days of life remaining, derived from ledgers left. */
  liveForDays: number;
}

/** Shaped like per-entry TTL reads (ledgers left, shown as days). Unwired. */
export const FIXTURE_TTL: FixtureTtlEntry[] = [
  { key: 'instance', label: 'Programme contract', note: 'Terms, phase and budget', liveForDays: 61 },
  { key: 'awards', label: 'Awards', note: '4 entries', liveForDays: 12 },
  { key: 'contribs', label: 'Contributions', note: '9 entries, needed for refunds', liveForDays: 44 },
  { key: 'apps', label: 'Applications and votes', note: '23 entries', liveForDays: 27 },
];

/** Days of life remaining below which an entry is close to expiry. */
export const TTL_WARNING_DAYS = 30;

/** Days of life an entry is extended to, matching the contract bump. */
export const TTL_EXTENDED_DAYS = 90;

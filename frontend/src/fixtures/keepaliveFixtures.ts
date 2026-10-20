/**
 * Stand-in data for the keepalive screen (`/keepalive`).
 *
 * Every export here is named `FIXTURE_*` and is **shaped like the read it
 * stands in for**, so replacing it with the real call is a change of source
 * rather than a change of shape:
 *
 * - `FIXTURE_TTL` is shaped like per-entry TTL reads (ledgers left, shown as
 *   days) for one programme. Unwired. Each row also names the real keepalive
 *   call that extends it, so the buttons send transactions even while the
 *   displayed lifetime is still sample data.
 *
 * Anything rendered from these is tagged in the UI as "Sample data" so it is
 * never mistaken for a live figure. One `grep` for `FIXTURE_` finds all of it.
 */

export type KeepaliveTarget =
  /** `program.keepalive(subject)`: the contract instance and that subject's entries. */
  | { contract: 'program' }
  /** `record.keepalive(subject)`: the subject's standing entry. */
  | { contract: 'record' }
  /** `attest.keepalive(uid)`: one attestation. */
  | { contract: 'attest'; uid: string };

/** Shaped like a per-entry TTL read. */
export interface FixtureTtlEntry {
  key: string;
  label: string;
  note: string;
  /** Days of life remaining, derived from ledgers left. */
  liveForDays: number;
  /** The keepalive call that actually extends this entry. */
  target: KeepaliveTarget;
}

/** A 32-byte sample id, only there to show the attestation row's shape. */
export const FIXTURE_ATTESTATION_UID = 'a9f21c3e0b7d4e11c2d3e4f5061728394a5b6c7d8e9f00112233445566778899';

/** Shaped like per-entry TTL reads (ledgers left, shown as days). Unwired. */
export const FIXTURE_TTL: FixtureTtlEntry[] = [
  {
    key: 'instance',
    label: 'Programme contract',
    note: 'Terms, phase and budget',
    liveForDays: 61,
    target: { contract: 'program' },
  },
  {
    key: 'awards',
    label: 'Awards',
    note: '4 entries',
    liveForDays: 12,
    target: { contract: 'program' },
  },
  {
    key: 'contribs',
    label: 'Contributions',
    note: '9 entries, needed for refunds',
    liveForDays: 44,
    target: { contract: 'program' },
  },
  {
    key: 'apps',
    label: 'Applications and votes',
    note: '23 entries',
    liveForDays: 27,
    target: { contract: 'program' },
  },
  {
    key: 'attestation',
    label: 'Attestation proof',
    note: 'One release proof',
    liveForDays: 18,
    target: { contract: 'attest', uid: FIXTURE_ATTESTATION_UID },
  },
  {
    key: 'standing',
    label: 'Recipient standing',
    note: 'The portable record',
    liveForDays: 25,
    target: { contract: 'record' },
  },
];

/** Days of life remaining below which an entry is close to expiry. */
export const TTL_WARNING_DAYS = 30;

/** Days of life an entry is extended to, matching the contract bump. */
export const TTL_EXTENDED_DAYS = 90;

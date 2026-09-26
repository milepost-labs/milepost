/**
 * Stand-in data for the verifier screen (`/verifiers`).
 *
 * Every export here is named `FIXTURE_*` and is **shaped like the read it
 * stands in for**, so replacing it with the real call is a change of source
 * rather than a change of shape:
 *
 * - `FIXTURE_VERIFIER_QUEUE` stands in for the claims waiting on this verifier
 *   (unwired — needs an indexer handler).
 * - `FIXTURE_MY_ATTESTATIONS` stands in for this verifier's own attestations
 *   with whether each one has released a tranche yet (unwired — needs an
 *   indexer handler).
 *
 * Until those handlers exist, the verifier's own attestations are kept in
 * browser storage. That is a stand-in, not a design decision: the helpers
 * below are the only place that touches `localStorage` for attestations, so
 * one `grep` for `FIXTURE_` (or `verifierFixtures`) finds every bit of it to
 * replace. Revocation status is always re-read on-chain rather than trusted
 * from local memory.
 *
 * Anything rendered from these is tagged in the UI as "Sample data" so it is
 * never mistaken for a live figure.
 */

/** Shaped like one entry of the verifier queue read. */
export interface FixtureQueueEntry {
  id: string;
  programmeId: string;
  programme: string;
  subject: string;
  schema: string;
  condition: string;
  tranche: number;
  tranches: number;
  requestedLedger: number;
}

/** Shaped like an `attest.get` result, as the "Signed by you" list needs it. */
export interface FixtureAttestation {
  /** Attestation UID, hex. */
  uid: string;
  programmeId: string;
  programme: string;
  subject: string;
  schema: string;
  ledger: number;
  /** Whether this attestation has already released a tranche. */
  used: boolean;
}

/**
 * An attestation this verifier created through the app, kept locally because
 * — like awards — there is no on-chain "attestations by attester" list until an
 * indexer lands. `uid` is stored hex. Revocation status is read back on-chain
 * rather than trusted from local memory.
 */
export interface AttestRecord {
  uid: string;
  subject: string;
  schemaUid: string;
  /** Whether this attestation has been used to release a tranche. */
  used: boolean;
}

export const FIXTURE_VERIFIER_QUEUE: FixtureQueueEntry[] = [
  {
    id: 'q1',
    programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    programme: 'Secondary school bursaries 2026',
    subject: 'GA6TJW…5RBN',
    schema: 'condition-met/v1',
    condition: 'Shifts for September confirmed',
    tranche: 2,
    tranches: 3,
    requestedLedger: 4852611,
  },
  {
    id: 'q3',
    programmeId: 'CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB',
    programme: 'SME supplier microgrants Q2',
    subject: 'GDR2VN…9MXT',
    schema: 'invoice-approved/v1',
    condition: 'Supplier invoice for milestone 1 approved',
    tranche: 1,
    tranches: 2,
    requestedLedger: 4849907,
  },
];

/** This verifier's own attestations. Currently kept in browser storage (see below); unwired. */
export const FIXTURE_MY_ATTESTATIONS: FixtureAttestation[] = [
  {
    uid: 'att_9f21…c3e0',
    programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    programme: 'Secondary school bursaries 2026',
    subject: 'GA6TJW…5RBN',
    schema: 'condition-met/v1',
    ledger: 4846120,
    used: true,
  },
  {
    uid: 'att_4b7d…11af',
    programmeId: 'CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB',
    programme: 'SME supplier microgrants Q2',
    subject: 'GBQX4M…7KDA',
    schema: 'invoice-approved/v1',
    ledger: 4838402,
    used: false,
  },
];

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

export const attestationStorageKey = (attester: string) =>
  `milepost:verifier-attestations:${attester}`;

export function loadAttestations(attester: string): AttestRecord[] {
  try {
    const stored = window.localStorage.getItem(attestationStorageKey(attester));
    if (stored) {
      const parsed = JSON.parse(stored) as AttestRecord[];
      return Array.isArray(parsed)
        ? parsed.filter((r) => HEX_32_BYTES.test(r.uid) && STELLAR_ADDRESS.test(r.subject))
        : [];
    }
  } catch {
    // Corrupt or inaccessible storage — treat as empty.
  }
  return [];
}

export function saveAttestations(attester: string, records: AttestRecord[]) {
  try {
    window.localStorage.setItem(attestationStorageKey(attester), JSON.stringify(records));
  } catch {
    // Best-effort only — the record is still usable for this session.
  }
}

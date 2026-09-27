/**
 * Stand-in data for the verifier queue screen (`/verifiers`).
 *
 * Shaped like the reads it stands in for so swapping to the real source is a
 * change of source, not a rewrite:
 *
 * - `FIXTURE_VERIFIER_QUEUE` is shaped like a pending-release read joined with
 *   the programme's schema: one entry per claim waiting on this verifier
 *   (condition text, programme, tranche position, recipient, schema, and the
 *   ledger the claim was requested at).
 * - `FIXTURE_MY_ATTESTATIONS` is shaped like the verifier's own attestations
 *   (currently kept in browser storage in `VerifierDashboard.tsx` — unwired
 *   until an indexer handler publishes them).
 *
 * Anything rendered from these is tagged in the UI with a "Sample data" pill.
 */

export interface VerifierQueueItem {
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

export interface VerifierAttestation {
  uid: string;
  programmeId: string;
  programme: string;
  subject: string;
  schema: string;
  ledger: number;
  used: boolean;
}

export const FIXTURE_VERIFIER_QUEUE: VerifierQueueItem[] = [
  {
    id: 'q1',
    programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    programme: 'Secondary school bursaries 2026',
    subject: 'GBQX4M7KDA9X2P5R8T1W3Y6ZQ4N7B2V5C8X1M7KDA9X2P',
    schema: 'condition-met/v1',
    condition: 'Shifts for September confirmed',
    tranche: 2,
    tranches: 3,
    requestedLedger: 4852210,
  },
  {
    id: 'q2',
    programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    programme: 'Secondary school bursaries 2026',
    subject: 'GC7HLP2WQE4R6T8Y1U3I5O7P9A2S4D6F8G1H3J5K7L9M2',
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
    subject: 'GDR2VN9MXT4B7KQ1W8E5R3T6Y2U9I4O7P3A6S2D5F8G1',
    schema: 'invoice-approved/v1',
    condition: 'Supplier invoice for milestone 1 approved',
    tranche: 1,
    tranches: 2,
    requestedLedger: 4849907,
  },
];

export const FIXTURE_MY_ATTESTATIONS: VerifierAttestation[] = [
  {
    uid: 'att_9f21c3e0d4a7b8e1f2c3d4a5b6e7f8091a2b3c4d5e6f7',
    programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
    programme: 'Secondary school bursaries 2026',
    subject: 'GA6TJW5RBN8X2K4M7Q9W1E3R5T7Y2U4I6O8P1A3S5D7F',
    schema: 'condition-met/v1',
    ledger: 4846120,
    used: true,
  },
  {
    uid: 'att_4b7d11afc2e89d3a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8',
    programmeId: 'CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB',
    programme: 'SME supplier microgrants Q2',
    subject: 'GBQX4M7KDA9X2P5R8T1W3Y6ZQ4N7B2V5C8X1M7KDA9X2P',
    schema: 'invoice-approved/v1',
    ledger: 4838402,
    used: false,
  },
];

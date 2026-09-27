/**
 * Attestation lookup stand-in.
 *
 * Shaped like an `attest.get(uid)` read, plus the two facts the contract
 * itself cannot answer without a programme in hand (`used`) or an index
 * (`revoked` is real, but there is no `attest` call to search by subject or
 * attester — only to fetch one uid at a time). Search stays fixture-backed
 * until an indexer handler publishes a searchable list; swapping it in is a
 * change of source; the shape here already matches the real read.
 */
export interface AttestationFixture {
  uid: string;
  schema: string;
  attester: string;
  subject: string;
  data: Record<string, string | number>;
  ledger: number;
  revoked: boolean;
  used: boolean;
}

export const FIXTURE_ATTESTATIONS: AttestationFixture[] = [
  {
    uid: 'a9f21c3e0b7d4e11',
    schema: 'condition-met/v1',
    attester: 'GCVR4TGK5YV3QW3K4Y2D6V8M9J8QHN',
    subject: 'GA6TJWQPX8N2K5M9L4R7V3D18Y5RBN',
    data: { tranche: 1 },
    ledger: 4846120,
    revoked: false,
    used: true,
  },
  {
    uid: 'a4b7d11af82c9e03',
    schema: 'invoice-approved/v1',
    attester: 'GDLX2PV4V7L8Z1M5N2K9C3WKA4R9B',
    subject: 'GBQX4MW3T9K2L7P1N5V8R4D6Y7KDA',
    data: { tranche: 2, invoice_ref: 'INV-2026-0418' },
    ledger: 4838402,
    revoked: false,
    used: false,
  },
  {
    uid: 'c15e9a2d64f0b833',
    schema: 'condition-met/v1',
    attester: 'GCVR4TGK5YV3QW3K4Y2D6V8M9J8QHN',
    subject: 'GDPQ9K3M7L1N4R8V2W5Y9T6D3B2LMN',
    data: { tranche: 1 },
    ledger: 4801774,
    revoked: true,
    used: false,
  },
];

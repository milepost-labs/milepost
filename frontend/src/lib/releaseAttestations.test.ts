import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import type { Attestation } from '@milepost/attest';
import type { AttestationMatch } from './attestationSearch';
import { filterReleaseAttestations } from './releaseAttestations';

const SCHEMA_HEX = 'ab'.repeat(32);
const OTHER_SCHEMA_HEX = 'cd'.repeat(32);
const SUBJECT = `G${'S'.repeat(55)}`;
const VERIFIER = `G${'V'.repeat(55)}`;
const NON_VERIFIER = `G${'N'.repeat(55)}`;
const NOW = 1_800_000_000;

function makeAttestation(overrides: Partial<Attestation> = {}): Attestation {
  return {
    uid: Buffer.from('11'.repeat(32), 'hex'),
    schema: Buffer.from(SCHEMA_HEX, 'hex'),
    attester: VERIFIER,
    subject: SUBJECT,
    data: Buffer.alloc(0),
    created_at: BigInt(NOW - 3600),
    expires_at: undefined,
    revoked_at: undefined,
    ...overrides,
  } as Attestation;
}

function makeMatch(uidByte: string, overrides: Partial<AttestationMatch> = {}): AttestationMatch {
  const uid = uidByte.repeat(32);
  return {
    uid,
    role: 'subject',
    subject: SUBJECT,
    ledger: 1000,
    attestation: makeAttestation({ uid: Buffer.from(uid, 'hex') }),
    ...overrides,
  };
}

describe('filterReleaseAttestations', () => {
  it('offers valid, unused attestations from a current verifier under the programme schema', async () => {
    const valid = makeMatch('11');
    const result = await filterReleaseAttestations({
      matches: [valid],
      schemaHex: SCHEMA_HEX,
      isVerifier: vi.fn(async (addr) => addr === VERIFIER),
      isSpent: vi.fn(async () => false),
      nowSeconds: NOW,
    });

    expect(result).toEqual([{ uid: '11'.repeat(32), attester: VERIFIER, ledger: 1000 }]);
  });

  it('excludes used, revoked, expired, wrong-schema, non-verifier, non-subject, and unreadable attestations', async () => {
    const spentUid = '22'.repeat(32);
    const matches: AttestationMatch[] = [
      makeMatch('11'), // valid -> kept
      makeMatch('22'), // spent -> excluded
      makeMatch('33', {
        attestation: makeAttestation({ revoked_at: BigInt(NOW - 10) }),
      }), // revoked -> excluded
      makeMatch('44', {
        attestation: makeAttestation({ expires_at: BigInt(NOW - 1) }),
      }), // expired -> excluded
      makeMatch('55', {
        attestation: makeAttestation({ schema: Buffer.from(OTHER_SCHEMA_HEX, 'hex') }),
      }), // wrong schema -> excluded
      makeMatch('66', {
        attestation: makeAttestation({ attester: NON_VERIFIER }),
      }), // non-verifier -> excluded
      makeMatch('77', { role: 'attester' }), // recipient is attester, not subject -> excluded
      makeMatch('88', { attestation: null }), // unreadable / archived -> excluded
    ];

    const result = await filterReleaseAttestations({
      matches,
      schemaHex: SCHEMA_HEX,
      isVerifier: vi.fn(async (addr) => addr === VERIFIER),
      isSpent: vi.fn(async (uid) => Buffer.from(uid).toString('hex') === spentUid),
      nowSeconds: NOW,
    });

    expect(result).toEqual([{ uid: '11'.repeat(32), attester: VERIFIER, ledger: 1000 }]);
  });
});

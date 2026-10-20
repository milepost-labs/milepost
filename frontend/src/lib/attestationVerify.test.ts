import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import type { Client as AttestClient } from '@milepost/attest';
import { validateVerifyClaimInput, verifyClaim, verifyClaimOnChain } from './attestationVerify';
import { FIXTURE_ATTESTATIONS } from '../fixtures/attestationFixtures';

// Issue #539. `verifyClaimOnChain` is what AttestationLookup calls: it reads the
// record with `attest.get`, asks `attest.verify` for the verdict, and explains a
// failed verdict from the record. Whether a proof was already used comes from
// `program.is_spent` and is covered in AttestationLookup.test.tsx.

const SUBJECT = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const ATTESTER = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const UID = '11'.repeat(32);
const SCHEMA = '22'.repeat(32);
const claim = { uid: UID, subject: SUBJECT, schema: SCHEMA, attester: ATTESTER };

const record = (overrides: Record<string, unknown> = {}) => ({
  uid: Buffer.from(UID, 'hex'),
  schema: Buffer.from(SCHEMA, 'hex'),
  subject: SUBJECT,
  attester: ATTESTER,
  data_hash: Buffer.alloc(32),
  created_at: 100n,
  expires_at: undefined,
  revoked_at: undefined,
  ...overrides,
});

function attestClient({
  stored = record(),
  verified = true,
  getError,
  verifyError,
}: {
  stored?: ReturnType<typeof record>;
  verified?: boolean;
  getError?: unknown;
  verifyError?: unknown;
} = {}) {
  const get = vi.fn(async () => {
    if (getError) throw getError;
    return { result: { unwrap: () => stored } };
  });
  const verify = vi.fn(async () => {
    if (verifyError) throw verifyError;
    return { result: verified };
  });
  return { client: { get, verify } as unknown as AttestClient, get, verify };
}

describe('verifyClaimOnChain', () => {
  it.each([
    ['valid', { verified: true }, { valid: true }],
    [
      'revoked',
      { verified: false, stored: record({ revoked_at: 200n }) },
      { valid: false, reason: 'This attestation has been revoked by its attester.' },
    ],
    [
      'revoked and expired reads as revoked',
      { verified: false, stored: record({ revoked_at: 200n, expires_at: 150n }) },
      { valid: false, reason: 'This attestation has been revoked by its attester.' },
    ],
    [
      'expired',
      { verified: false, stored: record({ expires_at: 150n }) },
      { valid: false, reason: 'This attestation expired at Unix timestamp 150.' },
    ],
    [
      'about another subject',
      { verified: false, stored: record({ subject: ATTESTER }) },
      { valid: false, reason: 'This attestation is not about the subject you gave.' },
    ],
    [
      'under another schema',
      { verified: false, stored: record({ schema: Buffer.from('33'.repeat(32), 'hex') }) },
      { valid: false, reason: 'This attestation was made under a different schema.' },
    ],
    [
      'by another attester',
      { verified: false, stored: record({ attester: SUBJECT }) },
      { valid: false, reason: 'This attestation was not made by the attester you gave.' },
    ],
    [
      'refused for a reason the record does not show',
      { verified: false },
      { valid: false, reason: 'The claim does not pass verification.' },
    ],
  ])('%s', async (_name, options, expected) => {
    const { client } = attestClient(options);
    expect(await verifyClaimOnChain(client, claim)).toMatchObject(expected);
  });

  it('passes the claim to attest.verify as the contract expects', async () => {
    const { client, get, verify } = attestClient();
    await verifyClaimOnChain(client, { ...claim, subject: ` ${SUBJECT} ` });
    expect(get).toHaveBeenCalledWith({ uid: Buffer.from(UID, 'hex') });
    expect(verify).toHaveBeenCalledWith({
      uid: Buffer.from(UID, 'hex'),
      subject: SUBJECT,
      schema: Buffer.from(SCHEMA, 'hex'),
      attester: ATTESTER,
    });
  });

  it.each([
    ['the Result error the SDK throws on unwrap', new Error('AttestationNotFound')],
    ['a simulation failure carrying the code', new Error('HostError: Error(Contract, #3)')],
  ])('reports not found for %s', async (_name, getError) => {
    const { client, verify } = attestClient({ getError });
    expect(await verifyClaimOnChain(client, claim)).toEqual({
      valid: false,
      reason: 'No attestation exists with this id.',
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('rethrows an RPC failure reading the record instead of calling it not found', async () => {
    const getError = new Error('Failed to fetch');
    const { client } = attestClient({ getError });
    await expect(verifyClaimOnChain(client, claim)).rejects.toBe(getError);
  });

  it('rethrows an RPC failure from verify instead of calling the claim invalid', async () => {
    const verifyError = new Error('timeout');
    const { client } = attestClient({ verifyError });
    await expect(verifyClaimOnChain(client, claim)).rejects.toBe(verifyError);
  });
});

describe('fixture claim validation', () => {
  const validClaim = claim;
  const fixtureClaim = {
    uid: 'a4b7d11af82c9e03',
    schema: 'invoice-approved/v1',
    subject: 'GBQX4MW3T9K2L7P1N5V8R4D6Y7KDA',
    attester: 'GDLX2PV4V7L8Z1M5N2K9C3WKA4R9B',
  };

  it('accepts a complete claim and reports each invalid field', () => {
    expect(validateVerifyClaimInput(validClaim)).toEqual({});
    expect(
      validateVerifyClaimInput({ uid: '', subject: '', schema: '', attester: 'not-an-address' }),
    ).toEqual({
      uid: 'Enter the attestation id to check.',
      subject: 'Enter the subject address.',
      schema: 'Enter the schema uid.',
      attester: 'That does not look like a Stellar address.',
    });
  });

  it.each([
    ['subject', { ...validClaim, subject: 'not-an-address' }, 'That does not look like a Stellar address.'],
    ['attester', { ...validClaim, attester: 'not-an-address' }, 'That does not look like a Stellar address.'],
    ['uid', { ...validClaim, uid: 'a4b7d11af82c9e03' }, 'Enter the 64-character hex attestation uid.'],
    ['schema', { ...validClaim, schema: 'invoice-approved/v1' }, 'Enter the 64-character hex schema uid.'],
  ])('validates an invalid %s address', (_field, input, message) => {
    expect(validateVerifyClaimInput(input)).toHaveProperty(_field, message);
  });

  it('explains missing, revoked, mismatched and valid fixture claims', () => {
    expect(verifyClaim(FIXTURE_ATTESTATIONS, { ...fixtureClaim, uid: 'missing' })).toEqual({
      valid: false,
      reason: 'No attestation exists with this id.',
    });
    expect(verifyClaim(FIXTURE_ATTESTATIONS, { ...fixtureClaim, uid: 'c15e9a2d64f0b833' })).toEqual({
      valid: false,
      reason: 'This attestation has been revoked by its attester.',
    });
    expect(verifyClaim(FIXTURE_ATTESTATIONS, { ...fixtureClaim, subject: 'other' })).toEqual({
      valid: false,
      reason: 'This attestation is not about the subject you gave.',
    });
    expect(verifyClaim(FIXTURE_ATTESTATIONS, { ...fixtureClaim, schema: 'other' })).toEqual({
      valid: false,
      reason: 'This attestation was made under a different schema.',
    });
    expect(verifyClaim(FIXTURE_ATTESTATIONS, { ...fixtureClaim, attester: 'other' })).toEqual({
      valid: false,
      reason: 'This attestation was not made by the attester you gave.',
    });
    expect(verifyClaim(FIXTURE_ATTESTATIONS, fixtureClaim)).toEqual({ valid: true });
  });
});

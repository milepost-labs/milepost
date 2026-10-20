import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  readAttestationStatus,
  validateVerifyClaimInput,
  verifyClaim,
  type AttestationVerifierClients,
} from './attestationVerify';
import { FIXTURE_ATTESTATIONS } from '../fixtures/attestationFixtures';

const uid = Buffer.from('attestation');

function clients({
  valid = true,
  revoked = false,
  used = false,
  getError,
  validError,
  spentError,
}: {
  valid?: boolean;
  revoked?: boolean;
  used?: boolean;
  getError?: unknown;
  validError?: unknown;
  spentError?: unknown;
} = {}): AttestationVerifierClients {
  return {
    attest: {
      is_valid: vi.fn(async () => {
        if (validError) throw validError;
        return { result: valid };
      }),
      get: vi.fn(async () => {
        if (getError) throw getError;
        return { result: { unwrap: () => ({ revoked_at: revoked ? 1 : null }) } };
      }),
    },
    program: {
      is_spent: vi.fn(async () => {
        if (spentError) throw spentError;
        return { result: used };
      }),
    },
  };
}

describe('readAttestationStatus', () => {
  it.each([
    ['valid', { valid: true }, { verdict: 'valid', used: false }],
    ['used', { valid: true, used: true }, { verdict: 'used', used: true }],
    ['revoked', { valid: false, revoked: true }, { verdict: 'revoked', used: false }],
    ['expired', { valid: false }, { verdict: 'expired', used: false }],
    ['revoked and used', { valid: false, revoked: true, used: true }, { verdict: 'revoked', used: true }],
  ] as const)('%s', async (_name, options, expected) => {
    await expect(readAttestationStatus(clients(options), uid)).resolves.toEqual(expected);
  });

  it('reports a missing attestation without treating it as an RPC failure', async () => {
    const missing = new Error('Error(Contract, #3)');
    const reader = clients({ valid: false, getError: missing });

    await expect(readAttestationStatus(reader, uid)).resolves.toEqual({ verdict: 'not_found' });
    expect(reader.program.is_spent).not.toHaveBeenCalled();
  });

  it('keeps an RPC failure distinct from an invalid attestation', async () => {
    const error = new Error('fetch failed');
    const reader = clients({ validError: error });

    await expect(readAttestationStatus(reader, uid)).resolves.toEqual({ verdict: 'error', error });
  });

  it('reports failures reading the record and spend state', async () => {
    const getError = new Error('timeout while reading attestation');
    await expect(readAttestationStatus(clients({ getError }), uid)).resolves.toEqual({
      verdict: 'error',
      error: getError,
    });

    const spentError = new Error('network unavailable');
    await expect(readAttestationStatus(clients({ spentError }), uid)).resolves.toEqual({
      verdict: 'error',
      error: spentError,
    });
  });
});

describe('fixture claim validation', () => {
  const validClaim = {
    uid: 'a4b7d11af82c9e03',
    subject: `G${'A'.repeat(55)}`,
    schema: 'invoice-approved/v1',
    attester: `G${'B'.repeat(55)}`,
  };
  const fixtureClaim = {
    ...validClaim,
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
      schema: 'Enter the schema.',
      attester: 'That does not look like a Stellar address.',
    });
  });

  it.each([
    ['subject', { ...validClaim, subject: 'not-an-address' }, 'That does not look like a Stellar address.'],
    ['attester', { ...validClaim, attester: 'not-an-address' }, 'That does not look like a Stellar address.'],
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

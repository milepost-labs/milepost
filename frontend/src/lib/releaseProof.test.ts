import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import type { Client as AttestClient } from '@milepost/attest';
import { PAUSED_REASON } from './paused';
import { checkReleaseProof, policyBlock, releaseGate } from './releaseProof';

const UID = '11'.repeat(32);
const SCHEMA = 'ab'.repeat(32);
const RECIPIENT = `G${'R'.repeat(55)}`;
const ATTESTER = `G${'V'.repeat(55)}`;

function attestWith(record: Record<string, unknown> | 'missing', verifies: boolean) {
  return {
    get: vi.fn(async () => {
      if (record === 'missing') throw new Error('AttestationNotFound');
      return { result: { unwrap: () => record } };
    }),
    verify: vi.fn(async () => ({ result: verifies })),
  } as unknown as AttestClient;
}

const goodRecord = {
  uid: Buffer.from(UID, 'hex'),
  schema: Buffer.from(SCHEMA, 'hex'),
  attester: ATTESTER,
  subject: RECIPIENT,
  expires_at: undefined,
  revoked_at: undefined,
};

const input = { uid: UID, attester: ATTESTER, recipient: RECIPIENT, schemaHex: SCHEMA };

describe('checkReleaseProof', () => {
  it('passes a proof that verifies, is unspent, from a verifier', async () => {
    const verdict = await checkReleaseProof(input, {
      attest: attestWith(goodRecord, true),
      isVerifier: async () => true,
      isSpent: async () => false,
    });
    expect(verdict).toEqual({ ok: true });
  });

  it('says when the attester is not a verifier', async () => {
    const verdict = await checkReleaseProof(input, {
      attest: attestWith(goodRecord, true),
      isVerifier: async () => false,
      isSpent: async () => false,
    });
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/not one of this programme’s verifiers/) });
  });

  it('says when the proof was already used', async () => {
    const verdict = await checkReleaseProof(input, {
      attest: attestWith(goodRecord, true),
      isVerifier: async () => true,
      isSpent: async () => true,
    });
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/already released/) });
  });

  it('says when the proof was revoked', async () => {
    const verdict = await checkReleaseProof(input, {
      attest: attestWith({ ...goodRecord, revoked_at: 5n }, false),
      isVerifier: async () => true,
      isSpent: async () => false,
    });
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/revoked/) });
  });

  it('says when the proof was made under another schema', async () => {
    const verdict = await checkReleaseProof(input, {
      attest: attestWith({ ...goodRecord, schema: Buffer.from('cd'.repeat(32), 'hex') }, false),
      isVerifier: async () => true,
      isSpent: async () => false,
    });
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/different schema/) });
  });

  it('says when no attestation has that id', async () => {
    const verdict = await checkReleaseProof(input, {
      attest: attestWith('missing', false),
      isVerifier: async () => true,
      isSpent: async () => false,
    });
    expect(verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/No attestation exists/) });
  });
});

describe('releaseGate', () => {
  const open = {
    phase: 'Settled' as const,
    releaseDeadline: 2_000_000_000n,
    nowMs: 1_700_000_000_000,
    signedIn: true,
    isRecipient: true,
  };

  it('is available in Settled, in the window, for the recipient', () => {
    expect(releaseGate(open).enabled).toBe(true);
  });

  it('gates on sign-in, role, phase and window, each with a reason', () => {
    expect(releaseGate({ ...open, signedIn: false })).toMatchObject({ enabled: false, reason: expect.stringMatching(/Sign in/) });
    expect(releaseGate({ ...open, isRecipient: false })).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/recipient’s wallet/),
    });
    expect(releaseGate({ ...open, phase: null })).toMatchObject({ enabled: false });
    expect(releaseGate({ ...open, phase: 'Review' })).toMatchObject({ enabled: false, reason: expect.stringMatching(/Settled/) });
    expect(releaseGate({ ...open, phase: 'Cancelled' })).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/cancelled/),
    });
    expect(releaseGate({ ...open, nowMs: 2_100_000_000_000 })).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/window closed/),
    });
  });

  it('is unavailable while paused, and available again once resumed', () => {
    expect(releaseGate({ ...open, paused: true })).toEqual({ enabled: false, reason: PAUSED_REASON });
    expect(releaseGate({ ...open, paused: false }).enabled).toBe(true);
  });
});

describe('policyBlock', () => {
  const wallet = `C${'W'.repeat(55)}`;

  it('does not apply outside Restricted mode or to a policy it cannot ask', () => {
    expect(policyBlock({ restricted: false, checkable: true, wallet: null, installed: null })).toBeNull();
    expect(policyBlock({ restricted: true, checkable: false, wallet, installed: false })).toBeNull();
  });

  it('waits while the wallet or the answer is being read', () => {
    expect(policyBlock({ restricted: true, checkable: true, wallet: null, installed: null })).toMatchObject({ missing: false });
    expect(policyBlock({ restricted: true, checkable: true, wallet, installed: null })).toMatchObject({ missing: false });
  });

  it('blocks when the policy is not installed, and clears once it is', () => {
    expect(policyBlock({ restricted: true, checkable: true, wallet, installed: false })).toMatchObject({
      missing: true,
      reason: expect.stringMatching(/not installed/),
    });
    expect(policyBlock({ restricted: true, checkable: true, wallet, installed: true })).toBeNull();
  });
});

import type { AttestationFixture } from '../fixtures/attestationFixtures';
import type { Buffer } from 'buffer';
import { extractCode } from './errors';

export interface OnChainAttestation {
  revoked_at: unknown;
}

interface ReadResult<T> {
  result: T;
}

interface FallibleRead<T> {
  unwrap: () => T;
}

export interface AttestationVerifierClients {
  attest: {
    is_valid: (args: { uid: Buffer }) => Promise<ReadResult<boolean>>;
    get: (args: { uid: Buffer }) => Promise<ReadResult<FallibleRead<OnChainAttestation>>>;
  };
  program: {
    is_spent: (args: { attestation: Buffer }) => Promise<ReadResult<boolean>>;
  };
}

export type AttestationVerdict = 'valid' | 'used' | 'revoked' | 'expired' | 'not_found' | 'error';

export interface AttestationStatus {
  verdict: AttestationVerdict;
  used?: boolean;
  error?: unknown;
}

/**
 * Reads the authoritative contracts and turns their separate answers into
 * the status a recipient should see before attempting a release.
 *
 * `is_valid` is deliberately not enough to distinguish expiry, revocation or
 * absence, so the stored record is fetched after an invalid result. A network
 * or RPC failure remains `error`; it must never be presented as an invalid
 * attestation.
 */
export async function readAttestationStatus(
  clients: AttestationVerifierClients,
  uid: Buffer,
): Promise<AttestationStatus> {
  let valid: boolean;
  try {
    valid = (await clients.attest.is_valid({ uid })).result;
  } catch (error) {
    return { verdict: 'error', error };
  }

  let attestation: OnChainAttestation;
  try {
    attestation = (await clients.attest.get({ uid })).result.unwrap();
  } catch (error) {
    if (extractCode(error) === 3) return { verdict: 'not_found' };
    return { verdict: 'error', error };
  }

  let used: boolean;
  try {
    used = (await clients.program.is_spent({ attestation: uid })).result;
  } catch (error) {
    return { verdict: 'error', error };
  }

  if (attestation.revoked_at !== undefined && attestation.revoked_at !== null) {
    return { verdict: 'revoked', used };
  }
  if (!valid) return { verdict: 'expired', used };
  return { verdict: used ? 'used' : 'valid', used };
}

/** A Stellar account address (`G...`), the shape `subject` and `attester` take. */
export const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

export interface VerifyClaimInput {
  uid: string;
  subject: string;
  schema: string;
  attester: string;
}

export interface VerifyClaimFieldErrors {
  uid?: string;
  subject?: string;
  schema?: string;
  attester?: string;
}

/**
 * Validates the three inputs `attest.verify` compares a claim against,
 * before spending a read on them — the same shape check the contract's own
 * `Address` and schema id arguments would fail on, surfaced up front instead
 * of as an opaque rejection.
 */
export function validateVerifyClaimInput(input: VerifyClaimInput): VerifyClaimFieldErrors {
  const errors: VerifyClaimFieldErrors = {};
  if (!input.uid.trim()) {
    errors.uid = 'Enter the attestation id to check.';
  }
  if (!input.subject.trim()) {
    errors.subject = 'Enter the subject address.';
  } else if (!STELLAR_ADDRESS.test(input.subject.trim())) {
    errors.subject = 'That does not look like a Stellar address.';
  }
  if (!input.schema.trim()) {
    errors.schema = 'Enter the schema.';
  }
  if (!input.attester.trim()) {
    errors.attester = 'Enter the attester address.';
  } else if (!STELLAR_ADDRESS.test(input.attester.trim())) {
    errors.attester = 'That does not look like a Stellar address.';
  }
  return errors;
}

export type VerifyClaimResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Mirrors `Attest::verify` from the attest contract: existing and unrevoked
 * is not enough (that's `is_valid`) — the claim must also be about the
 * subject given, under the schema given, from the attester given. The
 * contract answers with a bare bool; a person checking a claim needs to
 * know *which* part failed, so this walks the same checks `verify` makes,
 * in the same order, and stops at the first mismatch.
 *
 * Fixture-backed for the same reason the lookup above it is: `attest` has no
 * way to search by subject or attester, only to fetch one uid at a time, so
 * this stays stand-in data until it reads through the real bindings.
 */
export function verifyClaim(
  attestations: AttestationFixture[],
  input: VerifyClaimInput,
): VerifyClaimResult {
  const uid = input.uid.trim().toLowerCase();
  const attestation = attestations.find((a) => a.uid.toLowerCase() === uid);

  if (!attestation) {
    return { valid: false, reason: 'No attestation exists with this id.' };
  }
  if (attestation.revoked) {
    return { valid: false, reason: 'This attestation has been revoked by its attester.' };
  }
  if (attestation.subject.trim().toLowerCase() !== input.subject.trim().toLowerCase()) {
    return { valid: false, reason: 'This attestation is not about the subject you gave.' };
  }
  if (attestation.schema.trim().toLowerCase() !== input.schema.trim().toLowerCase()) {
    return { valid: false, reason: 'This attestation was made under a different schema.' };
  }
  if (attestation.attester.trim().toLowerCase() !== input.attester.trim().toLowerCase()) {
    return { valid: false, reason: 'This attestation was not made by the attester you gave.' };
  }
  return { valid: true };
}

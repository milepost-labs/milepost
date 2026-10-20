import { Buffer } from 'buffer';
import type { AttestationFixture } from '../fixtures/attestationFixtures';
import { extractCode } from './errors';
import type { Client as AttestClient, Attestation } from '@milepost/attest';

/** A Stellar account address (`G...`), the shape `subject` and `attester` take. */
export const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/** 64-char lowercase hex — a 32-byte on-chain uid. */
export const HEX_UID = /^[0-9a-fA-F]{64}$/;

export interface VerifyClaimInput {
  uid: string;
  subject: string;
  /** 64-char hex of the schema uid, as the on-chain call requires. */
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
  } else if (!HEX_UID.test(input.uid.trim())) {
    errors.uid = 'Enter the 64-character hex attestation uid.';
  }
  if (!input.subject.trim()) {
    errors.subject = 'Enter the subject address.';
  } else if (!STELLAR_ADDRESS.test(input.subject.trim())) {
    errors.subject = 'That does not look like a Stellar address.';
  }
  if (!input.schema.trim()) {
    errors.schema = 'Enter the schema uid.';
  } else if (!HEX_UID.test(input.schema.trim())) {
    errors.schema = 'Enter the 64-character hex schema uid.';
  }
  if (!input.attester.trim()) {
    errors.attester = 'Enter the attester address.';
  } else if (!STELLAR_ADDRESS.test(input.attester.trim())) {
    errors.attester = 'That does not look like a Stellar address.';
  }
  return errors;
}

/**
 * Whether a failed `attest.get` means the attestation does not exist.
 *
 * `get` returns `Result<Attestation>`, and the SDK's `unwrap()` throws the
 * variant's name ("AttestationNotFound") with no code. A call that fails in
 * simulation carries the code instead (`Error(Contract, #3)`).
 */
function isAttestationNotFound(caught: unknown): boolean {
  if (caught instanceof Error && caught.message === 'AttestationNotFound') return true;
  return extractCode(caught) === 3;
}

export type VerifyClaimResult =
  | { valid: true; attestation?: Attestation }
  | { valid: false; reason: string; attestation?: Attestation };

/**
 * Check a claim on-chain using `attest.verify`, then fetch the record with
 * `attest.get` so that — when the check fails — the UI can explain *why*
 * rather than just returning "No".
 *
 * `attest.verify` returns a bare `boolean` (no `Result` wrapper).
 * `attest.get` returns `Result<Attestation>` and must be `.unwrap()`ed.
 *
 * The reason derivation mirrors what `verifyClaim` did for fixtures:
 * we walk the same checks `verify` makes, in the same order, using the
 * on-chain record rather than a fixture array.
 */
export async function verifyClaimOnChain(
  attest: AttestClient,
  input: VerifyClaimInput,
): Promise<VerifyClaimResult> {
  const uidBuf = Buffer.from(input.uid.trim(), 'hex');
  const schemaBuf = Buffer.from(input.schema.trim(), 'hex');
  const subject = input.subject.trim();
  const attester = input.attester.trim();

  // First fetch the record so we can explain any failure.
  let attestation: Attestation | undefined;
  try {
    const getResult = await attest.get({ uid: uidBuf });
    attestation = getResult.result.unwrap();
  } catch (caught) {
    // Only AttestationNotFound (error 3) means there is no record. Anything
    // else — an unreachable RPC, a timeout — is rethrown, so it is shown as a
    // failed check rather than as an attestation that does not exist.
    if (isAttestationNotFound(caught)) {
      return { valid: false, reason: 'No attestation exists with this id.' };
    }
    throw caught;
  }

  // Then call verify — the authoritative boolean.
  const verifyResult = await attest.verify({ uid: uidBuf, subject, schema: schemaBuf, attester });
  const valid = verifyResult.result;

  if (valid) return { valid: true, attestation };

  // Not valid — derive the specific reason from the record.
  if (attestation.revoked_at !== null && attestation.revoked_at !== undefined) {
    return { valid: false, reason: 'This attestation has been revoked by its attester.', attestation };
  }
  if (attestation.subject.trim().toLowerCase() !== subject.toLowerCase()) {
    return { valid: false, reason: 'This attestation is not about the subject you gave.', attestation };
  }
  if (attestation.schema.toString('hex').toLowerCase() !== input.schema.trim().toLowerCase()) {
    return { valid: false, reason: 'This attestation was made under a different schema.', attestation };
  }
  if (attestation.attester.trim().toLowerCase() !== attester.toLowerCase()) {
    return { valid: false, reason: 'This attestation was not made by the attester you gave.', attestation };
  }
  // Expired or some other reason the contract knows about but the record does
  // not immediately surface.
  if (attestation.expires_at !== null && attestation.expires_at !== undefined) {
    return {
      valid: false,
      reason: `This attestation expired at Unix timestamp ${attestation.expires_at}.`,
      attestation,
    };
  }
  return { valid: false, reason: 'The claim does not pass verification.', attestation };
}

/**
 * Fixture-backed fallback for sample attestations — used when no real
 * `attest` client is available or the uid matches a known fixture.
 *
 * Mirrors `attest.verify` semantics: subject, schema, attester must all match.
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

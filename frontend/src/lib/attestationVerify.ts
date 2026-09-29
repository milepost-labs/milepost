import type { AttestationFixture } from '../fixtures/attestationFixtures';

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
    errors.uid = 'Enter the signed proof id to check.';
  }
  if (!input.subject.trim()) {
    errors.subject = 'Enter the subject address.';
  } else if (!STELLAR_ADDRESS.test(input.subject.trim())) {
    errors.subject = 'That does not look like a Stellar address.';
  }
  if (!input.schema.trim()) {
    errors.schema = 'Enter the claim template.';
  }
  if (!input.attester.trim()) {
    errors.attester = 'Enter the verifier address.';
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
    return { valid: false, reason: 'No signed proof exists with this id.' };
  }
  if (attestation.revoked) {
    return { valid: false, reason: 'This signed proof has been revoked by its verifier.' };
  }
  if (attestation.subject.trim().toLowerCase() !== input.subject.trim().toLowerCase()) {
    return { valid: false, reason: 'This signed proof is not about the subject you gave.' };
  }
  if (attestation.schema.trim().toLowerCase() !== input.schema.trim().toLowerCase()) {
    return { valid: false, reason: 'This signed proof was made under a different claim template.' };
  }
  if (attestation.attester.trim().toLowerCase() !== input.attester.trim().toLowerCase()) {
    return { valid: false, reason: 'This signed proof was not made by the verifier you gave.' };
  }
  return { valid: true };
}

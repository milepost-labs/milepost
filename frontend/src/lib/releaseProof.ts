import { Buffer } from 'buffer';
import type { Client as AttestClient } from '@milepost/attest';
import { verifyClaimOnChain } from './attestationVerify';
import { formatDate } from './format';
import { phaseRequirement, type Phase } from './phaseGate';

/**
 * Checks a recipient can run before signing a single release.
 *
 * `release` refuses a proof that was already used, revoked, expired, made under
 * another schema, or signed by someone who is not a verifier, and the
 * signature is wasted. Each of those can be read first. The contract stays the
 * final check: this only moves the common refusals in front of the signature.
 */

export type ProofVerdict = { ok: true } | { ok: false; reason: string };

export interface ProofCheckInput {
  /** 64-char hex attestation id. */
  uid: string;
  attester: string;
  /** The award's recipient, which the proof must be about. */
  recipient: string;
  /** 64-char hex id of the programme's schema. */
  schemaHex: string;
}

export interface ProofCheckReaders {
  attest: AttestClient;
  /** `program.is_verifier`. */
  isVerifier: (attester: string) => Promise<boolean>;
  /** `program.is_spent`. */
  isSpent: (uid: Buffer) => Promise<boolean>;
}

/**
 * Read the three things that decide whether a proof will release: whether the
 * attester is a verifier of this programme, whether the proof was spent, and
 * whether `attest.verify` accepts it (not revoked, not expired, right subject,
 * schema and attester). The first problem found is returned in plain words.
 */
export async function checkReleaseProof(input: ProofCheckInput, readers: ProofCheckReaders): Promise<ProofVerdict> {
  const uid = Buffer.from(input.uid.trim().replace(/^0x/, ''), 'hex');

  const [verifier, spent] = await Promise.all([readers.isVerifier(input.attester), readers.isSpent(uid)]);
  if (!verifier) {
    return {
      ok: false,
      reason: 'That address is not one of this programme’s verifiers. Only a verifier’s attestation releases a tranche.',
    };
  }
  if (spent) {
    return { ok: false, reason: 'This attestation has already released a tranche. Each proof works once.' };
  }

  const verdict = await verifyClaimOnChain(readers.attest, {
    uid: input.uid.trim().replace(/^0x/, ''),
    subject: input.recipient,
    schema: input.schemaHex,
    attester: input.attester,
  });
  if (!verdict.valid) return { ok: false, reason: verdict.reason };
  return { ok: true };
}

export interface ReleaseGateInput {
  /** Null until the phase has been read on-chain. */
  phase: Phase | null;
  /** Unix seconds; null until the config has been read. */
  releaseDeadline: bigint | null;
  nowMs: number;
  signedIn: boolean;
  /** Whether the connected wallet is the award's recipient. */
  isRecipient: boolean;
}

/** When may a tranche be released? Settled, inside the release window, by the recipient. */
export function releaseGate(input: ReleaseGateInput): { enabled: boolean; reason: string } {
  if (!input.signedIn) return { enabled: false, reason: 'Sign in to release a tranche.' };
  if (!input.isRecipient) {
    return { enabled: false, reason: 'Connect the recipient’s wallet to release this award’s tranches.' };
  }
  if (input.phase === null || input.releaseDeadline === null) {
    return { enabled: false, reason: 'Reading the programme’s phase and release window…' };
  }
  if (input.phase === 'Cancelled') {
    return { enabled: false, reason: 'This programme was cancelled, so nothing more can be released.' };
  }
  if (input.phase !== 'Settled') {
    return { enabled: false, reason: phaseRequirement('Settled', input.phase) };
  }
  if (input.nowMs / 1000 >= Number(input.releaseDeadline)) {
    return { enabled: false, reason: `The release window closed on ${formatDate(input.releaseDeadline)}.` };
  }
  return { enabled: true, reason: '' };
}

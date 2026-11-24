import { Buffer } from 'buffer';
import { formatDate } from './format';
import { phaseRequirement, type Phase } from './phaseGate';

/**
 * Releasing several tranches in one transaction (`release_batch`).
 *
 * Every attestation id in one call must come from the same attester, each is
 * verified exactly as in a single release, and one bad or spent proof refuses
 * the whole batch. This module holds the parts that need no network: reading
 * the ids someone pasted, refusing what the contract would refuse, and saying
 * when the action is available. Naming the proof the contract refused needs a
 * read, so that takes the clients as arguments.
 */

/** Matches `MAX_RELEASE_BATCH` in `contracts/program/src/lib.rs`: the most tranches whose events fit one transaction. */
export const MAX_RELEASE_BATCH = 10;

const HEX_64 = /^[0-9a-f]{64}$/;

/** The id as the contract takes it: 64 lowercase hex characters, or null. */
export function normaliseProofId(raw: string): string | null {
  const clean = raw.trim().toLowerCase().replace(/^0x/, '');
  return HEX_64.test(clean) ? clean : null;
}

export function proofIdToBuffer(id: string): Buffer {
  return Buffer.from(id, 'hex');
}

/** "3f1a…9c2d": enough of both ends to tell two ids apart. */
export function shortProof(id: string): string {
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

export interface ProofList {
  /** The valid ids, in the order they were given. */
  uids: string[];
  /** Entries that are not 64-character hex ids. */
  invalid: string[];
  /** Ids given more than once. A second use of one proof is always refused. */
  duplicates: string[];
}

/** Ids pasted one per line, or separated by spaces or commas. */
export function parseProofList(text: string): ProofList {
  const uids: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    if (token === '') continue;
    const id = normaliseProofId(token);
    if (id === null) invalid.push(token);
    else if (uids.includes(id)) {
      if (!duplicates.includes(id)) duplicates.push(id);
    } else uids.push(id);
  }
  return { uids, invalid, duplicates };
}

export interface BatchCheck {
  /** The ids to send. */
  uids: string[];
  /** Why the list can't be sent as it stands, or null. Shown inline. */
  error: string | null;
  /** True when the list can be sent now. */
  ready: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What the list needs before it can be sent. The cap is the tranches the award
 * has left, which is stricter than the contract's own limit of 50.
 */
export function checkBatch(list: ProofList, tranchesLeft: number): BatchCheck {
  const { uids, invalid, duplicates } = list;
  const cap = Math.min(tranchesLeft, MAX_RELEASE_BATCH);

  if (invalid.length > 0) {
    const first = invalid[0].length > 20 ? `${invalid[0].slice(0, 20)}…` : invalid[0];
    return {
      uids,
      ready: false,
      error: `“${first}” is not an attestation id. Each is 64 hex characters${
        invalid.length > 1 ? ` (${invalid.length} entries need fixing)` : ''
      }.`,
    };
  }
  if (duplicates.length > 0) {
    return {
      uids,
      ready: false,
      error: `${shortProof(duplicates[0])} is listed more than once. One proof releases one tranche, once.`,
    };
  }
  if (uids.length > cap) {
    return {
      uids,
      ready: false,
      error: `That is ${plural(uids.length, 'id', 'ids')}, but only ${plural(cap, 'tranche is', 'tranches are')} left to release.`,
    };
  }
  if (uids.length < 2) {
    return {
      uids,
      ready: false,
      error: uids.length === 0 ? null : 'Add at least two ids to release together. For one, release the tranche on its own.',
    };
  }
  return { uids, ready: true, error: null };
}

export interface ReleaseBatchGateInput {
  /** Null until the phase has been read on-chain. */
  phase: Phase | null;
  /** Unix seconds; null until the config has been read. */
  releaseDeadline: bigint | null;
  nowMs: number;
  tranchesLeft: number;
  signedIn: boolean;
  /** Whether the connected wallet is the award's recipient. */
  isRecipient: boolean;
}

/** When may several tranches be released at once? Same window as one, with more than one left. */
export function releaseBatchGate(input: ReleaseBatchGateInput): { enabled: boolean; reason: string } {
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
  if (input.tranchesLeft < 2) {
    return { enabled: false, reason: 'Only one tranche is left. Release it on its own.' };
  }
  if (!input.signedIn) {
    return { enabled: false, reason: 'Sign in to release tranches.' };
  }
  if (!input.isRecipient) {
    return { enabled: false, reason: 'Connect the recipient’s wallet to release this award’s tranches.' };
  }
  return { enabled: true, reason: 'All of them release, or none do.' };
}

export interface RefusedProof {
  /** Position in the list, from 0. */
  index: number;
  kind: 'spent' | 'invalid';
}

/** The slice of the clients the diagnosis reads. */
export interface RefusalReaders {
  isSpent: (uid: Buffer) => Promise<boolean>;
  /** `attest.verify` for this recipient, schema and attester. */
  verifies: (uid: Buffer) => Promise<boolean>;
}

/**
 * Which proof the contract refused. `release_batch` walks the ids in order and
 * stops at the first spent or unverifiable one, but the error carries only the
 * code, so this repeats the same two checks in the same order. Null when every
 * proof passes now (it was spent or revoked in between, or the failure was
 * something else).
 */
export async function findRefusedProof(uids: readonly string[], readers: RefusalReaders): Promise<RefusedProof | null> {
  for (let index = 0; index < uids.length; index += 1) {
    const uid = proofIdToBuffer(uids[index]);
    if (await readers.isSpent(uid)) return { index, kind: 'spent' };
    if (!(await readers.verifies(uid))) return { index, kind: 'invalid' };
  }
  return null;
}

/** One sentence naming the refused proof and what that did to the batch. */
export function describeRefusedProof(refused: RefusedProof, uids: readonly string[]): string {
  const which = `Proof ${refused.index + 1} of ${uids.length} (${shortProof(uids[refused.index])})`;
  const why =
    refused.kind === 'spent'
      ? 'has already released a tranche'
      : 'is not a valid claim by this verifier about you under this programme’s schema';
  return `${which} ${why}. One bad proof stops all of them, so none were released.`;
}

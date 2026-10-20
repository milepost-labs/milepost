import { Buffer } from 'buffer';

/**
 * Verify a recipient's claimed off-chain credit history against the rolling
 * root stored by `record`.
 *
 * Each credit folds `programme`, `amount`, `attestation` and `timestamp` into
 * the previous root. Folding from the all-zero genesis root must reproduce the
 * on-chain `history_root`.
 *
 * A claimed history also carries the root after each credit — the value the
 * `Credited` event published for that release. That is what makes it possible
 * to name the first bad entry: the final root alone proves *that* something
 * diverged, but a hash chain cannot tell you *where*. Without the per-entry
 * roots the best a verifier can do is report the end of the chain.
 */

/** A programme contract address (`C...`). */
export const CONTRACT_ADDRESS = /^C[A-Z2-7]{55}$/;
export const HEX_32_BYTES = /^(0x)?[0-9a-fA-F]{64}$/;

export interface StandingHistoryEntry {
  programme: string;
  /** Stroops as a decimal string, so JSON does not lose an i128. */
  amount: string;
  /** 32-byte hex, with or without a 0x prefix. */
  attestation: string;
  /** Unix seconds as a decimal string. */
  timestamp: string;
  /**
   * The history root after this credit, as published by the credit event.
   * Optional for compatibility with histories that carry only the releases;
   * without it a mismatch can be detected but not pinned to one entry.
   */
  root?: string;
}

export type HistoryParseResult =
  | { ok: true; entries: StandingHistoryEntry[] }
  | { ok: false; error: string };

export type HistoryVerdict =
  | { kind: 'genesis' }
  | { kind: 'match' }
  | {
      kind: 'mismatch';
      /** Zero-based index of the first entry that does not reproduce its root. */
      firstBadIndex: number;
      computedRoot: string;
      claimedRoot: string | null;
      onChainRoot: string;
      message: string;
    };

export type NextRoot = (input: {
  root: Buffer;
  programme: string;
  amount: bigint;
  attestation: Buffer;
  timestamp: bigint;
}) => Promise<Buffer>;

const hex = (value: Buffer | Uint8Array) => Buffer.from(value).toString('hex');

const cleanHex = (value: string) => value.replace(/^0x/i, '').toLowerCase();

/** Validate the pasted JSON before any chain read is spent on it. */
export function parseStandingHistory(input: string): HistoryParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.trim());
  } catch {
    return { ok: false, error: 'That is not valid JSON — paste the credit list as a JSON array.' };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Expected a JSON array of credit entries.' };
  }

  const entries: StandingHistoryEntry[] = [];
  for (let index = 0; index < parsed.length; index++) {
    const entry = parsed[index];
    const position = index + 1;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `Entry ${position} is not a JSON object.` };
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.programme !== 'string' || !CONTRACT_ADDRESS.test(record.programme)) {
      return { ok: false, error: `Entry ${position}: "programme" must be a valid programme contract address.` };
    }
    if (typeof record.amount !== 'string' || !/^\d+$/.test(record.amount)) {
      return { ok: false, error: `Entry ${position}: "amount" must be a positive decimal string of stroops.` };
    }
    if (typeof record.amount === 'string' && BigInt(record.amount) <= 0n) {
      return { ok: false, error: `Entry ${position}: "amount" must be greater than zero.` };
    }
    if (typeof record.attestation !== 'string' || !HEX_32_BYTES.test(record.attestation)) {
      return { ok: false, error: `Entry ${position}: "attestation" must be a 32-byte hex string.` };
    }
    if (typeof record.timestamp !== 'string' || !/^\d+$/.test(record.timestamp)) {
      return { ok: false, error: `Entry ${position}: "timestamp" must be a decimal string of unix seconds.` };
    }
    if (
      record.root !== undefined &&
      (typeof record.root !== 'string' || !HEX_32_BYTES.test(record.root))
    ) {
      return {
        ok: false,
        error: `Entry ${position}: "root" must be the 32-byte hex history root published after this credit.`,
      };
    }
    entries.push({
      programme: record.programme,
      amount: record.amount,
      attestation: cleanHex(record.attestation),
      timestamp: record.timestamp,
      root: typeof record.root === 'string' ? cleanHex(record.root) : undefined,
    });
  }

  return { ok: true, entries };
}

/**
 * Fold the claimed history through the contract's own `next_root`.
 *
 * `nextRoot` is a simulation, not a write: nothing is signed and no state
 * changes. The first entry whose computed root differs from the root its
 * event published is the divergence; later entries are still folded and
 * reported, so one bad entry does not hide the rest.
 */
export async function verifyStandingHistory(
  entries: StandingHistoryEntry[],
  onChainRoot: Buffer,
  nextRoot: NextRoot,
): Promise<HistoryVerdict> {
  const onChain = hex(onChainRoot);

  if (entries.length === 0) {
    return hex(Buffer.alloc(32, 0)) === onChain ? { kind: 'genesis' } : {
      kind: 'mismatch',
      firstBadIndex: 0,
      computedRoot: hex(Buffer.alloc(32, 0)),
      claimedRoot: null,
      onChainRoot: onChain,
      message: 'The history is empty but the on-chain root is not the zero root.',
    };
  }

  let root = Buffer.alloc(32, 0);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    root = await nextRoot({
      root,
      programme: entry.programme,
      amount: BigInt(entry.amount),
      attestation: Buffer.from(entry.attestation, 'hex'),
      timestamp: BigInt(entry.timestamp),
    });

    const computed = hex(root);
    if (entry.root && computed !== entry.root) {
      return {
        kind: 'mismatch',
        firstBadIndex: index,
        computedRoot: computed,
        claimedRoot: entry.root,
        onChainRoot: onChain,
        message: `Entry ${index + 1} is the first that does not reproduce the root recorded for that credit.`,
      };
    }
  }

  const computed = hex(root);
  if (computed !== onChain) {
    return {
      kind: 'mismatch',
      firstBadIndex: entries.length - 1,
      computedRoot: computed,
      claimedRoot: entries[entries.length - 1].root ?? null,
      onChainRoot: onChain,
      message: entries.some((entry) => entry.root)
        ? 'Every entry reproduces its own recorded root, but the chain does not end at the root stored on-chain.'
        : 'The chain does not end at the root stored on-chain. Add each entry’s recorded root to pin the first divergence to one entry.',
    };
  }

  return { kind: 'match' };
}

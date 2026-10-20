/**
 * Pure logic for bulk payee verify/remove (issue #340), split out of
 * `PayeeManagement.tsx` so that file can stay component-only — mixing plain
 * function exports into a page component file trips
 * `react-refresh/only-export-components` (Fast Refresh needs a component
 * file's exports to all be components) and is also just easier to unit test
 * on its own.
 */

const PAYEE_ADDRESS = /^G[A-Z2-7]{55}$/;

// Matches `MAX_PAYEE_BATCH` in `contracts/program/src/lib.rs`. `allow_payees`/
// `deny_payees` reject a batch larger than this with `BatchTooLarge` (36).
export const MAX_PAYEE_BATCH = 50;

export type BulkMode = 'verify' | 'remove';

export type BulkStatus = 'eligible' | 'invalid' | 'duplicate' | 'already-verified' | 'not-verified';

export interface BulkAddress {
  address: string;
  status: BulkStatus;
}

/** One address per line, trimmed, blank lines dropped. */
export function parseBulkAddresses(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Syntax + duplicate classification only — no on-chain read. `mode` decides
 * nothing here (duplicates and malformed input are the same in either
 * direction); it exists so callers reading the result don't need it repeated.
 * Anything not `invalid`/`duplicate` here still needs the on-chain
 * already-verified check before it is truly `eligible` — see
 * `classifyBulkAddresses`.
 */
export function parseAndDedupe(text: string): BulkAddress[] {
  const seen = new Set<string>();
  return parseBulkAddresses(text).map((address) => {
    if (!PAYEE_ADDRESS.test(address)) return { address, status: 'invalid' };
    if (seen.has(address)) return { address, status: 'duplicate' };
    seen.add(address);
    return { address, status: 'eligible' };
  });
}

/**
 * Full classification, including the on-chain `is_payee` read for every
 * syntactically-valid, non-duplicate address. Skips addresses that are
 * already in the requested end state — verifying an already-verified payee
 * or removing an already-unverified one wastes a batch slot on nothing, per
 * the issue's "duplicates and already-verified addresses are skipped, not
 * rejected" (the contract itself is a no-op on these; skipping client-side
 * means they don't consume one of the 50 batch slots for nothing).
 */
export async function classifyBulkAddresses(
  text: string,
  mode: BulkMode,
  isPayee: (address: string) => Promise<boolean>,
): Promise<BulkAddress[]> {
  const draft = parseAndDedupe(text);
  const toCheck = draft.filter((entry) => entry.status === 'eligible');
  const checked = await Promise.all(
    toCheck.map(async (entry) => {
      let verified: boolean;
      try {
        verified = await isPayee(entry.address);
      } catch {
        // Read failure: treat as not-yet-verified rather than silently
        // dropping the address — worst case the batch call itself is a no-op
        // for it, which is safe; silently excluding it is not.
        verified = mode === 'remove';
      }
      if (mode === 'verify' && verified) return { address: entry.address, status: 'already-verified' as const };
      if (mode === 'remove' && !verified) return { address: entry.address, status: 'not-verified' as const };
      return { address: entry.address, status: 'eligible' as const };
    }),
  );
  const byAddress = new Map(checked.map((entry) => [entry.address, entry]));
  return draft.map((entry) => byAddress.get(entry.address) ?? entry);
}

/** Splits eligible addresses into `MAX_PAYEE_BATCH`-sized chunks, in order. */
export function chunkAddresses(addresses: string[], size = MAX_PAYEE_BATCH): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += size) {
    chunks.push(addresses.slice(i, i + size));
  }
  return chunks;
}

// --- Announcement copy (issue #482) ----------------------------------------
//
// The sentences a bulk run says out loud, kept here next to the batching
// logic that produces them: they are pure text in, text out, so they can be
// asserted directly instead of only through a rendered screen. `PayeeManagement`
// both prints and announces them, so the spoken wording can never drift from
// the written one.

export interface BulkCounts {
  eligible: number;
  invalid: number;
  duplicate: number;
  /** Already in the requested end state — skipped, not rejected. */
  skipped: number;
}

/** Tallies a classification run, in the order the summary sentence lists them. */
export function countBulkAddresses(results: BulkAddress[] | null): BulkCounts {
  const counts: BulkCounts = { eligible: 0, invalid: 0, duplicate: 0, skipped: 0 };
  for (const entry of results ?? []) {
    if (entry.status === 'eligible') counts.eligible++;
    else if (entry.status === 'invalid') counts.invalid++;
    else if (entry.status === 'duplicate') counts.duplicate++;
    else counts.skipped++; // already-verified or not-verified
  }
  return counts;
}

const actionNoun = (mode: BulkMode) => (mode === 'verify' ? 'verify' : 'remove');

const actionDone = (mode: BulkMode) => (mode === 'verify' ? 'verified' : 'removed');

/**
 * The one sentence describing what a check found and how it will be sent.
 * Rendered under the list and announced once when the results arrive, so
 * nobody has to listen to every pasted address read back to them.
 */
export function bulkCheckSummary(counts: BulkCounts, mode: BulkMode, batchCount: number): string {
  const parts = [`${counts.eligible} to ${actionNoun(mode)}`];
  if (counts.invalid > 0) parts.push(`${counts.invalid} invalid`);
  if (counts.duplicate > 0) parts.push(`${counts.duplicate} duplicate`);
  if (counts.skipped > 0) parts.push(`${counts.skipped} already ${mode === 'verify' ? 'verified' : 'unverified'}`);
  const summary = parts.join(', ');
  return batchCount > 1
    ? `${summary} — sent as ${batchCount} batches of up to ${MAX_PAYEE_BATCH}.`
    : `${summary}.`;
}

/** Polite: a batch has begun. `index` is one-based, as shown on screen. */
export function bulkBatchStart(index: number, total: number, size: number, mode: BulkMode): string {
  return `Sending batch ${index} of ${total}: ${size} payees to ${actionNoun(mode)}…`;
}

/** Polite: a batch landed on chain. */
export function bulkBatchDone(index: number, total: number, size: number, mode: BulkMode): string {
  return `Batch ${index} of ${total} confirmed: ${size} payees ${actionDone(mode)}.`;
}

/**
 * Assertive: a batch failed. Carries how many payees made it before the
 * failure, because the batches that landed are real writes and the rest are
 * simply not attempted — the reader needs both halves of that.
 */
export function bulkBatchFailed(
  index: number,
  total: number,
  succeeded: number,
  requested: number,
  mode: BulkMode,
  reason?: string | null,
): string {
  const progress = `${succeeded} of ${requested} payees ${actionDone(mode)} before it failed; the rest were not sent.`;
  return reason ? `Batch ${index} of ${total} failed. ${progress} ${reason}` : `Batch ${index} of ${total} failed. ${progress}`;
}

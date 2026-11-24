/**
 * Whether a programme is paused, read once and shared.
 *
 * Pausing stops contribute, apply, review, finalize, spend, release and
 * release_batch with `Paused` (39). Refunds and sweeps stay open. Every sheet
 * that sends one of the stopped actions asks here, so a programme page with
 * five of them on it makes one read, not five.
 */

/** The sentence every paused action shows in place of failing at signing. */
export const PAUSED_REASON = 'This programme is paused by its creator. Refunds stay open.';

/** The slice of a programme client the read needs. */
export interface PausedReader {
  options: { contractId?: string };
  is_paused: () => Promise<{ result: boolean }>;
}

/** How long one answer is shared before the next caller asks again. */
export const PAUSED_TTL_MS = 15_000;

interface Entry {
  at: number;
  version: number;
  pending: Promise<boolean>;
}

const entries = new Map<string, Entry>();

/**
 * `is_paused` for this programme, shared between callers for a few seconds.
 * A caller holding a newer `version` (bumped after the creator pauses or
 * resumes) always reads fresh. A failed read is not kept, so the next caller
 * tries again.
 */
export function readPaused(client: PausedReader, version = 0, nowMs = Date.now()): Promise<boolean> {
  const key = client.options.contractId ?? '';
  const cached = entries.get(key);
  if (cached && cached.version >= version && nowMs - cached.at < PAUSED_TTL_MS) return cached.pending;

  const pending = client.is_paused().then((response) => response.result);
  const entry: Entry = { at: nowMs, version, pending };
  entries.set(key, entry);
  pending.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  return pending;
}

/** Drop what is shared for one programme, or for all of them: the creator just paused or resumed. */
export function forgetPaused(contractId?: string): void {
  if (contractId === undefined) entries.clear();
  else entries.delete(contractId);
}

/**
 * Asking once whether to restore archived entries before a write.
 *
 * `useTransaction` asks; the one `RestoreConsentHost` the layout mounts
 * shows the question. With no host mounted there is nobody to ask, so the
 * answer is null and the write fails as it always did, pointing at Keepalive.
 */

export interface RestoreRequest {
  feeStroops: bigint;
  answer: (restore: boolean) => void;
}

let current: RestoreRequest | null = null;
let hosts = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeRestoreRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentRestoreRequest(): RestoreRequest | null {
  return current;
}

/** Called by the host while it is mounted. Returns the unregister function. */
export function registerRestoreHost(): () => void {
  hosts++;
  return () => {
    hosts--;
  };
}

/** True to restore, false when declined, null when nothing can ask. */
export function requestRestoreConsent(feeStroops: bigint): Promise<boolean | null> {
  if (hosts === 0) return Promise.resolve(null);
  current?.answer(false);
  return new Promise((resolve) => {
    const request: RestoreRequest = {
      feeStroops,
      answer: (restore) => {
        if (current === request) {
          current = null;
          emit();
        }
        resolve(restore);
      },
    };
    current = request;
    emit();
  });
}

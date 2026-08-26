/**
 * A single, global aria-live region for announcing transaction lifecycle events.
 *
 * Import `announce` from this module to push a message into the live region
 * from anywhere in the app. The screen reader will read it aloud when the
 * DOM update settles.
 */

let globalAnnounce: ((message: string) => void) | null = null;

/** Push a message into the live region from anywhere in the app. */
export function announce(message: string) {
  globalAnnounce?.(message);
}

/** @internal Called by the TransactionAnnouncer component. */
export function _bindAnnouncer(fn: (message: string) => void) {
  globalAnnounce = fn;
}

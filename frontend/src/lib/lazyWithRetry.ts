import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * A route chunk that failed to load after a deploy replaced the files it
 * used to point at — not a bug in the component, just a stale reference.
 * `ErrorBoundary` renders a different, milder fallback for this than for an
 * arbitrary crash.
 */
export class ChunkLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkLoadError';
  }
}

/**
 * The messages bundlers actually throw for a 404'd or unparsable chunk,
 * across the browsers/build tools this app is likely to hit. Deliberately
 * broad — false positives here just mean an unrelated import error also
 * gets one reload, which is harmless; false negatives mean a stale tab
 * shows a raw crash instead of recovering.
 */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|loading chunk|failed to fetch|importing a module script failed|module script failed to load/i.test(
    message,
  );
}

const RELOAD_FLAG = 'milepost:chunk-reload-attempted';

function hasAlreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    // Storage disabled (private mode, quota) — treat as "not yet reloaded"
    // rather than blocking recovery over an unrelated browser setting.
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    // Nothing to do — reload will still proceed, it just won't be able to
    // remember it happened, so a repeat failure falls straight to the
    // fallback instead of looping (fails safe).
  }
}

/**
 * `React.lazy`, with recovery for the one failure mode that isn't really a
 * bug: an open tab asking for a chunk file a new deploy removed.
 *
 * First failure reloads the page once, on the theory that a fresh
 * `index.html` points at the current chunk hashes. A second failure means
 * that didn't help — a real outage, or a genuinely broken chunk — so it
 * throws a {@link ChunkLoadError} instead of reloading again, which is what
 * keeps this from looping against a real outage.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      if (!hasAlreadyReloaded()) {
        markReloaded();
        window.location.reload();
        // The reload will tear this page down; resolve to nothing rather
        // than to a broken module while that happens.
        return new Promise<never>(() => {});
      }

      throw new ChunkLoadError(error instanceof Error ? error.message : String(error));
    }
  });
}

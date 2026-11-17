import { useEffect, useState } from 'react';

export type KeyedRead<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'ok'; data: T; error: null }
  | { status: 'error'; data: null; error: unknown };

/**
 * A read whose answer belongs to one input, for checks that change as someone
 * types (an asset contract, a schema id). The result is stored beside the key
 * it was read for, so a new key is "loading" at once and never shows the
 * previous key's answer or error. A null key reads nothing.
 */
export function useKeyedRead<T>(key: string | null, read: (key: string) => Promise<T>): KeyedRead<T> {
  const [settled, setSettled] = useState<{ key: string; data: T | null; error: unknown; ok: boolean } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    // Through a promise, so a reader that throws synchronously still lands as an error.
    Promise.resolve()
      .then(() => read(key))
      .then(
      (data) => {
        if (!cancelled) setSettled({ key, data, error: null, ok: true });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ key, data: null, error, ok: false });
      },
    );
    return () => {
      cancelled = true;
    };
    // The reader is expected to be stable per key; only the key decides a re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { status: 'idle', data: null, error: null };
  if (!settled || settled.key !== key) return { status: 'loading', data: null, error: null };
  return settled.ok
    ? { status: 'ok', data: settled.data as T, error: null }
    : { status: 'error', data: null, error: settled.error };
}

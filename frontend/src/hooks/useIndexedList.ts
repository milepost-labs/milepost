import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One way to read a list from the published index.
 *
 * The same shape as `useContractRead`, and for the same reasons — a stale
 * response must not overwrite a fresh one, an unmounted component must not set
 * state, and a refetch must not blank out what is already on screen. The
 * difference is what it reads: static JSON over HTTP rather than a contract
 * simulation, so a failure here is a missing list, not a failed contract call.
 * Screens are expected to carry on without it.
 */

export interface IndexedRead<T> {
  data: T | null;
  error: unknown;
  /** True only on the first load. A refetch keeps existing data visible. */
  loading: boolean;
  /** True while any request is in flight, including a background refresh. */
  fetching: boolean;
  refetch: () => void;
}

export interface IndexedListOptions {
  /** Skip the fetch — for lists that need a chosen programme or a connected wallet. */
  enabled?: boolean;
}

export function useIndexedList<T>(
  load: () => Promise<T>,
  deps: unknown[],
  options: IndexedListOptions = {},
): IndexedRead<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Starts true when a request will be made, so the first render already shows
  // loading rather than an empty list that is about to be replaced.
  const [fetching, setFetching] = useState(enabled);
  const [loaded, setLoaded] = useState(false);

  // Only the newest request may write state.
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Kept in a ref so an inline closure does not retrigger the fetch on every
  // render, and synced in an effect because mutating a ref while rendering is
  // not safe under concurrent React.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await loadRef.current();
      if (!mounted.current || current !== generation.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (!mounted.current || current !== generation.current) return;
      setError(caught);
    } finally {
      if (mounted.current && current === generation.current) {
        setFetching(false);
        setLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  const refetch = useCallback(() => {
    setFetching(true);
    setError(null);
    void run();
  }, [run]);

  return {
    data,
    error,
    loading: enabled && !loaded && fetching,
    fetching,
    refetch,
  };
}

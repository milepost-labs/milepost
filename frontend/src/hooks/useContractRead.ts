import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContractName } from '../lib/errors';

/**
 * One way to read from a contract.
 *
 * Without this every screen writes its own `useEffect` + `useState` +
 * `try/catch`, and they disagree about the things that matter: whether a stale
 * response can overwrite a fresh one, whether an unmounted component still
 * calls `setState`, and whether a refetch shows a spinner over data that is
 * already on screen.
 *
 * Reads simulate against RPC and take seconds on testnet, so those races are
 * routine rather than theoretical.
 */

export interface ContractRead<T> {
  data: T | null;
  error: unknown;
  /** True only on the first load. A refetch keeps existing data visible. */
  loading: boolean;
  /** True while any request is in flight, including a background refresh. */
  fetching: boolean;
  refetch: () => void;
}

export interface ContractReadOptions {
  /** Which contract's error table explains a failure. */
  contract?: ContractName;
  /** Skip the call — for reads that need a connected wallet or a chosen id. */
  enabled?: boolean;
}

/**
 * `call` receives an `AbortSignal`-like generation check via the returned
 * promise being ignored if a newer call started. Keep `deps` accurate: it is
 * what decides when to refetch.
 */
export function useContractRead<T>(
  call: () => Promise<{ result: T }>,
  deps: unknown[],
  options: ContractReadOptions = {},
): ContractRead<T> {
  const { enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Starts true when a request will be made, so the first render already shows
  // loading. Setting it inside the effect instead would cascade an extra
  // render on every mount.
  const [fetching, setFetching] = useState(enabled);
  const [loaded, setLoaded] = useState(false);

  // Only the newest request may write state. Without this, a slow first
  // response can land after a fast second one and quietly show stale data.
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Kept in a ref so a caller passing an inline closure does not retrigger the
  // fetch on every render. Synced in an effect rather than during render —
  // mutating a ref while rendering is not safe under concurrent React. This
  // effect is declared before the fetching one, so it runs first.
  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  });

  const run = useCallback(async () => {
    const current = ++generation.current;

    try {
      const response = await callRef.current();
      if (!mounted.current || current !== generation.current) return;
      setData(response.result);
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

  // Refetch is user-initiated rather than an effect, so setting state here is
  // both safe and necessary — the flags need resetting for a second attempt.
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

/**
 * For reads the bindings wrap in a `Result` — the contract functions that are
 * fallible in Rust, such as `budget`, `get_phase`, `get_award` and
 * `get_application`. Infallible ones return the value directly and should use
 * `useContractRead`.
 *
 * Getting this backwards is easy and the compiler will tell you: a missing
 * `unwrap` fails to typecheck rather than failing at runtime.
 */
export function useContractResult<T>(
  call: () => Promise<{ result: { unwrap: () => T } }>,
  deps: unknown[],
  options: ContractReadOptions = {},
): ContractRead<T> {
  return useContractRead<T>(
    async () => {
      const response = await call();
      return { result: response.result.unwrap() };
    },
    deps,
    options,
  );
}

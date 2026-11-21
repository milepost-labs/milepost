import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContractName } from '../lib/errors';
import { isRpcFailure, reportRpcFailure, reportRpcSuccess } from '../lib/rpcHealth';

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
  /** True when the read failed because the entry is archived (TTL expired). `error` is set too. */
  archived: boolean;
  /** True until the read settles for its current key. A refetch of the same key keeps existing data visible. */
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
function isArchivedError(caught: unknown): boolean {
  if (caught instanceof Error) {
    const msg = caught.message.toLowerCase();
    if (msg.includes('expiredstate') || msg.includes('expired state')) return true;
    if (msg.includes('restore') && msg.includes('preamble')) return true;
  }
  const obj = caught as Record<string, unknown>;
  if (obj?.name === 'ExpiredState') return true;
  if (obj?.kind === 'expiredstate' || obj?.kind === 'expired') return true;
  return false;
}

/** What one settled read left behind, stored beside the deps it was read for. */
interface Settled<T> {
  deps: unknown[];
  data: T | null;
  error: unknown;
  archived: boolean;
}

function sameDeps(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

export function useContractRead<T>(
  call: () => Promise<{ result: T }>,
  deps: unknown[],
  options: ContractReadOptions = {},
): ContractRead<T> {
  const { enabled = true } = options;

  // The answer is stored beside the deps it belongs to. A render whose deps
  // differ from the stored ones sees no data and no error at once, instead of
  // the previous key's result until the new request lands.
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  // True from a manual refetch until it settles. A change of deps needs no
  // flag: the stored answer simply stops matching.
  const [refetching, setRefetching] = useState(false);

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

  // Kept in refs so a caller passing an inline closure does not retrigger the
  // fetch on every render. Synced in an effect rather than during render —
  // mutating a ref while rendering is not safe under concurrent React. This
  // effect is declared before the fetching one, so it runs first.
  const callRef = useRef(call);
  const depsRef = useRef(deps);
  useEffect(() => {
    callRef.current = call;
    depsRef.current = deps;
  });

  const run = useCallback(async () => {
    const current = ++generation.current;
    const runDeps = depsRef.current;

    try {
      const response = await callRef.current();
      reportRpcSuccess();
      if (!mounted.current || current !== generation.current) return;
      setSettled({ deps: runDeps, data: response.result, error: null, archived: false });
    } catch (caught) {
      if (isRpcFailure(caught)) reportRpcFailure();
      if (!mounted.current || current !== generation.current) return;
      // Still an error, so screens that do not check `archived` show it
      // rather than reading an archived entry as absent. A refetch of the same
      // key keeps its last value beside the error.
      setSettled((previous) => ({
        deps: runDeps,
        data: previous && sameDeps(previous.deps, runDeps) ? previous.data : null,
        error: caught,
        archived: isArchivedError(caught),
      }));
    } finally {
      if (mounted.current && current === generation.current) setRefetching(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  // Refetch is user-initiated rather than an effect, so setting state here is
  // both safe and necessary — the error needs clearing for a second attempt.
  const refetch = useCallback(() => {
    setRefetching(true);
    setSettled((previous) => (previous ? { ...previous, error: null, archived: false } : previous));
    void run();
  }, [run]);

  const current = settled && sameDeps(settled.deps, deps) ? settled : null;

  return {
    data: current ? current.data : null,
    error: current ? current.error : null,
    archived: current ? current.archived : false,
    // Loading from the moment the read is enabled until it first settles for
    // this key, including a read that became enabled after mount.
    loading: enabled && !current,
    fetching: enabled && (!current || refetching),
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

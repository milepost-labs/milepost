import { useEffect, useRef, useState } from 'react';
import { useOptionalSoroban } from '../context/useSoroban';
import type { SorobanState } from '../context/sorobanStore';
import {
  readProgrammeChain,
  readRegistryProgrammes,
  sessionRead,
  type ProgrammeChainRead,
} from '../lib/programmeReads';

/**
 * React wiring for the shared per-programme reader in `lib/programmeReads`.
 *
 * Consumers pass the ids they want; results settle per programme so a
 * directory fills in card by card rather than waiting for the slowest read.
 * The reader's own cache means a screen visited twice does not re-fire the
 * same simulations, so these hooks are cheap to mount and remount. Nothing
 * here decides how failures read on screen — that stays with the screens,
 * which translate through `explain()` like everywhere else.
 */

/** Result of {@link useProgrammeChainReads}, by programme id. */
export interface ProgrammeReads {
  /** Settled read per id — absent while in flight or failed. */
  reads: Record<string, ProgrammeChainRead>;
  /** Ids still being read. */
  loading: ReadonlySet<string>;
  /** The thrown error per id that failed. */
  errors: Record<string, unknown>;
  /** Try failed ids again (the reader never caches a failure). */
  retry: () => void;
}

export function useProgrammeChainReads(programmeIds: readonly string[]): ProgrammeReads {
  const soroban = useOptionalSoroban();
  // One string, so a reshuffled id list does not re-mount the work.
  const key = programmeIds.join('\n');
  const [reads, setReads] = useState<Record<string, ProgrammeChainRead>>({});
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const [retries, setRetries] = useState(0);
  // Succeeded ids skip a retry: reads (unlike counters) do not go stale here —
  // a refill would only re-send identical simulations.
  const completedIds = useRef(new Set<string>());

  useEffect(() => {
    const ids = key.split('\n').filter((id) => id !== '');
    if (!soroban || ids.length === 0) return;
    let cancelled = false;
    const pending = ids.filter((id) => !completedIds.current.has(id));

    if (pending.length > 0) {
      setLoading((current) => {
        const next = new Set(current);
        let changed = false;
        for (const id of pending) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : current;
      });

      for (const id of pending) {
        void readProgrammeChain(id, soroban.programmeAt).then(
          (read) => {
            if (cancelled) return;
            completedIds.current.add(id);
            setReads((current) => ({ ...current, [id]: read }));
            setErrors((current) => {
              if (current[id] === undefined) return current;
              const next = { ...current };
              delete next[id];
              return next;
            });
            dropLoading(setLoading, id);
          },
          (error) => {
            if (cancelled) return;
            setErrors((current) => ({ ...current, [id]: error }));
            dropLoading(setLoading, id);
          },
        );
      }
    }

    return () => {
      cancelled = true;
    };
  }, [key, retries, soroban]);

  return {
    reads,
    loading,
    errors,
    retry: () => setRetries((current) => current + 1),
  };
}

function dropLoading(
  setLoading: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void,
  id: string,
) {
  setLoading((current) => {
    if (!current.has(id)) return current;
    const next = new Set(current);
    next.delete(id);
    return next;
  });
}

/**
 * The programmes the registry itself says it has deployed. Null until the walk
 * completes; a failed walk leaves null with the error, and the caller decides
 * what to show. Cached for the session by the reader, so remounting is free.
 */
export function useRegistryProgrammes(
  enabled = true,
): { ids: string[] | null; loading: boolean; error: unknown } & { refetch: () => void } {
  const soroban = useOptionalSoroban();
  const [ids, setIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (!enabled || !soroban) return;
    let cancelled = false;
    // This hook intentionally drives a fetch lifecycle from effect state to keep
    // the read status in sync with the async provider result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    void readRegistryProgrammes(soroban.registry).then(
      (found) => {
        if (cancelled) return;
        setIds(found);
        setLoading(false);
      },
      (caught) => {
        if (cancelled) return;
        setError(caught);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, retries, soroban]);

  return { ids, loading, error, refetch: () => setRetries((current) => current + 1) };
}

/**
 * One keyed chain read, in the `useContractRead` shape so screens can compose
 * it with the shared `AsyncView` states. The key is the cache identity: pass
 * null (or omit) and nothing is read.
 */
export interface KeyedRead<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refetch: () => void;
}

export function useChainRead<T>(
  key: string | null,
  run: (soroban: SorobanState) => Promise<T>,
): KeyedRead<T> {
  const soroban = useOptionalSoroban();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (!key || !soroban) return;
    const cancelled = { current: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    void sessionRead(key, () => run(soroban)).then(
      (value) => {
        if (cancelled.current) return;
        setData(value);
        setLoading(false);
      },
      (caught) => {
        if (cancelled.current) return;
        setError(caught);
        setLoading(false);
      },
    );
    return () => {
      cancelled.current = true;
    };
    // `run` is an inline closure by convention; the keyed cache decides what
    // is re-read, the same way `useContractRead` relies on its deps list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retries, soroban]);

  return { data, error, loading, refetch: () => setRetries((current) => current + 1) };
}

/** A resolved donor's contribution to one programme, in stroops (0 when none). */
export function useDonorContribution(
  programmeId: string | null,
  donor: string | null,
): KeyedRead<bigint> {
  const key = programmeId && donor ? `contribution:${programmeId}:${donor}` : null;
  // Calling `readContribution` here would wrap the same cache key inside
  // itself and await its own promise forever; the client call belongs to the
  // reader's key, and this hook only adds the React state around it.
  return useChainRead(key, (soroban) =>
    soroban
      .programmeAt(programmeId as string)
      .contributed_by({ donor: donor as string })
      .then((r) => r.result as bigint),
  );
}

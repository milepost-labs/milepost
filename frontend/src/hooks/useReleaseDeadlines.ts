import { useEffect, useState } from 'react';
import { useSoroban } from '../context/useSoroban';

/**
 * Reads `get_config().release_deadline` for each real (non-sample) programme
 * in `programmeIds` and returns the results as a Map keyed by programme id.
 *
 * Only used by the funder dashboard to show "Refunds open after <date>" on
 * Settled contribution cards before the release window closes.
 *
 * - Sample programme ids are silently skipped (no contract behind them).
 * - Reads are fire-and-forget: a failed read simply leaves the id absent from
 *   the map; the card degrades gracefully to showing no date hint.
 * - The map is stable across re-renders when `programmeIds` contents haven't
 *   changed, via a serialised key.
 */
export function useReleaseDeadlines(
  programmeIds: readonly string[],
  sampleIds: ReadonlySet<string>,
): ReadonlyMap<string, bigint> {
  const { programmeAt } = useSoroban();
  const [deadlines, setDeadlines] = useState<Map<string, bigint>>(() => new Map());

  // Serialise the real programme ids so the effect only re-runs when the set
  // actually changes, not on every render that produces a new array reference.
  const realIds = programmeIds.filter((id) => !sampleIds.has(id));
  const key = realIds.slice().sort().join(',');

  useEffect(() => {
    if (realIds.length === 0) return;

    let cancelled = false;

    Promise.allSettled(
      realIds.map(async (id) => {
        const result = await programmeAt(id).get_config();
        return { id, deadline: result.result.unwrap().release_deadline };
      }),
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, bigint>();
      for (const r of results) {
        if (r.status === 'fulfilled') {
          next.set(r.value.id, BigInt(r.value.deadline));
        }
      }
      setDeadlines(next);
    });

    return () => {
      cancelled = true;
    };
    // key encodes the sorted real programme ids; re-run only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, programmeAt]);

  return deadlines;
}

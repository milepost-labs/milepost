/**
 * Track how long ago the page's core chain reads last settled and tick a
 * display string at most once every 10 seconds.
 *
 * The age string formats as:
 *   - "just now"  — under 10 s
 *   - "N s ago"   — 10–59 s
 *   - "N min ago" — 60 s and over
 *
 * The tick interval is 10 s, so the string advances in 10 s steps. This keeps
 * the chip from re-rendering every second and from announcing itself to screen
 * readers via a live region.
 *
 * Returns null for `ageLabel` while no read has settled yet (the chip should
 * not show at all until the first read is done).
 */

import { useCallback, useEffect, useState } from 'react';

/** How often the displayed age string is recalculated. */
const TICK_MS = 10_000;

function ageLabel(lastReadAt: number, now: number): string {
  const deltaS = Math.max(0, Math.floor((now - lastReadAt) / 1000));
  if (deltaS < 10) return 'just now';
  if (deltaS < 60) return `${deltaS} s ago`;
  return `${Math.floor(deltaS / 60)} min ago`;
}

export interface ChainAge {
  /** Human-readable age of the oldest core read. Null until the first read settles. */
  label: string | null;
  /** Call to trigger a refetch of core reads and reset the age. */
  refetch: () => void;
}

/**
 * @param lastReadAt - Unix ms of when the slowest core read last settled.
 *   Pass null until all core reads have completed at least once.
 * @param onRefetch  - Called when the user clicks the chip to refresh.
 */
export function useChainAge(
  lastReadAt: number | null,
  onRefetch: () => void,
): ChainAge {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lastReadAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [lastReadAt]);

  const refetch = useCallback(() => {
    onRefetch();
    setNow(Date.now());
  }, [onRefetch]);

  if (lastReadAt === null) return { label: null, refetch };
  return { label: ageLabel(lastReadAt, now), refetch };
}

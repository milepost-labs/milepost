/**
 * React wiring for the programme activity read.
 *
 * Deliberately NOT routed through the session cache: an activity feed grows
 * as the programme is used, so a refetch must ask the RPC again rather than
 * replay the cached page. One fetch runs at a time; an unmount or a new
 * programme id cancels it.
 */

import { useEffect, useState } from 'react';
import { rpcServer } from '../lib/txLookup';
import { useSoroban } from '../context/useSoroban';
import { readProgrammeActivity, type ProgrammeActivity } from '../lib/programmeActivity';

export interface ProgrammeActivityRead {
  data: ProgrammeActivity | null;
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * A real programme's recent activity. Pass null (or `enabled: false`) and
 * nothing is read: samples have no contract and no events.
 */
export function useProgrammeActivity(programmeId: string | null, enabled = true): ProgrammeActivityRead {
  const { rpcUrl } = useSoroban();
  const [data, setData] = useState<ProgrammeActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (!programmeId || !enabled) return;
    let cancelled = false;
    // This hook intentionally drives a fetch lifecycle from effect state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    void readProgrammeActivity(rpcServer(rpcUrl), programmeId).then(
      (value) => {
        if (cancelled) return;
        setData(value);
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
  }, [programmeId, retries, rpcUrl, enabled]);

  return { data, loading, error, refetch: () => setRetries((n) => n + 1) };
}

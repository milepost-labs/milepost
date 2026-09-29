import { useEffect } from 'react';
import { useAnnouncer } from '../context/useAnnouncer';
import { isFailure, type Explained } from '../lib/errors';
import { phaseLabel } from './useTransaction';

const PENDING = ['building', 'signing', 'submitting'];

/**
 * Speak a write's outcome through the one shared live region.
 *
 * `useTransaction` owns the phases, and this is the one place that decides what
 * those phases sound like. Screens call it next to the `useTransaction` that
 * produced them and then render their own outcome markup with no live
 * semantics of its own — which is what stops a second, drifting `aria-live`
 * region appearing on every page that writes.
 *
 * Pending and success are polite; a failure is assertive, because a write that
 * did not happen is not something to queue behind whatever the screen reader
 * was already saying. A declined signature is not a failure, and `useTransaction`
 * reports it as such, so it stays quiet.
 */
export function useAnnounceTransaction({
  phase,
  error,
  pending,
  success,
}: {
  phase: string;
  error: Explained | null;
  /** What to say while in flight. Defaults to the phase's own label. */
  pending?: string;
  success: string;
}): void {
  const announce = useAnnouncer();
  const inFlight = PENDING.includes(phase);
  const pendingText = pending ?? phaseLabel(phase);

  useEffect(() => {
    if (error) announce(error.message, isFailure(error) ? 'alert' : 'status');
    else if (inFlight) announce(pendingText);
    else if (phase === 'success') announce(success);
  }, [announce, error, inFlight, pendingText, phase, success]);
}

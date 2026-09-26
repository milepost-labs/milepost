import { useContext } from 'react';
import { AnnouncerContext, type AnnouncerContextType } from './announcerStore';

/**
 * The shared announcement layer for asynchronous results.
 *
 * Every write in this app is asynchronous and most move money, so the moment
 * pending becomes confirmed (or fails) needs to reach someone who cannot see
 * a spinner resolve. Call this instead of building a per-page live region —
 * a second one drifts from this one the first time either changes.
 *
 * ```tsx
 * const announce = useAnnouncer();
 *
 * // Pending and success are polite — they wait their turn.
 * announce('Submitting…');
 * announce('Contribution confirmed.');
 *
 * // Failure is assertive — it interrupts, because a failed write is not
 * // something to queue behind whatever the screen reader was already saying.
 * announce('Contribution failed. Nothing was transferred.', 'alert');
 * ```
 *
 * One line at the bottom of the screen renders whatever was last announced;
 * `AnnouncerProvider` (mounted once, in `Layout`) owns it, so calling this
 * from any screen reaches the same shared region rather than creating one.
 */
const noop: AnnouncerContextType['announce'] = () => {};

export function useAnnouncer(): AnnouncerContextType['announce'] {
  const context = useContext(AnnouncerContext);
  // Every route renders inside Layout, which provides the region. Outside it
  // (a component test, say) there is nowhere to announce to, and failing to
  // render over that would be worse than staying quiet.
  return context?.announce ?? noop;
}

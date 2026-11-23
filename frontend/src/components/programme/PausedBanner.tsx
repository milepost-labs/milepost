import { useProgrammePaused, type useProgramme } from '../../hooks';
import { Notice } from '../ui';
import './PausedBanner.css';

/**
 * Shown on every screen for a paused programme, not just the creator's.
 *
 * A recipient or reviewer hitting `Error::Paused` should learn the programme
 * is paused, not that their action mysteriously failed — this banner is what
 * lets them find that out before they even try.
 */
export function PausedBanner({
  client,
  version = 0,
}: {
  client: ReturnType<typeof useProgramme>['client'];
  /** Change it to re-read, e.g. after the creator pauses or resumes. */
  version?: number;
}) {
  const { paused } = useProgrammePaused(client, version);

  if (!paused) return null;

  return (
    <Notice tone="warn" role="status" className="paused-banner">
      <h3 className="paused-banner__title">This programme is paused</h3>
      <p>
        The creator has temporarily halted contributions, applications, reviews, awards, and
        releases. The clock keeps running: deadlines do not move.{' '}
        <strong>Refunds remain available</strong> — pausing never blocks a donor from reclaiming
        their money.
      </p>
    </Notice>
  );
}

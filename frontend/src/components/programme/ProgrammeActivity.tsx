import { useMemo, type FC } from 'react';
import { History } from 'lucide-react';
import { activitySentence, type ActivityItem } from '../../lib/programmeActivity';
import { describeWindow } from '../../lib/contractEvents';
import { useProgrammeActivity } from '../../hooks/useProgrammeActivity';
import { useProgrammeAsset } from '../../hooks/useProgrammeAsset';
import { shortId } from '../../lib/programmeView';
import { FIXTURE_ACTIVITY } from '../../fixtures/activity';
import { isSampleProgrammeId } from '../../lib/programmeView';
import { SampleTag, Badge } from '../ui';
import './ProgrammeActivity.css';

export interface ProgrammeActivityPanelProps {
  programmeId: string;
  /** True for a stand-in programme: no chain reads, fixture timeline shown. */
  isSample?: boolean;
}

/** A timestamp as "18 Nov, 09:14 UTC", without promising timezone conversion. */
function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ', ' +
    date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) +
    ' UTC';
}

/** Ledger link text with the number, mono. */
function ledgerLine(ledger: number): string {
  return `ledger ${ledger.toLocaleString('en-GB')}`;
}

/**
 * The programme's recent activity, rebuilt from its contract events.
 *
 * A real programme's events come from the RPC's retention window (about a
 * week); the window the read covered is stated on screen, because older
 * activity is simply not available and the panel must not imply it is the
 * whole history. Sample programmes show the fixture timeline with its
 * Sample data tag — they have no contract and no events.
 */
export const ProgrammeActivityPanel: FC<ProgrammeActivityPanelProps> = ({
  programmeId,
  isSample = false,
}) => {
  const sample = isSample && isSampleProgrammeId(programmeId);
  const read = useProgrammeActivity(programmeId, !sample);

  const asset = useProgrammeAsset(programmeId);
  const window = read.data?.window;
  const items: ActivityItem[] = sample ? FIXTURE_ACTIVITY : read.data?.items ?? [];

  const windowLabel = useMemo(() => {
    if (sample) return 'Sample timeline';
    if (!window) return null;
    const span = describeWindow(window);
    return `Covers ${span} of activity · ledgers ${window.fromLedger.toLocaleString('en-GB')}–${window.toLedger.toLocaleString('en-GB')}`;
  }, [sample, window]);

  const truncated = !sample && read.data?.truncated === true;

  return (
    <section className="programme-activity" aria-labelledby="programme-activity-title">
      <div className="programme-activity__head">
        <h2 id="programme-activity-title" className="programme-activity__title">
          <History aria-hidden="true" /> Activity
        </h2>
        {sample && <SampleTag />}
        {windowLabel && (
          <p className="programme-activity__window">{windowLabel}</p>
        )}
      </div>

      {read.loading && (
        <p className="programme-activity__status" role="status">
          Reading this programme&apos;s recent events…
        </p>
      )}

      {!sample && read.error != null && (
        <p className="programme-activity__error" role="alert">
          Could not read recent events from the network.{' '}
          <button
            type="button"
            className="programme-activity__retry"
            onClick={read.refetch}
          >
            Try again
          </button>
        </p>
      )}

      {!read.loading && !read.error && items.length === 0 && !sample && (
        <p className="programme-activity__empty">
          No activity in the RPC&apos;s window (about a week). Older activity is not
          available from the network; the explorer keeps the full history.
        </p>
      )}

      {items.length > 0 && (
        <ol className="programme-activity__list" aria-label="Programme activity, newest first">
          {items.map((item, index) => (
            <li
              key={`${item.ledger}-${item.kind}-${index}`}
              className={`programme-activity__item programme-activity__item--${item.kind}`}
            >
              <span className="programme-activity__body">
                {activitySentence(item, asset)}
                {item.actor && (
                  <span className="programme-activity__actor numeric" title={item.actor}>
                    {' '}{shortId(item.actor)}
                  </span>
                )}
              </span>
              <span className="programme-activity__meta">
                {stamp(item.closedAt) ? `${stamp(item.closedAt)} · ` : ''}
                {ledgerLine(item.ledger)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {truncated && (
        <p className="programme-activity__truncated">
          <Badge tone="neutral">Partial</Badge> Older events in the window were not
          read; this is the most recent page.
        </p>
      )}
    </section>
  );
};

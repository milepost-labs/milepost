import type { FC } from 'react';
import { formatDateTime, timeUntil, hasPassed } from '../../lib/format';
import './Deadline.css';

export interface DeadlineProps {
  /** Unix seconds (contract timestamp). */
  unixSeconds: number | bigint;
  /** Label shown to screen readers before the date. */
  label?: string;
}

/**
 * Shared deadline display: local date and time, relative time, then UTC.
 *
 * All three are plain text in that order, so a screen reader reads
 * "Applications close, 22 Oct 2026, 10:00, in 3 days, 22 Oct 2026, 08:00 UTC"
 * without the reader having to stitch together an `aria-label` that most
 * ignore. Nothing here is focusable: a timeline stops on its actions, not on
 * every date.
 */
export const Deadline: FC<DeadlineProps> = ({ unixSeconds, label }) => {
  const date = new Date(Number(unixSeconds) * 1000);
  const past = hasPassed(unixSeconds);
  const relative = timeUntil(unixSeconds);

  const utcString = date.toLocaleString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const localString = formatDateTime(unixSeconds);

  return (
    <span className="deadline" data-past={past || undefined}>
      {label && <span className="deadline__label">{label} </span>}
      <span className="deadline__local">{localString}</span>
      <span className="deadline__relative">{relative}</span>
      <span className="deadline__utc">{utcString}</span>
    </span>
  );
};

import type { FC } from 'react';
import { formatDate, timeUntil, hasPassed } from '../../lib/format';
import './Deadline.css';

export interface DeadlineProps {
  /** Unix seconds (contract timestamp). */
  unixSeconds: number | bigint;
  /** Label shown to screen readers before the date. */
  label?: string;
}

/**
 * Shared deadline display: local date and time, relative time, and UTC on
 * hover or focus. Past and future deadlines read differently so the user
 * does not have to do the arithmetic.
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

  const localString = formatDate(unixSeconds);

  return (
    <span className="deadline" data-past={past || undefined}>
      {label && <span className="deadline__label">{label} </span>}
      <span className="deadline__local" title={utcString}>
        {localString}
      </span>
      <span className="deadline__relative" aria-label={`${label ? `${label}: ` : ''}${relative}`}>
        {relative}
      </span>
      <span className="deadline__utc" tabIndex={0} role="note" aria-label={`UTC: ${utcString}`}>
        {utcString}
      </span>
    </span>
  );
};

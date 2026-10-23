import { CalendarPlus } from 'lucide-react';
import { generateIcs, type DeadlineItem } from '../../lib/ics';
import { Button } from './Button';

export interface AddToCalendarProps {
  programmeName: string;
  /** Absolute URL of the programme page, linked from every event. */
  programmeUrl: string;
  deadlines: DeadlineItem[];
  nowMs: number;
}

/** A filename any OS accepts, from a programme name in any script. */
function fileName(programmeName: string): string {
  const slug = programmeName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'programme'}-deadlines.ics`;
}

/**
 * Downloads an `.ics` file with one event per deadline not yet passed.
 * Renders nothing once every deadline has passed, rather than offering an
 * empty calendar.
 */
export function AddToCalendar({ programmeName, programmeUrl, deadlines, nowMs }: AddToCalendarProps) {
  const remaining = deadlines.filter((d) => Number(d.unixSeconds) * 1000 > nowMs);
  if (remaining.length === 0) return null;

  const download = () => {
    const ics = generateIcs(programmeName, programmeUrl, remaining, new Date(nowMs));
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(programmeName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="secondary"
      icon={<CalendarPlus size={16} aria-hidden="true" />}
      onClick={download}
      aria-label={`Add ${remaining.length === 1 ? 'the remaining deadline' : `the ${remaining.length} remaining deadlines`} to your calendar`}
    >
      Add to calendar
    </Button>
  );
}

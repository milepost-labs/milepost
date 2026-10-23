/**
 * iCalendar (RFC 5545) file for a programme's remaining deadlines.
 *
 * Deadlines live only on the programme page, so people miss them. One event
 * per deadline that has not passed, in UTC, each linking back to the
 * programme, imports into any calendar app.
 */

export interface DeadlineItem {
  /** Stable per deadline, so re-importing updates events rather than duplicating them. */
  key: string;
  label: string;
  unixSeconds: number | bigint;
}

const encoder = new TextEncoder();

/**
 * Escape a TEXT value: backslash, semicolon and comma take a backslash, and a
 * newline becomes the two characters `\n` (RFC 5545 §3.3.11).
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** A Unix time in seconds as an RFC 5545 UTC date-time: `YYYYMMDDTHHMMSSZ`. */
export function formatIcsTimestamp(unixSeconds: number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Fold a content line to at most 75 octets, continuing on lines that start
 * with a space (RFC 5545 §3.1). Counted in UTF-8 bytes, and never splitting a
 * character, since a programme name can hold any script.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  // The first line holds 75 octets; continuations hold 74 after their space.
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** The deadlines still ahead of `now`, as an `.ics` file. */
export function generateIcs(
  programmeName: string,
  programmeUrl: string,
  deadlines: DeadlineItem[],
  now: Date = new Date(),
): string {
  const stamp = formatIcsTimestamp(Math.floor(now.getTime() / 1000));
  const remaining = deadlines.filter((d) => Number(d.unixSeconds) * 1000 > now.getTime());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Milepost//Programme deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const d of remaining) {
    const at = formatIcsTimestamp(d.unixSeconds);
    lines.push(
      'BEGIN:VEVENT',
      // The programme URL keeps two programmes' deadlines from sharing a UID.
      `UID:${d.key}-${d.unixSeconds}-${encodeURIComponent(programmeUrl)}@milepost`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${at}`,
      `DTEND:${at}`,
      `SUMMARY:${escapeIcsText(`${d.label}: ${programmeName}`)}`,
      `DESCRIPTION:${escapeIcsText(`${d.label} for ${programmeName}.\n\n${programmeUrl}`)}`,
      `URL:${programmeUrl}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

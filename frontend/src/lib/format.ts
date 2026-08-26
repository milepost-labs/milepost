/**
 * Dates and addresses.
 *
 * Both appear on nearly every screen and both are easy to get subtly wrong:
 * contract deadlines are Unix **seconds** while `Date` takes milliseconds, and
 * a 56-character address has to be shortened without becoming ambiguous.
 */

/** Contract timestamps are seconds; `Date` wants milliseconds. */
export function toDate(unixSeconds: number | bigint): Date {
  return new Date(Number(unixSeconds) * 1000);
}

export function formatDate(unixSeconds: number | bigint): string {
  return toDate(unixSeconds).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(unixSeconds: number | bigint): string {
  return toDate(unixSeconds).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * How long until a deadline, or how long since it passed.
 *
 * Phases here are driven by wall-clock deadlines, so "in 3 days" is the figure
 * a user actually needs — an absolute date makes them do the arithmetic.
 */
export function timeUntil(unixSeconds: number | bigint, now: Date = new Date()): string {
  const deltaSeconds = Number(unixSeconds) - Math.floor(now.getTime() / 1000);
  const past = deltaSeconds < 0;
  const seconds = Math.abs(deltaSeconds);

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86_400, 'hour'],
    [604_800, 'day'],
    [2_629_800, 'week'],
    [31_557_600, 'month'],
  ];

  let unit: Intl.RelativeTimeFormatUnit = 'year';
  let divisor = 31_557_600;

  for (let i = 0; i < units.length; i++) {
    const [limit, name] = units[i];
    if (seconds < limit) {
      unit = name;
      divisor = i === 0 ? 1 : units[i - 1][0];
      break;
    }
  }

  const value = Math.round(seconds / divisor);

  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    past ? -value : value,
    unit,
  );
}

/** Whether a deadline has passed. */
export function hasPassed(unixSeconds: number | bigint, now: Date = new Date()): boolean {
  return Number(unixSeconds) * 1000 <= now.getTime();
}

/**
 * Shorten a Stellar address for display.
 *
 * Keeps enough of both ends that two addresses are still distinguishable —
 * truncating to a prefix alone is how people send money to the wrong account.
 * The full value belongs in a `title` attribute, never only in the shortened
 * form.
 */
export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/** Shape check only — the network is the real authority on validity. */
export function looksLikeAddress(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value) || /^C[A-Z2-7]{55}$/.test(value);
}

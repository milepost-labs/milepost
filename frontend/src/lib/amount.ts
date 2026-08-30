/**
 * Amounts on Stellar are integers of stroops — 7 decimal places — and arrive
 * from the generated contract bindings as `bigint`.
 *
 * Everything here stays in `bigint`. Converting through `number` loses
 * precision above 2^53, which real award amounts reach: 900,000,000 XLM is
 * 9e15 stroops, past the safe integer range. The failure is silent — a
 * displayed figure that looks plausible and is wrong — so the arithmetic never
 * leaves integer space.
 */

/** Stroops in one unit of any Stellar asset. */
export const STROOPS_PER_UNIT = 10_000_000n;

/** Decimal places every Stellar asset uses. */
export const DECIMALS = 7;

export interface FormatOptions {
  /**
   * Decimal places to show. Defaults to 2.
   */
  decimals?: number;
  /**
   * Thousands separators. Defaults to true.
   */
  grouped?: boolean;
  /**
   * Asset code appended to the result, e.g. "XLM".
   */
  asset?: string;
}

/**
 * Render stroops for display.
 *
 * Truncates rather than rounds. Rounding 0.9999999 up to "1.00" invites someone
 * to spend a whole unit they do not have and watch the transaction fail; showing
 * slightly less than the true balance never causes that.
 */
export function formatAmount(stroops: bigint, options: FormatOptions = {}): string {
  const { decimals = 2, grouped = true, asset } = options;

  if (decimals < 0 || decimals > DECIMALS) {
    throw new RangeError(`decimals must be between 0 and ${DECIMALS}`);
  }

  const negative = stroops < 0n;
  const magnitude = negative ? -stroops : stroops;

  const whole = magnitude / STROOPS_PER_UNIT;
  const fraction = magnitude % STROOPS_PER_UNIT;

  let result = grouped ? group(whole) : whole.toString();

  if (decimals > 0) {
    // Left-pad to the full 7 places, then truncate to the requested width.
    const padded = fraction.toString().padStart(DECIMALS, '0');
    result += `.${padded.slice(0, decimals)}`;
  }

  if (negative) result = `-${result}`;
  return asset ? `${result} ${asset}` : result;
}

/**
 * Render stroops without losing anything — every significant digit, no
 * trailing zeros. Use where exactness matters more than tidiness, such as
 * confirming what is about to be signed.
 */
export function formatExact(stroops: bigint): string {
  const negative = stroops < 0n;
  const magnitude = negative ? -stroops : stroops;

  const whole = magnitude / STROOPS_PER_UNIT;
  const fraction = (magnitude % STROOPS_PER_UNIT).toString().padStart(DECIMALS, '0').replace(/0+$/, '');

  const body = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${body}` : body;
}

export class AmountError extends Error {}

/**
 * Parse user input into stroops.
 *
 * Rejects rather than silently rounding when the input is finer than the asset
 * can represent: someone typing eight decimal places has misunderstood
 * something, and quietly discarding a digit is worse than telling them.
 */
export function parseAmount(input: string): bigint {
  const trimmed = input.trim();

  if (trimmed === '') throw new AmountError('Enter an amount');
  if (trimmed.startsWith('-')) throw new AmountError('Amount must not be negative');

  const dot = trimmed.indexOf('.');
  const whole = dot === -1 ? trimmed : trimmed.slice(0, dot);
  const fraction = dot === -1 ? '' : trimmed.slice(dot + 1);

  if (whole === '') throw new AmountError('Missing digits before the decimal point');

  // Grouping is validated rather than stripped. Removing every comma first
  // accepts "1,,,2" as 12 and "1,23,456" as 123456 — malformed input taken as a
  // number the user never typed.
  if (!/^\d+$/.test(whole) && !/^\d{1,3}(,\d{3})*$/.test(whole)) {
    throw new AmountError(`Not a valid number: "${input}"`);
  }
  if (dot !== -1) {
    if (fraction === '') throw new AmountError('Missing digits after the decimal point');
    if (!/^\d+$/.test(fraction)) throw new AmountError(`Not a valid number: "${input}"`);
    if (fraction.length > DECIMALS) throw new AmountError(`At most ${DECIMALS} decimal places`);
  }

  const stroops =
    BigInt(whole.replaceAll(',', '')) * STROOPS_PER_UNIT +
    BigInt(fraction === '' ? '0' : fraction.padEnd(DECIMALS, '0'));

  if (stroops === 0n) throw new AmountError('Amount must be greater than zero');
  return stroops;
}

/** `parseAmount` that reports failure instead of throwing. */
export function tryParseAmount(input: string): { ok: true; value: bigint } | { ok: false; error: string } {
  try {
    return { ok: true, value: parseAmount(input) };
  } catch (error) {
    return { ok: false, error: error instanceof AmountError ? error.message : 'Invalid amount' };
  }
}

/**
 * What a screen reader should say. "1,000.00" read aloud is ambiguous; the
 * asset and the word "point" are not.
 */
export function describeAmount(stroops: bigint, asset = 'XLM'): string {
  return `${formatExact(stroops)} ${asset}`;
}

/** Percentage of `total` that `part` represents, for progress bars. Never divides by zero. */
export function percentOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  // Scale before dividing so integer division does not collapse to 0 or 1.
  return Number((part * 10_000n) / total) / 100;
}

function group(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The flow of a programme's funds. `held`, is what remains in the pool:
 * contributed minus everything that has left it (released to recipients,
 * refunded by recipients, or swept back to the funder).
 */
export interface FundFlows {
  contributed: bigint;
  released: bigint;
  refunded: bigint;
  swept: bigint;
  held: bigint;
}

/**
 * Account for every stroop contributed. The parts always sum to `contributed`:
 * held is derived, so a closed programme reads as complete rather than stalled.
 */
export function fundFlows(
  contributed: bigint,
  released: bigint,
  refunded: bigint,
  swept: bigint,
): FundFlows {
  return {
    contributed,
    released,
    refunded,
    swept,
    held: contributed - released - refunded - swept,
  };
}

/** A row in the "where the money ended up" breakdown. */
export interface FundFlowRow {
  key: 'released' | 'refunded' | 'swept' | 'held';
  label: string;
  amount: bigint;
}

/**
 * Rows for the breakdown, omitting refunded/swept when they are zero so a
 * programme with no such flows does not display meaningless `0.00` figures.
 * Held is always included – even when zero it explains that the programme is
 * fully accounted for.
 */
export function fundFlowRows(flows: FundFlows): FundFlowRow[] {
  const rows: FundFlowRow[] = [
    { key: 'released', label: 'Released', amount: flows.released },
  ];
  if (flows.refunded !== 0n) {
    rows.push({ key: 'refunded', label: 'Refunded', amount: flows.refunded });
  }
  if (flows.swept !== 0n) {
    rows.push({ key: 'swept', label: 'Swept', amount: flows.swept });
  }
  rows.push({ key: 'held', label: 'Still held', amount: flows.held });
  return rows;
}

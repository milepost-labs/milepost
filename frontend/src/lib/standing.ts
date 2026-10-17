import { formatAmount } from './amount';

/** Below this many days the TTL row warns. */
export const TTL_WARNING_DAYS = 30;

/** What a keepalive pushes the entry out to, in days. */
export const KEEPALIVE_DAYS = 90;

export interface StandingAggregate {
  /** Distinct programmes that have credited this recipient. */
  programmes: number;
  /** Tranches released across every programme. */
  tranchesReleased: number;
  /** Denominator when an index supplies it; omitted for the on-chain read alone. */
  tranchesAwarded?: number;
  /** Total received, in stroops. */
  totalReceived: bigint;
}

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });

/**
 * The three standing aggregates, in the order the design shows them.
 *
 * Kept as a pure function so the screen can only ever present totals — there is
 * no path here that could enumerate individual credits, because the contract
 * stores no such list.
 */
export function standingStats(standing: StandingAggregate): { label: string; value: string }[] {
  const released =
    standing.tranchesAwarded === undefined
      ? String(standing.tranchesReleased)
      : `${standing.tranchesReleased} of ${standing.tranchesAwarded}`;
  return [
    { label: 'Programmes that funded you', value: String(standing.programmes) },
    { label: 'Total received', value: formatXlm(standing.totalReceived) },
    { label: 'Tranches delivered', value: released },
  ];
}

/** Whether the TTL row should warn. Extending clears the warning. */
export function isTtlLow(days: number, extended: boolean): boolean {
  return !extended && days < TTL_WARNING_DAYS;
}

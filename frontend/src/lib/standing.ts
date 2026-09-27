import type { StandingFixture } from '../fixtures/standing';
import { formatAmount } from './amount';

/** Below this many days the TTL row warns. */
export const TTL_WARNING_DAYS = 30;

/** What a keepalive pushes the entry out to, in days. */
export const KEEPALIVE_DAYS = 90;

const formatXlm = (amount: bigint) => formatAmount(amount, { asset: 'XLM' });

/**
 * The three standing aggregates, in the order the design shows them.
 *
 * Kept as a pure function so the screen can only ever present totals — there is
 * no path here that could enumerate individual credits, because the contract
 * stores no such list.
 */
export function standingStats(standing: StandingFixture): { label: string; value: string }[] {
  return [
    { label: 'Programmes that funded you', value: String(standing.programmes) },
    { label: 'Total received', value: formatXlm(standing.totalReceived) },
    {
      label: 'Tranches delivered',
      value: `${standing.tranchesReleased} of ${standing.tranchesAwarded}`,
    },
  ];
}

/** Whether the TTL row should warn. Extending clears the warning. */
export function isTtlLow(days: number, extended: boolean): boolean {
  return !extended && days < TTL_WARNING_DAYS;
}

import { formatAmount } from './amount';

/**
 * Standing aggregates, shaped the way the recipient-facing screens show them.
 *
 * `record.get(subject)` supplies the first three: distinct programmes,
 * tranches released, and total received. The other two are not part of that
 * read — the awarded-tranche denominator comes from award data and the entry's
 * remaining life from a TTL read — so they stay optional and are omitted when
 * the chain has not supplied them.
 */
export interface StandingView {
  /** Distinct programmes that have credited this recipient. */
  programmes: number;
  /** Tranches released across every programme. */
  tranchesReleased: number;
  /** Tranches awarded across every programme, when some source can supply it. */
  tranchesAwarded?: number;
  /** Total received, in stroops. */
  totalReceived: bigint;
  /** Days until the entry is archived, when a TTL read has supplied it. */
  liveForDays?: number;
}

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
 * stores no such list. The awarded-tranche denominator is not part of
 * `record.get`, so it is shown only when a source has supplied it.
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

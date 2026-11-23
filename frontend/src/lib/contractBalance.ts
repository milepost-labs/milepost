/** Default tolerance (in stroops) before a balance difference triggers a warning. */
export const DEFAULT_BALANCE_DUST = 100n;

export interface ExpectedBalanceInput {
  totalContributed: bigint;
  fee: bigint;
  totalReleased: bigint;
  totalRefunded: bigint;
  totalSwept: bigint;
  feeSwept: boolean;
}

export type DiscrepancyStatus = 'match' | 'dust' | 'mismatch';

export interface BalanceDiscrepancy {
  status: DiscrepancyStatus;
  /** Signed difference: `actual - expected` (positive = extra tokens, negative = shortfall). */
  diff: bigint;
}

/**
 * Expected token balance held by a programme contract, derived from its
 * accounting counters.
 *
 * Gross contributions enter the contract. Outflows are releases, donor refunds,
 * unclaimed sweeps, and the protocol fee once swept to the treasury. When
 * `sweep_unclaimed` drains the contract (including an unswept fee), the
 * subtracted total can exceed `totalContributed`, so the result clamps at 0.
 */
export function expectedContractBalance({
  totalContributed,
  fee,
  totalReleased,
  totalRefunded,
  totalSwept,
  feeSwept,
}: ExpectedBalanceInput): bigint {
  const deducted = totalReleased + totalRefunded + totalSwept + (feeSwept ? fee : 0n);
  return totalContributed > deducted ? totalContributed - deducted : 0n;
}

/**
 * Compares the token contract's live `balance(programmeId)` against the
 * balance expected from the programme's accounting counters.
 *
 * Differences up to `dustThreshold` (inclusive) are treated as dust; anything
 * larger is flagged as a mismatch.
 */
export function balanceDiscrepancy(
  actual: bigint,
  expected: bigint,
  dustThreshold: bigint = DEFAULT_BALANCE_DUST,
): BalanceDiscrepancy {
  const diff = actual - expected;
  const absDiff = diff < 0n ? -diff : diff;
  if (absDiff === 0n) return { status: 'match', diff: 0n };
  if (absDiff <= dustThreshold) return { status: 'dust', diff };
  return { status: 'mismatch', diff };
}

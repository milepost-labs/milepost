/**
 * View logic for the funding screen, kept pure so it can be tested without
 * rendering: a funder's contribution cards and totals, and how a contribution
 * splits into protocol fee and budget.
 */

import type { FixtureChainRead } from '../fixtures/programmes';
import type { FixtureContribution } from '../fixtures/funding';
import { phaseRequirement, type Phase } from './phaseGate';
import { formatUsdc, shortId, type DirectoryProgramme } from './programmeView';

export const BPS_DENOMINATOR = 10_000n;
/** Used when a programme's fee cannot be derived from its figures. */
export const DEFAULT_FEE_BPS = 100n;

export interface ContributionCard {
  programmeId: string;
  name: string;
  phase: Phase;
  amount: bigint;
  /** This funder's share of the refundable pool, in stroops. */
  refundable: bigint;
  /** True only when a refund claim would succeed right now. */
  claimable: boolean;
  refunded: boolean;
  note: string;
  /**
   * How much this donor has already received back, in stroops.
   * Read from `refunded_to(donor)` on the contract; 0n when not yet known or
   * on sample programmes.
   */
  refundedSoFar: bigint;
}

/**
 * The donor's claimable refund, matching the contract's `execute_refund` formula
 * exactly, so the UI never shows a figure that disagrees with what the chain
 * would return.
 *
 * Formula:
 *   budget  = totalContributed * (1 - feeBps / 10_000)
 *   unpaid  = budget - totalReleased
 *   share   = (donorContributed * unpaid) / totalContributed
 *   claimable = max(0, share - alreadyRefunded)
 *
 * Returns 0n when refunds are not yet open, when the donor never contributed,
 * or when the full share has already been claimed.
 *
 * @param donorContributed  stroops this donor put in
 * @param totalContributed  stroops all donors put in
 * @param feeBps            protocol fee in basis points (e.g. 1000 = 10%)
 * @param totalReleased     stroops paid out to recipients so far
 * @param alreadyRefunded   stroops this donor has already claimed back
 * @param refundsOpen       whether the refund window is open
 */
export function claimableRefund(
  donorContributed: bigint,
  totalContributed: bigint,
  feeBps: bigint,
  totalReleased: bigint,
  alreadyRefunded: bigint,
  refundsOpen: boolean,
): bigint {
  if (!refundsOpen) return 0n;
  if (totalContributed <= 0n || donorContributed <= 0n) return 0n;

  const fee = (totalContributed * feeBps) / BPS_DENOMINATOR;
  const budget = totalContributed - fee;
  const unpaid = budget - totalReleased;
  if (unpaid <= 0n) return 0n;

  const share = (donorContributed * unpaid) / totalContributed;
  if (share <= 0n) return 0n;

  const remaining = share - alreadyRefunded;
  return remaining > 0n ? remaining : 0n;
}

/**
 * One contribution as the funder sees it. The refundable share is the
 * contract's proportional rule: what this funder put in, over everything
 * contributed, times what is refundable.
 *
 * `refundedSoFar` is the on-chain `refunded_to(donor)` value for real
 * programmes, 0n for samples. It is purely for display; `claimable` is still
 * computed from the chain figures so it always matches what the contract would
 * return.
 */
export function contributionCard(
  contribution: FixtureContribution,
  programme: DirectoryProgramme | undefined,
  refundedHere = false,
  refundedSoFar = 0n,
): ContributionCard {
  const chain = programme?.chain;
  const amount = BigInt(contribution.amount);
  const contributed = chain ? BigInt(chain.contributed) : 0n;
  const pool = chain ? BigInt(chain.refundable) : 0n;
  const refundable = contributed > 0n ? (amount * pool) / contributed : 0n;
  const phase: Phase = chain?.phase ?? 'Open';
  const refunded = refundedHere || contribution.refunded;
  const claimable = !refunded && refundable > 0n && (phase === 'Cancelled' || phase === 'Settled');

  let note: string;
  if (refunded) note = `Refunded ${formatUsdc(refundable)}.`;
  else if (claimable) note = `${formatUsdc(refundable)} refundable, your share of unawarded budget.`;
  else if (phase === 'Open') note = 'Still open. Refunds, if any, come after the release window.';
  else if (phase === 'Review') note = 'In review. Your share is settled once awards are final.';
  else note = 'Nothing to refund. Every unit was awarded.';

  return {
    programmeId: contribution.programmeId,
    name: programme?.name ?? shortId(contribution.programmeId),
    phase,
    amount,
    refundable,
    claimable,
    refunded,
    note,
    refundedSoFar,
  };
}

export interface FundingTotals {
  contributed: bigint;
  programmes: number;
  refundableNow: bigint;
}

export function fundingTotals(cards: ContributionCard[]): FundingTotals {
  return {
    contributed: cards.reduce((sum, card) => sum + card.amount, 0n),
    programmes: new Set(cards.map((card) => card.programmeId)).size,
    refundableNow: cards.filter((card) => card.claimable).reduce((sum, card) => sum + card.refundable, 0n),
  };
}

/** The fee rate a programme charges, derived from its fee over its contributions. */
export function feeBpsOf(chain: FixtureChainRead): bigint {
  const contributed = BigInt(chain.contributed);
  if (contributed <= 0n) return DEFAULT_FEE_BPS;
  return (BigInt(chain.fee) * BPS_DENOMINATOR) / contributed;
}

/**
 * The fee comes out of the contribution; it is never added on top. A funder
 * sends `amount`, the protocol keeps `fee`, and `budget` is what the
 * programme can award.
 */
export function splitContribution(amount: bigint, feeBps: bigint): { fee: bigint; budget: bigint } {
  const fee = (amount * feeBps) / BPS_DENOMINATOR;
  return { fee, budget: amount - fee };
}

/** "1%", "2.5%". */
export function formatBps(bps: bigint): string {
  const whole = bps / 100n;
  const rest = bps % 100n;
  return rest === 0n ? `${whole}%` : `${whole}.${rest.toString().padStart(2, '0').replace(/0$/, '')}%`;
}

/** Why a programme cannot take a contribution, or null when it can. */
export function contributeBlockedReason(phase: Phase): string | null {
  return phase === 'Open' ? null : phaseRequirement('Open', phase);
}

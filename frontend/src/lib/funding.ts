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
}

/**
 * One contribution as the funder sees it. The refundable share is the
 * contract's proportional rule: what this funder put in, over everything
 * contributed, times what is refundable.
 */
export function contributionCard(
  contribution: FixtureContribution,
  programme: DirectoryProgramme | undefined,
  refundedHere = false,
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

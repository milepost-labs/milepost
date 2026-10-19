import { describe, expect, it } from 'vitest';
import { FIXTURE_CONTRIBUTIONS, type FixtureContribution } from '../fixtures/funding';
import { chainFor, type FixtureChainRead } from '../fixtures/programmes';
import {
  claimableRefund,
  contributeBlockedReason,
  contributionCard,
  feeBpsOf,
  formatBps,
  fundingTotals,
  splitContribution,
} from './funding';
import type { DirectoryProgramme } from './programmeView';

const programme = (chain: Partial<FixtureChainRead> = {}): DirectoryProgramme => ({
  id: 'CPROG',
  name: 'Sample programme',
  creator: null,
  createdLedger: null,
  sample: true,
  chain: { ...chainFor('unknown'), ...chain },
});

const contribution = (overrides: Partial<FixtureContribution> = {}): FixtureContribution => ({
  programmeId: 'CPROG',
  amount: '20000000000',
  ledger: 1,
  refunded: false,
  ...overrides,
});

describe('contributionCard', () => {
  it('works out the funder’s proportional share of what is refundable', () => {
    // 2,000 of 15,000 contributed; 1,650 refundable → 220.
    const card = contributionCard(
      contribution(),
      programme({ phase: 'Settled', contributed: '150000000000', refundable: '16500000000' }),
    );
    expect(card.refundable).toBe(2_200_000_000n);
    expect(card.claimable).toBe(true);
    expect(card.note).toBe('220 USDC refundable, your share of unawarded budget.');
  });

  it('is claimable only once a refund would succeed', () => {
    const open = contributionCard(contribution(), programme({ phase: 'Open', refundable: '0' }));
    expect(open.claimable).toBe(false);
    expect(open.note).toMatch(/Still open/);

    const review = contributionCard(contribution(), programme({ phase: 'Review', refundable: '0' }));
    expect(review.claimable).toBe(false);
    expect(review.note).toMatch(/In review/);

    const paidOut = contributionCard(contribution(), programme({ phase: 'Settled', refundable: '0' }));
    expect(paidOut.claimable).toBe(false);
    expect(paidOut.note).toBe('Nothing to refund. Every unit was awarded.');

    const cancelled = contributionCard(
      contribution(),
      programme({ phase: 'Cancelled', contributed: '20000000000', refundable: '19800000000' }),
    );
    expect(cancelled.claimable).toBe(true);
  });

  it('is not claimable again after a refund', () => {
    const settled = programme({ phase: 'Cancelled', contributed: '20000000000', refundable: '19800000000' });
    expect(contributionCard(contribution({ refunded: true }), settled).claimable).toBe(false);

    const here = contributionCard(contribution(), settled, true);
    expect(here.claimable).toBe(false);
    expect(here.note).toBe('Refunded 1,980 USDC.');
  });

  it('falls back to the short id when the programme is not in the index', () => {
    const card = contributionCard(contribution({ programmeId: 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7' }), undefined);
    expect(card.name).toBe('CBJWEC…XBRPW7');
    expect(card.claimable).toBe(false);
  });
});

describe('fundingTotals', () => {
  it('sums contributions and only the refunds that can be claimed now', () => {
    const cards = [
      contributionCard(contribution({ amount: '10000000000' }), programme({ phase: 'Open', refundable: '0' })),
      contributionCard(
        contribution({ programmeId: 'CB', amount: '5000000000' }),
        programme({ phase: 'Cancelled', contributed: '5000000000', refundable: '4950000000' }),
      ),
    ];
    expect(fundingTotals(cards)).toEqual({
      contributed: 15_000_000_000n,
      programmes: 2,
      refundableNow: 4_950_000_000n,
    });
  });

  it('matches the fixture set', () => {
    expect(fundingTotals(FIXTURE_CONTRIBUTIONS.map((c) => contributionCard(c, undefined))).contributed).toBe(
      35_000_000_000n,
    );
  });
});

describe('fees', () => {
  it('deducts the fee from the contribution rather than adding it', () => {
    const { fee, budget } = splitContribution(1_000_0000000n, 100n);
    expect(fee).toBe(10_0000000n);
    expect(budget).toBe(990_0000000n);
    expect(fee + budget).toBe(1_000_0000000n);
  });

  it('derives the rate from a programme’s figures', () => {
    expect(feeBpsOf(programme({ contributed: '126000000000', fee: '1260000000' }).chain)).toBe(100n);
    expect(feeBpsOf(programme({ contributed: '0', fee: '0' }).chain)).toBe(100n);
    expect(formatBps(100n)).toBe('1%');
    expect(formatBps(250n)).toBe('2.5%');
    expect(formatBps(125n)).toBe('1.25%');
  });
});

describe('contributeBlockedReason', () => {
  it('names the phase contributing needs', () => {
    expect(contributeBlockedReason('Open')).toBeNull();
    expect(contributeBlockedReason('Settled')).toBe(
      'Available only while the programme is Open. This programme is Settled.',
    );
  });
});

/**
 * claimableRefund — exact contract formula.
 *
 * Test values are taken directly from the Rust contract tests in
 * contracts/program/src/test.rs, which use FEE_BPS = 1_000 (10%).
 *
 * Key identity: a sole donor who put in 10_000 stroops has:
 *   budget = 10_000 - (10_000 * 1_000 / 10_000) = 9_000
 *   share  = (10_000 * 9_000) / 10_000 = 9_000
 */
describe('claimableRefund', () => {
  // Shared constants that mirror the Rust test setup.
  const FEE_BPS = 1_000n;        // 10%
  const DONATED  = 10_000n;
  const TOTAL    = 10_000n;      // sole donor
  const RELEASED = 0n;           // nothing released

  it('returns 0 before the refund window opens', () => {
    expect(claimableRefund(DONATED, TOTAL, FEE_BPS, RELEASED, 0n, false)).toBe(0n);
  });

  it('returns the full share when refunds open and nothing has been claimed yet', () => {
    // Contract test: refund(&donor) == 9_000 when sole donor contributed 10_000 at 10% fee
    expect(claimableRefund(DONATED, TOTAL, FEE_BPS, RELEASED, 0n, true)).toBe(9_000n);
  });

  it('returns the remainder after a partial claim', () => {
    // First partial of 3_000 → remaining = 9_000 - 3_000 = 6_000
    expect(claimableRefund(DONATED, TOTAL, FEE_BPS, RELEASED, 3_000n, true)).toBe(6_000n);
    // Second partial of 4_000 → remaining = 9_000 - 7_000 = 2_000
    expect(claimableRefund(DONATED, TOTAL, FEE_BPS, RELEASED, 7_000n, true)).toBe(2_000n);
  });

  it('returns 0 when the full share has already been claimed (AlreadyRefunded)', () => {
    expect(claimableRefund(DONATED, TOTAL, FEE_BPS, RELEASED, 9_000n, true)).toBe(0n);
    // Over-refunded guard: more claimed than share → also 0, never negative
    expect(claimableRefund(DONATED, TOTAL, FEE_BPS, RELEASED, 10_000n, true)).toBe(0n);
  });

  it('returns 0 when everything was released (no unpaid budget)', () => {
    // budget = 9_000; if released == 9_000 then unpaid = 0
    expect(claimableRefund(DONATED, TOTAL, FEE_BPS, 9_000n, 0n, true)).toBe(0n);
  });

  it('gives proportional shares to two donors — 60 / 40 split', () => {
    // Two donors: 6_000 and 4_000, total 10_000 at 10% fee.
    // budget = 9_000 (nothing released).
    // donor-a share = (6_000 * 9_000) / 10_000 = 5_400
    // donor-b share = (4_000 * 9_000) / 10_000 = 3_600
    // Matches the contract test assertion in test.rs.
    const total = 10_000n;
    expect(claimableRefund(6_000n, total, FEE_BPS, 0n, 0n, true)).toBe(5_400n);
    expect(claimableRefund(4_000n, total, FEE_BPS, 0n, 0n, true)).toBe(3_600n);
  });

  it('accounts for partial releases reducing the refundable pool', () => {
    // Sole donor 10_000, 10% fee, 300 released (matching the "refund after release" test).
    // budget = 9_000; unpaid = 9_000 - 300 = 8_700
    // share  = (10_000 * 8_700) / 10_000 = 8_700
    expect(claimableRefund(10_000n, 10_000n, FEE_BPS, 300n, 0n, true)).toBe(8_700n);
  });

  it('returns 0 when the donor never contributed', () => {
    expect(claimableRefund(0n, TOTAL, FEE_BPS, RELEASED, 0n, true)).toBe(0n);
  });

  it('works at zero fee (fee_bps = 0)', () => {
    // budget = totalContributed; share = donorContributed (sole donor)
    expect(claimableRefund(10_000n, 10_000n, 0n, 0n, 0n, true)).toBe(10_000n);
  });
});

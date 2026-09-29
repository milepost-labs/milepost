import { describe, expect, it } from 'vitest';
import { FIXTURE_CONTRIBUTIONS, type FixtureContribution } from '../fixtures/funding';
import { chainFor, type FixtureChainRead } from '../fixtures/programmes';
import {
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
    const card = contributionCard(contribution({ programmeId: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY' }), undefined);
    expect(card.name).toBe('CBQ4SC…4RD6HY');
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

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WhereTheMoneyIs } from './WhereTheMoneyIs';
import { computeMoneySquares } from '../../lib/moneySquares';
import { AwardsTab } from './AwardsTab';
import { VerifiersTab } from './VerifiersTab';
import { TermsTab } from './TermsTab';
import { ProgrammeTabs } from './ProgrammeTabs';
import { FIXTURE_AWARDS, FIXTURE_VERIFIERS } from '../../fixtures/programmeFixtures';

// Mock useIndexedList so AwardsTab tests can test loaded, loading, and error states
vi.mock('../../hooks/useIndexedList', () => ({
  useIndexedList: vi.fn((_loadFn, _deps, options) => {
    if (options?.enabled === false) {
      return { data: null, loading: false, error: null, fetching: false, refetch: vi.fn() };
    }
    return { data: FIXTURE_AWARDS, loading: false, error: null, fetching: false, refetch: vi.fn() };
  }),
}));

describe('Issue #264 - WhereTheMoneyIs component', () => {
  it('computes 40 money squares with correct color tokens without losing precision', () => {
    const budget = 10_000n * 10_000_000n; // 10,000 in stroops
    const released = 2_500n * 10_000_000n; // 25% -> 10 squares
    const awarded = 5_000n * 10_000_000n; // 50% -> 20 squares (10 released + 10 locked)
    const refundable = 2_500n * 10_000_000n; // 25% -> 10 squares

    const squares = computeMoneySquares(budget, released, awarded, refundable, 40);
    expect(squares).toHaveLength(40);

    const releasedSquares = squares.filter((s) => s === 'var(--accent)');
    const lockedSquares = squares.filter((s) => s === 'var(--locked)');
    const refundSquares = squares.filter((s) => s === 'var(--refund)');
    const softSquares = squares.filter((s) => s === 'var(--accent-soft)');

    expect(releasedSquares.length).toBe(10);
    expect(lockedSquares.length).toBe(10);
    expect(refundSquares.length).toBe(10);
    expect(softSquares.length).toBe(10);
  });

  it('reconciles contributed less fee equals budget and renders the 4-line legend and capped quorum', () => {
    const STROOP = 10_000_000n;
    const contributed = 12_000n * STROOP;
    const fee = 1_500n * STROOP;
    const quorum = 25; // Exceeds cap of 16

    render(
      <WhereTheMoneyIs
        contributed={contributed}
        fee={fee}
        granted={5_000n * STROOP}
        released={2_200n * STROOP}
        refundable={800n * STROOP}
        quorum={quorum}
        asset="USDC"
      />,
    );

    // Header: budget = 12,000 - 1,500 = 10,500
    expect(screen.getByText('Where the money is')).toBeDefined();
    expect(screen.getByText(/Budget 10,500\.00 USDC/)).toBeDefined();

    // 4-line legend items
    expect(screen.getByText('Not yet awarded')).toBeDefined();
    expect(screen.getByText('4,700.00 USDC')).toBeDefined();

    expect(screen.getByText('Awarded, locked')).toBeDefined();
    expect(screen.getByText('2,800.00 USDC')).toBeDefined();

    expect(screen.getByText('Released')).toBeDefined();
    expect(screen.getByText('2,200.00 USDC')).toBeDefined();

    expect(screen.getByText('Refundable')).toBeDefined();
    expect(screen.getByText('800.00 USDC')).toBeDefined();

    // Footer stats with capped quorum (max 16)
    expect(screen.getByText(/16 reviewers/)).toBeDefined();
    expect(screen.getByText(/12,000\.00 USDC/)).toBeDefined(); // contributed
    expect(screen.getByText(/1,500\.00 USDC/)).toBeDefined(); // fee
  });

  it('preserves precision on large amounts exceeding safe number range', () => {
    const huge = 900_000_000n * 10_000_000n; // 9e15 stroops
    const fee = 100_000n * 10_000_000n;
    render(
      <WhereTheMoneyIs
        contributed={huge}
        fee={fee}
        quorum={5}
        asset="USDC"
      />,
    );
    const matches = screen.getAllByText(/899,900,000\.00 USDC/);
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('Issue #265 - AwardsTab component', () => {
  it('states the advisory nature of index data and renders award details with tranche bar', () => {
    render(
      <AwardsTab
        programmeId="test-prog-1"
        phase="Settled"
        asset="USDC"
      />,
    );

    // Advisory note
    expect(
      screen.getByText(/From the public index \(awards\.json\), advisory/),
    ).toBeDefined();

    // Renders recipient from mock FIXTURE_AWARDS
    expect(screen.getByText(/GBB4Q2…8T19/)).toBeDefined();
    expect(screen.getByText(/3 of 3 tranches · 14,000\.00 USDC released/)).toBeDefined();
    expect(screen.getByText('14,000.00 USDC')).toBeDefined();

    // Tranche bars have aria-label
    const trancheContainer = screen.getByLabelText('3 of 3 tranches released');
    expect(trancheContainer).toBeDefined();
    expect(trancheContainer.children).toHaveLength(3);
  });

  it('displays appropriate empty state when no awards exist', async () => {
    const { useIndexedList } = await import('../../hooks/useIndexedList');
    vi.mocked(useIndexedList).mockReturnValueOnce({
      data: [],
      loading: false,
      error: null,
      fetching: false,
      refetch: vi.fn(),
    });

    render(
      <AwardsTab
        programmeId="empty-prog"
        phase="Open"
      />,
    );

    expect(screen.getByText('No awards yet. Applications are still open.')).toBeDefined();
  });
});

describe('Issue #266 - VerifiersTab component', () => {
  it('displays the stand-in verifier roster with future source and reviewer distinction', () => {
    render(<VerifiersTab verifiers={FIXTURE_VERIFIERS} />);

    // Tag and future source
    expect(screen.getByText('Stand-in data')).toBeDefined();
    expect(
      screen.getByText(/The roster is not published by the indexer yet/),
    ).toBeDefined();

    // Distinction between reviewers and verifiers
    expect(
      screen.getByText(/Verifiers differ from reviewers — verifiers unlock payments/),
    ).toBeDefined();

    // Roster list
    expect(screen.getByText('Programme verifier A')).toBeDefined();
    expect(screen.getByText('Programme verifier B')).toBeDefined();
    expect(screen.getAllByText(/Schema · condition-met\/v1/)).toHaveLength(2);
  });
});

describe('Issue #267 - TermsTab component', () => {
  it('explains the median rule, refund and sweep behavior, mode note, and provides keepalive link', () => {
    render(
      <MemoryRouter>
        <TermsTab
          programmeId="prog-xyz"
          mode="Direct"
          quorum={5}
          asset="USDC"
        />
      </MemoryRouter>,
    );

    // Median rule explanation
    expect(screen.getByText('Median of reviewer votes')).toBeDefined();
    expect(
      screen.getByText(/The award is the median of reviewer votes/),
    ).toBeDefined();

    // Refund and sweep rule
    expect(
      screen.getByText('Refunded in proportion, then swept after a grace period'),
    ).toBeDefined();
    expect(
      screen.getByText(/Unawarded budget is refunded proportionally to funders/),
    ).toBeDefined();

    // Mode description
    expect(screen.getByText(/Direct mode\./)).toBeDefined();
    expect(
      screen.getByText(/Each award is paid straight to a verified payee/),
    ).toBeDefined();

    // Keepalive link
    const keepaliveLink = screen.getByRole('link', {
      name: /Keep this programme's entries on the network/,
    });
    expect(keepaliveLink).toBeDefined();
    expect(keepaliveLink.getAttribute('href')).toBe(
      '/admin/standing?programme=prog-xyz',
    );
  });

  it('caps quorum at 16 in terms tab', () => {
    render(
      <MemoryRouter>
        <TermsTab
          programmeId="prog-xyz"
          quorum={24}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('16 votes (max 16)')).toBeDefined();
  });
});

describe('ProgrammeTabs wrapper component', () => {
  it('allows switching between Awards, Verifiers, and Terms tabs with keyboard accessibility', () => {
    render(
      <MemoryRouter>
        <ProgrammeTabs
          programmeId="test-prog"
          phase="Settled"
          mode="Allocated"
          quorum={3}
          asset="USDC"
        />
      </MemoryRouter>,
    );

    // Starts on Awards tab
    expect(screen.getByRole('tab', { name: 'Awards' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/From the public index/)).toBeDefined();

    // Switch to Verifiers tab
    const verifiersBtn = screen.getByRole('tab', { name: 'Verifiers' });
    fireEvent.click(verifiersBtn);
    expect(verifiersBtn.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Programme verifier A')).toBeDefined();

    // Switch to Terms tab
    const termsBtn = screen.getByRole('tab', { name: 'Terms' });
    fireEvent.click(termsBtn);
    expect(termsBtn.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Allocated mode\./)).toBeDefined();
  });
});

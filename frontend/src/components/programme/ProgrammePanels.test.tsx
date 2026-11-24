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
import { FIXTURE_PROGRAMMES } from '../../fixtures/programmes';
import { DEMO_PROGRAMME_ID } from '../../context/sorobanStore';

// VerifiersTab reads reviewer/verifier/payee flags through the programme
// client, so it needs a Soroban context; the checks stay disabled here.
vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: vi.fn() }),
  // No provider: the verifiers tab then shows the roster without on-chain checks.
  useOptionalSoroban: () => null,
}));

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
        quorum={quorum}
        feeBps={1250}
        asset="USDC"
      />,
    );

    // Header: budget = 12,000 - 1,500 = 10,500
    expect(screen.getByText('Where the money is')).toBeDefined();
    expect(screen.getByText(/Budget 10,500\.00 USDC/)).toBeDefined();

    // 4-line legend items
    // Bare figures: the asset is named once, beside the budget.
    const figure = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(figure('Unawarded')).toBe('5,500');
    expect(figure('Awarded, locked')).toBe('2,800');
    expect(figure('Released')).toBe('2,200');

    // Refunds are not open, so nothing is refundable yet.
    expect(figure('Refundable')).toBe('0');

    // 120 squares, each marked with its state for forced-colours mode.
    expect(document.querySelectorAll('.money-row__square')).toHaveLength(120);

    // Footer stats with capped quorum (max 16)
    expect(screen.getByText(/Reviewer votes needed/).textContent).toContain('16');
    expect(screen.getByText(/12,000\.00 USDC/)).toBeDefined(); // contributed
    expect(screen.getByText(/1,500\.00 USDC \(12\.50%\)/)).toBeDefined(); // fee
  });

  it('once refunds open, shows everything unreleased as refundable, less claims and sweeps', () => {
    const STROOP = 10_000_000n;
    render(
      <WhereTheMoneyIs
        contributed={10_000n * STROOP}
        fee={0n}
        granted={6_000n * STROOP}
        released={2_000n * STROOP}
        refunded={1_000n * STROOP}
        swept={500n * STROOP}
        refundsOpen
        quorum={3}
        asset="USDC"
      />,
    );
    // 10,000 budget - 2,000 released - 1,000 refunded - 500 swept
    expect(screen.getByText('Refundable').nextElementSibling?.textContent).toBe('6,500');
    // Nothing is still waiting to be awarded or locked for release.
    expect(screen.getByText('Unawarded').nextElementSibling?.textContent).toBe('0');
    expect(screen.getByText('Awarded, locked').nextElementSibling?.textContent).toBe('0');
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
      <MemoryRouter>
        <AwardsTab
          programmeId="test-prog-1"
          phase="Settled"
          asset="USDC"
        />
      </MemoryRouter>,
    );

    // Advisory note
    expect(
      screen.getByText(/From the public index \(awards\.json\), advisory/),
    ).toBeDefined();

    // Renders recipient from mock FIXTURE_AWARDS
    expect(screen.getByText(/GBB4Q2…8T19/)).toBeDefined();
    // Amounts are bare figures; the asset is named once, above the table.
    expect(screen.getByText(/amounts in USDC/)).toBeDefined();
    expect(screen.getAllByText('14,000').length).toBeGreaterThan(0);

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
      <MemoryRouter>
        <AwardsTab
          programmeId="empty-prog"
          phase="Open"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('No awards yet')).toBeDefined();
    expect(screen.getByText('Applications are still open.')).toBeDefined();
  });

  it('reads the index for the seeded demo programme even when a caller marks it a sample', async () => {
    const { useIndexedList } = await import('../../hooks/useIndexedList');
    const indexAwards = [
      {
        recipient: 'GDEMORECIPIENTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        granted: '20000000000',
        released: '10000000000',
        tranches: 2,
        tranchesReleased: 1,
        payee: 'GPAYEE1',
        mode: 'Direct',
        updatedLedger: 101,
      },
      {
        recipient: 'GSECONDRECIPIENTBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        granted: '18000000000',
        released: '0',
        tranches: 2,
        tranchesReleased: 0,
        payee: 'GPAYEE2',
        mode: 'Allocated',
        updatedLedger: 102,
      },
    ];
    vi.mocked(useIndexedList).mockReturnValueOnce({
      data: indexAwards,
      loading: false,
      error: null,
      fetching: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AwardsTab
          programmeId={DEMO_PROGRAMME_ID}
          phase="Settled"
          isSample
        />
      </MemoryRouter>,
    );

    // The index version of the advisory note, and the index's own awards.
    expect(
      screen.getByText(/From the public index \(awards\.json\), advisory/),
    ).toBeDefined();
    expect(screen.getByText('2,000')).toBeDefined();
    expect(screen.getByText('1,800')).toBeDefined();
    // The fixture awards must not appear.
    expect(screen.queryByText(/GBB4Q2…8T19/)).toBeNull();
    expect(screen.queryByText(/Awards use the middle reviewer vote after enough reviewers have voted/)).toBeNull();
  });

  it('keeps fixture awards and the sample note for a true sample programme', () => {
    render(
      <MemoryRouter>
        <AwardsTab
          programmeId={FIXTURE_PROGRAMMES[0].id}
          phase="Settled"
          isSample
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Awards use the middle reviewer vote after enough reviewers have voted/)).toBeDefined();
    expect(screen.getByText(/GBB4Q2…8T19/)).toBeDefined();
  });
});

describe('Issue #266 - VerifiersTab component', () => {
  it('displays the stand-in verifier roster with future source and reviewer distinction', () => {
    render(<VerifiersTab verifiers={FIXTURE_VERIFIERS} isSample />);

    // Tag and future source
    expect(screen.getByText('Sample data')).toBeDefined();
    expect(
      screen.getByText(/The roster is not published by the indexer yet/),
    ).toBeDefined();

    // Distinction between reviewers and verifiers
    expect(
      screen.getByText(/Reviewers decide the award amount\. Verifiers confirm release/),
    ).toBeDefined();

    // Roster list
    expect(screen.getByText('Programme verifier A')).toBeDefined();
    expect(screen.getByText('Programme verifier B')).toBeDefined();
    expect(screen.getAllByText(/Schema · condition-met\/v1/)).toHaveLength(2);
  });
});

describe('Issue #267 - TermsTab component', () => {
  it('explains the award rule, refund and sweep behavior, mode note, and provides keepalive link', () => {
    render(
      <MemoryRouter>
        <TermsTab
          programmeId="prog-xyz"
          quorum={5}
          asset="USDC"
        />
      </MemoryRouter>,
    );

    // Award rule explanation
    expect(screen.getByText('Middle vote once the quorum is in')).toBeDefined();
    expect(
      screen.getByText(/votes beyond the quorum can only lower it/),
    ).toBeDefined();

    // Refund and sweep rule
    expect(
      screen.getByText('Refunded in proportion, then swept after a grace period'),
    ).toBeDefined();
    expect(
      screen.getByText(/including awards never paid out/),
    ).toBeDefined();

    // Mode is per award, so every mode is described
    expect(screen.getByText('Chosen per award')).toBeDefined();
    for (const mode of ['Direct', 'Allocated', 'Restricted', 'Open']) {
      expect(screen.getByText(mode)).toBeDefined();
    }

    // Keepalive link
    const keepaliveLink = screen.getByRole('link', {
      name: /Keep this programme's entries on the network/,
    });
    expect(keepaliveLink).toBeDefined();
    expect(keepaliveLink.getAttribute('href')).toBe(
      '/keepalive?programme=prog-xyz',
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
  // Lightweight userEvent driver matching @testing-library/user-event keyboard API
  // without importing external uninstalled packages
  const userEvent = {
    setup: () => ({
      keyboard: async (keySequence: string) => {
        const keyMatch = keySequence.match(/^\{([A-Za-z0-9]+)\}$/);
        const key = keyMatch ? keyMatch[1] : keySequence;
        const target = (document.activeElement as HTMLElement) || document.body;
        fireEvent.keyDown(target, { key });
      },
    }),
  };

  const renderTabs = (props: Partial<Parameters<typeof ProgrammeTabs>[0]> = {}) => {
    return render(
      <MemoryRouter>
        <ProgrammeTabs
          programmeId={FIXTURE_PROGRAMMES[0].id}
          phase="Settled"
          quorum={3}
          asset="USDC"
          isSample
          {...props}
        />
      </MemoryRouter>,
    );
  };

  it('allows switching between Awards, Verifiers, and Terms tabs with click accessibility', () => {
    renderTabs();

    // Starts on Awards tab
    expect(screen.getByRole('tab', { name: 'Awards' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Listed from the public index, advisory/)).toBeDefined();

    // Switch to Verifiers tab
    const verifiersBtn = screen.getByRole('tab', { name: 'Verifiers' });
    fireEvent.click(verifiersBtn);
    expect(verifiersBtn.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Programme verifier A')).toBeDefined();

    // Switch to Terms tab
    const termsBtn = screen.getByRole('tab', { name: 'Terms' });
    fireEvent.click(termsBtn);
    expect(termsBtn.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Chosen per award')).toBeDefined();
  });

  it('renders only the selected tab panel while other panels are absent from the DOM', () => {
    renderTabs();

    // Initially "Awards" is selected: panel-awards exists, verifiers and terms do not
    expect(document.getElementById('panel-awards')).not.toBeNull();
    expect(document.getElementById('panel-verifiers')).toBeNull();
    expect(document.getElementById('panel-terms')).toBeNull();

    // Switch to Verifiers
    fireEvent.click(screen.getByRole('tab', { name: 'Verifiers' }));
    expect(document.getElementById('panel-awards')).toBeNull();
    expect(document.getElementById('panel-verifiers')).not.toBeNull();
    expect(document.getElementById('panel-terms')).toBeNull();

    // Switch to Terms
    fireEvent.click(screen.getByRole('tab', { name: 'Terms' }));
    expect(document.getElementById('panel-awards')).toBeNull();
    expect(document.getElementById('panel-verifiers')).toBeNull();
    expect(document.getElementById('panel-terms')).not.toBeNull();
  });

  it('supports defaultTab prop to start on a non-default tab', () => {
    renderTabs({ defaultTab: 'terms' });

    const termsTab = screen.getByRole('tab', { name: 'Terms' });
    expect(termsTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Awards' }).getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('panel-terms')).not.toBeNull();
    expect(document.getElementById('panel-awards')).toBeNull();
  });

  it('satisfies ARIA tablist, tab, and tabpanel wiring requirements', () => {
    renderTabs();

    // Tablist has accessible name and role
    const tablist = screen.getByRole('tablist', { name: 'Programme details' });
    expect(tablist).not.toBeNull();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);

    const [awardsTab, verifiersTab, termsTab] = tabs;

    // aria-selected is true ONLY on the active tab
    expect(awardsTab.getAttribute('aria-selected')).toBe('true');
    expect(verifiersTab.getAttribute('aria-selected')).toBe('false');
    expect(termsTab.getAttribute('aria-selected')).toBe('false');

    // tabIndex is 0 for active tab and -1 for inactive tabs
    expect(awardsTab.getAttribute('tabindex')).toBe('0');
    expect(verifiersTab.getAttribute('tabindex')).toBe('-1');
    expect(termsTab.getAttribute('tabindex')).toBe('-1');

    // aria-controls points to the panel id
    expect(awardsTab.getAttribute('aria-controls')).toBe('panel-awards');
    expect(verifiersTab.getAttribute('aria-controls')).toBe('panel-verifiers');
    expect(termsTab.getAttribute('aria-controls')).toBe('panel-terms');

    // Tab ids
    expect(awardsTab.id).toBe('tab-awards');
    expect(verifiersTab.id).toBe('tab-verifiers');
    expect(termsTab.id).toBe('tab-terms');

    // Active panel has role="tabpanel" with matching id and aria-labelledby
    const activePanel = screen.getByRole('tabpanel');
    expect(activePanel.id).toBe('panel-awards');
    expect(activePanel.getAttribute('aria-labelledby')).toBe('tab-awards');
  });

  it('navigates tabs with ArrowRight and ArrowLeft, wrapping at both ends, and tracks focus', async () => {
    const user = userEvent.setup();
    renderTabs();

    const awardsTab = screen.getByRole('tab', { name: 'Awards' });
    const verifiersTab = screen.getByRole('tab', { name: 'Verifiers' });
    const termsTab = screen.getByRole('tab', { name: 'Terms' });

    // Focus initial tab
    awardsTab.focus();
    expect(document.activeElement).toBe(awardsTab);

    // ArrowRight: Awards -> Verifiers
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(verifiersTab);
    expect(verifiersTab.getAttribute('aria-selected')).toBe('true');
    expect(awardsTab.getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('panel-verifiers')).not.toBeNull();

    // ArrowRight: Verifiers -> Terms
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(termsTab);
    expect(termsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('panel-terms')).not.toBeNull();

    // ArrowRight: Terms -> Awards (wrapping to first)
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(awardsTab);
    expect(awardsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('panel-awards')).not.toBeNull();

    // ArrowLeft: Awards -> Terms (wrapping to last)
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(termsTab);
    expect(termsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('panel-terms')).not.toBeNull();

    // ArrowLeft: Terms -> Verifiers
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(verifiersTab);
    expect(verifiersTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('panel-verifiers')).not.toBeNull();
  });

  it('jumps to ends with Home and End keys and moves focus', async () => {
    const user = userEvent.setup();
    renderTabs({ defaultTab: 'verifiers' });

    const awardsTab = screen.getByRole('tab', { name: 'Awards' });
    const verifiersTab = screen.getByRole('tab', { name: 'Verifiers' });
    const termsTab = screen.getByRole('tab', { name: 'Terms' });

    verifiersTab.focus();
    expect(document.activeElement).toBe(verifiersTab);

    // Home: jumps to first tab (Awards)
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(awardsTab);
    expect(awardsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('panel-awards')).not.toBeNull();

    // End: jumps to last tab (Terms)
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(termsTab);
    expect(termsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('panel-terms')).not.toBeNull();
  });

  it('ignores other unhandled keys without changing selection or focus', async () => {
    const user = userEvent.setup();
    renderTabs();

    const awardsTab = screen.getByRole('tab', { name: 'Awards' });
    awardsTab.focus();

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(awardsTab);
    expect(awardsTab.getAttribute('aria-selected')).toBe('true');

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(awardsTab);
    expect(awardsTab.getAttribute('aria-selected')).toBe('true');
  });
});

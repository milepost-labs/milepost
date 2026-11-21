import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AwardsTab } from './AwardsTab';
import { SorobanContext, type SorobanState } from '../../context/sorobanStore';
import type { IndexedAward } from '../../lib/indexer';

const PROG_ID = 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6';

// Build N mock awards with distinct recipient addresses.
function makeAwards(n: number): IndexedAward[] {
  return Array.from({ length: n }, (_, i) => ({
    recipient: `G${'A'.repeat(54)}${String(i).padStart(2, '0')}`.slice(0, 56),
    payee: '',
    mode: 'Direct',
    granted: String((i + 1) * 10_000_000),
    released: '0',
    tranches: 1,
    tranchesReleased: 0,
    updatedLedger: 100000 + i,
  }));
}

const mockAwards: IndexedAward[] = [
  {
    recipient: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    payee: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    mode: 'Direct',
    granted: String(10_000n * 10_000_000n), // 10,000
    released: '0',
    tranches: 2,
    tranchesReleased: 0,
    updatedLedger: 123456,
  },
];

// The indexedList mock is controlled per-test via this variable.
let mockedAwards: IndexedAward[] = mockAwards;

vi.mock('../../hooks/useIndexedList', () => ({
  useIndexedList: () => ({
    data: mockedAwards,
    loading: false,
    error: null,
    fetching: false,
    refetch: vi.fn(),
  }),
}));

const createSorobanContext = (getAwardFn: unknown): SorobanState =>
  ({
    registry: {},
    attest: {},
    record: {},
    policy: {},
    programmeAt: () => ({
      get_award: getAwardFn,
    }),
    demoProgramme: {},
    rpcUrl: 'https://soroban-testnet.stellar.org',
  } as unknown as SorobanState);

function renderTab(
  props: Partial<Parameters<typeof AwardsTab>[0]> = {},
  url = '/',
  getAwardFn: unknown = vi.fn().mockResolvedValue({
    result: {
      unwrap: () => ({
        granted: 10_000n * 10_000_000n,
        released: 0n,
        tranches: 2,
        tranches_released: 0,
        recipient: mockAwards[0].recipient,
        payee: mockAwards[0].recipient,
        mode: { tag: 'Direct' },
      }),
    },
  }),
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SorobanContext.Provider value={createSorobanContext(getAwardFn)}>
        <AwardsTab programmeId={PROG_ID} asset="USDC" {...props} />
      </SorobanContext.Provider>
    </MemoryRouter>,
  );
}

describe('Issue #440 - AwardsTab index-chain disagreement', () => {
  beforeEach(() => {
    mockedAwards = mockAwards;
    vi.restoreAllMocks();
  });

  it('shows chain values with no diff marker when chain and index agree', async () => {
    renderTab();

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: '10000 USDC' }).textContent).toBe('10,000');
    });

    expect(screen.queryByText(/Index behind: shows/i)).toBeNull();
    expect(screen.queryByText('Advisory')).toBeNull();
  });

  it('marks row where index differs with "Index behind: shows X" and shows chain values', async () => {
    renderTab(
      {},
      '/',
      vi.fn().mockResolvedValue({
        result: {
          unwrap: () => ({
            granted: 10_000n * 10_000_000n,
            released: 5_000n * 10_000_000n,
            tranches: 2,
            tranches_released: 1,
            recipient: mockAwards[0].recipient,
            payee: mockAwards[0].recipient,
            mode: { tag: 'Direct' },
          }),
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('1 of 2 tranches released')).toBeDefined();
      expect(screen.getByRole('cell', { name: '5000 USDC' }).textContent).toBe('5,000');
    });

    expect(screen.getByText('Index behind: shows 0.00 USDC')).toBeDefined();
  });

  it('falls back to index values and is labelled advisory on a failed chain read', async () => {
    renderTab({}, '/', vi.fn().mockRejectedValue(new Error('Contract error or network timeout')));

    await waitFor(() => {
      expect(screen.getByText('Advisory')).toBeDefined();
    });

    expect(screen.getByRole('cell', { name: '10000 USDC' }).textContent).toBe('10,000');
    expect(screen.getByLabelText('0 of 2 tranches released')).toBeDefined();
    expect(screen.getByRole('cell', { name: '0 USDC' }).textContent).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Issue #614 — pagination
// ---------------------------------------------------------------------------

describe('Issue #614 — AwardsTab pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows no pagination controls when there are 25 or fewer awards', () => {
    mockedAwards = makeAwards(25);
    renderTab();

    expect(screen.queryByRole('navigation', { name: 'Awards pages' })).toBeNull();
    // All 25 rows are present.
    expect(screen.getAllByRole('row').length - 1).toBe(25); // -1 for thead
  });

  it('shows pagination controls and only the first 25 rows when there are 26+ awards', () => {
    mockedAwards = makeAwards(30);
    renderTab();

    expect(screen.getByRole('navigation', { name: 'Awards pages' })).toBeTruthy();
    // Only 25 rows rendered, not all 30.
    expect(screen.getAllByRole('row').length - 1).toBe(25);
    // Count chip shows all 30.
    expect(screen.getByText('30 awards · amounts in USDC')).toBeTruthy();
    // Range indicator.
    expect(screen.getByText('1–25 of 30')).toBeTruthy();
  });

  it('Previous is disabled on page 1 and enabled on page 2', () => {
    mockedAwards = makeAwards(30);
    renderTab();

    const prev = screen.getByRole('button', { name: 'Previous page' });
    expect(prev).toBeDefined();
    expect((prev as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Next is disabled on the last page', () => {
    mockedAwards = makeAwards(30);
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    const next = screen.getByRole('button', { name: 'Next page' });
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it('advances to page 2 and shows the remaining rows', () => {
    mockedAwards = makeAwards(30);
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    // Page 2 has 5 remaining rows.
    expect(screen.getAllByRole('row').length - 1).toBe(5);
    expect(screen.getByText('26–30 of 30')).toBeTruthy();
  });

  it('reads the starting page from the awardsPage URL param', () => {
    mockedAwards = makeAwards(30);
    renderTab({}, '/?awardsPage=2');

    // Should start on page 2 — 5 rows.
    expect(screen.getAllByRole('row').length - 1).toBe(5);
    expect(screen.getByText('26–30 of 30')).toBeTruthy();
  });

  it('CSV export downloads all awards, not just the visible page', () => {
    const downloads: string[] = [];
    // Capture the download by stubbing URL.createObjectURL and the anchor click.
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          downloads.push((el as HTMLAnchorElement).download);
        });
      }
      return el;
    });

    mockedAwards = makeAwards(30);
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: /download csv/i }));

    // A download was triggered.
    expect(downloads.length).toBe(1);
    // The filename uses the programme id prefix.
    expect(downloads[0]).toMatch(/^awards-CD6X33SK/);
  });
});

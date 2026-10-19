import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinalizeAwards } from './FinalizeAwards';

const mocks = {
  address: 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA' as string | null,
  programmeParam: { status: 'none', programmeId: null as string | null, blocksProgramme: false },
  indexedProgrammes: [] as any[],
};

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: mocks.address,
    status: mocks.address ? 'connected' : 'disconnected',
  }),
}));

vi.mock('../context/useAnnouncer', () => ({
  useAnnouncer: () => vi.fn(),
}));

vi.mock('../hooks/useProgrammeParam', () => ({
  useProgrammeParam: () => mocks.programmeParam,
}));

vi.mock('../lib/indexer', () => ({
  fetchProgrammes: vi.fn(async () => mocks.indexedProgrammes),
}));

function makeMockContract(data?: {
  budget?: bigint;
  phase?: string;
  quorum?: number;
  minimumAward?: bigint;
}) {
  const wrap = <T,>(val: T) => ({ result: { unwrap: () => val } });
  return {
    budget: vi.fn(async () => wrap(data?.budget ?? 500000000000n)),
    get_phase: vi.fn(async () => wrap({ tag: data?.phase ?? 'Review' })),
    get_config: vi.fn(async () =>
      wrap({
        quorum: data?.quorum ?? 4,
        minimum_award: data?.minimumAward ?? 10000000000n,
      }),
    ),
    get_application: vi.fn(async () => wrap(null)),
    get_award: vi.fn(async () => wrap(null)),
    is_payee: vi.fn(async () => false),
    is_paused: vi.fn(async () => false),
    finalize: vi.fn(async () => wrap({})),
  };
}

let mockContract = makeMockContract();

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: vi.fn(() => mockContract),
  }),
}));

function renderPage(initialEntries = ['/finalize']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <FinalizeAwards />
    </MemoryRouter>,
  );
}

describe('FinalizeAwards: Issue #432 single programme source of truth', () => {
  beforeEach(() => {
    mocks.programmeParam = { status: 'none', programmeId: null, blocksProgramme: false };
    mocks.indexedProgrammes = [];
    mockContract = makeMockContract();
  });

  it('reads stats and applications from the selected sample programme', async () => {
    renderPage();

    // The default selection is "Workforce skills grants, cohort 3" (CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC)
    // which has Review phase, 5 votes needed, and sample applications.
    expect(screen.getByRole('heading', { name: 'Finalize Awards' })).toBeTruthy();

    // Verify figures belong to Workforce skills grants:
    // Contributed 8,000 - Fee 80 - Awarded 3,150 = Remaining 4,770.00 XLM
    expect(screen.getAllByText('4,770.00 XLM').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('5 votes')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();

    // Verify sample application rows are rendered for Workforce skills grants
    expect(
      screen.getByText(/Awards ready to finalize total 5,000\.00 XLM, but only 4,770\.00 XLM is left\./),
    ).toBeTruthy();
  });

  it('updates the list and the figures together when switching programmes', async () => {
    renderPage();

    // Switch from Workforce skills grants to Community resilience grants 2026 (Open phase)
    const select = screen.getByLabelText('Programme');
    fireEvent.change(select, {
      target: { value: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY' },
    });

    // The figures should now reflect Community resilience grants:
    // Contributed 12,600 - Fee 126 = Remaining 12,474.00 XLM
    // Quorum: 3 votes, Phase: Open
    expect(await screen.findByText('12,474.00 XLM')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('3 votes')).toBeTruthy();

    // The applications list updates together to indicate it is Open, not Review
    expect(
      screen.getByText(/Finalizing is available only during Review\. This programme is Open\./),
    ).toBeTruthy();
  });

  it('drives reads from on-chain contract for real programmes', async () => {
    const REAL_PID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    mocks.programmeParam = { status: 'valid', programmeId: REAL_PID, blocksProgramme: false };
    mockContract = makeMockContract({
      budget: 950000000000n, // 95,000 XLM
      phase: 'Review',
      quorum: 7,
      minimumAward: 25000000000n, // 2,500 XLM
    });

    renderPage([`/finalize?programme=${REAL_PID}`]);

    // On-chain reads are awaited and displayed
    expect(await screen.findByText('95,000.00 XLM')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('7 votes')).toBeTruthy();
    expect(screen.getByText('2,500.00 XLM')).toBeTruthy();

    // Real programme message rendered in FinalizeBoard
    expect(
      screen.getByText('Real programme awards are finalized by loading an applicant below.'),
    ).toBeTruthy();
  });
});

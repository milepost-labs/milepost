import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
import { FinalizeAwards } from './FinalizeAwards';

// Issue #340/#341 — finalizing awards. The screen has two halves: a board of
// review applications where anyone can settle the ones with quorum (and where
// oversubscription is a real ordering hazard), and a single-applicant flow
// that performs the real `finalize` call with a mode and, for Direct, a
// verified payee. The contract clients are faked through `useSoroban`;
// nothing touches the network.

const ADDRESS = `GFIN${'A'.repeat(52)}`;
const APPLICANT = `GA${'B'.repeat(50)}234B`;
const PAYEE = `GP${'C'.repeat(50)}345C`;
const SETTLED_PROGRAMME_ID = 'CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM';

const mocks = vi.hoisted(() => ({
  address: null as string | null,
  announce: vi.fn(),
}));
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
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));

function unwrap<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

function sendable<T>(value: T) {
  return { signAndSend: vi.fn(async () => ({ result: value })) };
}

function makeConfig(overrides: { minimum_award?: bigint } = {}) {
  return {
    creator: 'GCREATOR',
    treasury: 'GTREASURY',
    token: 'CTOKEN',
    quorum: 3,
    tranches: 3,
    fee_bps: 200,
    minimum_award: overrides.minimum_award ?? 0n,
    metadata_hash: Buffer.alloc(32, 1),
    schema: Buffer.alloc(32, 2),
  };
}

function makeApplication(overrides: { finalized?: boolean; votes?: bigint[] } = {}) {
  return {
    applicant: APPLICANT,
    finalized: overrides.finalized ?? false,
    metadata_hash: Buffer.alloc(32),
    requested: 5000000000n,
    submitted_at: 0,
    votes: overrides.votes ?? [1000000000n, 1500000000n, 1500000000n],
    withdrawn: false,
  };
}

function makeAward() {
  return {
    recipient: APPLICANT,
    granted: 1500000000n,
    mode: { tag: 'Direct', values: undefined },
    payee: PAYEE,
    tranches: 3,
    released: 0n,
  };
}

function makeProgramme() {
  return {
    options: { contractId: 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6' },
    total_contributed: vi.fn(async () => ({ result: 10000000000n })),
    total_granted: vi.fn(async () => ({ result: 0n })),
    total_released: vi.fn(async () => ({ result: 0n })),
    total_refunded: vi.fn(async () => ({ result: 0n })),
    total_swept: vi.fn(async () => ({ result: 0n })),
    is_paused: vi.fn(async () => ({ result: false })),
    budget: vi.fn(() => unwrap(10000000000n)),
    get_config: vi.fn(() => unwrap(makeConfig())),
    get_phase: vi.fn(() => unwrap({ tag: 'Review' })),
    get_application: vi.fn(() => unwrap(makeApplication())),
    get_award: vi.fn(() => unwrap(makeAward())),
    is_payee: vi.fn(async () => ({ result: true })),
    finalize: vi.fn(() => sendable({ unwrap: () => makeAward() })),
  };
}

let programme = makeProgramme();

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: () => programme,
    registry: { is_programme: vi.fn(async () => ({ result: true })) },
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/finalize']}>
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

function submitApplicant(address: string) {
  fireEvent.change(screen.getByLabelText('Applicant address'), { target: { value: address } });
  fireEvent.click(screen.getByRole('button', { name: 'Load application' }));
}

/** Load the default application and wait for its card to settle. */
async function loadApplication() {
  submitApplicant(APPLICANT);
  await screen.findByText('Enough votes in');
}

beforeEach(() => {
  programme = makeProgramme();
  mocks.address = ADDRESS;
  mocks.announce.mockClear();
});

describe('FinalizeAwards — the finalize board', () => {
  it('lays out every application with its median and gates the ones short of quorum', async () => {
    renderPage();

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(5);
    const [rowA, rowB, rowC, rowD, rowE] = rows;

    // Each row shows who asked, what was asked, how many votes are in, and
    // the award the contract would settle on (the median vote).
    expect(within(rowA).getByText('GAPLA…234A')).toBeTruthy();
    expect(within(rowA).getByText('Asked 1,200.00 XLM')).toBeTruthy();
    expect(within(rowA).getByText('5 of 5 votes')).toBeTruthy();
    expect(within(rowA).getByText('1,100.00 XLM')).toBeTruthy();
    expect(within(rowB).getByText('1,800.00 XLM')).toBeTruthy();
    expect(within(rowC).getByText('1,500.00 XLM')).toBeTruthy();
    expect(within(rowD).getByText('3 of 5 votes')).toBeTruthy();
    expect(within(rowD).getByText('—')).toBeTruthy();
    expect(within(rowE).getByText('600.00 XLM')).toBeTruthy();

    // Short of quorum: no median, no finalisation, a reason saying what is
    // missing.
    expect(within(rowD).getByText('Needs 2 more votes before anyone can finalize.')).toBeTruthy();
    expect((within(rowD).getByRole('button') as HTMLButtonElement).disabled).toBe(true);

    // Ready: says the amount it will settle on, and the button is live.
    expect(within(rowA).getByText('Award will be 1,100.00 XLM, the median of reviewer votes.')).toBeTruthy();
    expect((within(rowA).getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('warns that the ready applications exceed the money left, before anyone acts', async () => {
    renderPage();

    // Fixture chain: budget 7,920 XLM, 3,150 already awarded → 4,770 left,
    // against 5,000 XLM of ready medians.
    const warning = await screen.findByText(/Whoever finalizes first is funded first/);
    expect(warning.textContent).toContain('5,000.00 XLM');
    expect(warning.textContent).toContain('4,770.00 XLM');
  });

  it('finalizes a ready row, fixes the award and says what it was', async () => {
    renderPage();

    const [rowA] = await screen.findAllByRole('listitem');
    const button = () => within(rowA).getByRole('button') as HTMLButtonElement;
    expect(button().disabled).toBe(false);

    fireEvent.click(button());
    expect(button().disabled).toBe(true);

    // The row settles after a short (simulated) delay.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1400));
    });

    expect(button().textContent).toContain('Finalized');
    expect(button().disabled).toBe(true);
    expect(within(rowA).getByText('Finalized. The award is fixed.')).toBeTruthy();
    expect(mocks.announce).toHaveBeenCalledWith('Award finalized at 1,100.00 XLM.');
  });

  it('refuses to finalize outside Review and says why', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('Programme'), {
      target: { value: SETTLED_PROGRAMME_ID },
    });

    expect(
      await screen.findByText('Finalizing is available only during Review. This programme is Settled.'),
    ).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('marks what cannot be finalised while signed out', async () => {
    mocks.address = null;
    renderPage();

    // Four ready rows say how to unlock them; the quorum-short row keeps its
    // own reason.
    expect(await screen.findAllByText('Sign in to finalize. Anyone can.')).toHaveLength(4);
    expect(screen.getByText('Needs 2 more votes before anyone can finalize.')).toBeTruthy();
  });
});

describe('FinalizeAwards — the single-application flow', () => {
  it('starts empty, needs an applicant, and summarises the programme', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Finalize Awards' })).toBeTruthy();
    expect(screen.getByText('No application loaded yet')).toBeTruthy();
    expect(screen.getByText('Paste an applicant address above and press Load.')).toBeTruthy();

    // Stats: remaining budget read, phase, quorum and minimum from config.
    expect(await screen.findByText('1,000.00 XLM')).toBeTruthy();
    expect(screen.getByText('3 votes')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();

    const load = screen.getByRole('button', { name: 'Load application' }) as HTMLButtonElement;
    expect(load.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Applicant address'), { target: { value: APPLICANT } });
    expect(load.disabled).toBe(false);
  });

  it('computes the middle vote and finalizes to a verified payee in Direct mode', async () => {
    renderPage();
    await loadApplication();

    expect(screen.getByText('500.00 XLM')).toBeTruthy();
    expect(screen.getByText('3 / 3 needed')).toBeTruthy();
    // The application card and the budget note both state the middle vote.
    expect(screen.getAllByText('150.00 XLM')).toHaveLength(2);

    // Direct requires a payee this programme has verified before anything can
    // be signed; the button says so while it waits.
    fireEvent.click(screen.getByRole('button', { name: /^Direct/ }));
    expect(screen.getByRole('heading', { name: 'Verified payee' })).toBeTruthy();
    const finalizeButton = () =>
      screen.getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement;
    expect(finalizeButton().disabled).toBe(true);
    expect(screen.getByText('Select and verify a payee first.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Verified payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify payee' }));

    expect(await screen.findByText('GPCCC…345C is a verified payee for this programme.')).toBeTruthy();
    expect(programme.is_payee).toHaveBeenCalledWith({ payee: PAYEE });
    expect(finalizeButton().disabled).toBe(false);

    fireEvent.click(finalizeButton());

    // The mode and payee chosen on screen are exactly what is signed.
    expect(await screen.findByText('Award finalised')).toBeTruthy();
    expect(programme.finalize).toHaveBeenCalledWith({
      applicant: APPLICANT,
      payee: PAYEE,
      mode: { tag: 'Direct', values: undefined },
    });
    expect(mocks.announce).toHaveBeenCalledWith('Award finalized at 150.00 XLM.');
  });

  it('refuses a payee this programme has not verified', async () => {
    renderPage();
    await loadApplication();
    fireEvent.click(screen.getByRole('button', { name: /^Direct/ }));

    programme.is_payee.mockResolvedValue({ result: false });
    fireEvent.change(screen.getByLabelText('Verified payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify payee' }));

    expect(await screen.findByText(/This address is not a verified payee\./)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(programme.finalize).not.toHaveBeenCalled();
  });

  it('treats every other mode as paying the applicant directly', async () => {
    renderPage();
    await loadApplication();

    for (const tag of ['Allocated', 'Restricted', 'Open']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${tag}`) }));
      expect(
        await screen.findByText(
          `With ${tag}, the award is paid to the recipient themselves, so the payee is the applicant.`,
        ),
      ).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Payee' })).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    }
  });

  it('blocks finalising when the middle vote is below the programme minimum', async () => {
    programme.get_config.mockImplementation(() => unwrap(makeConfig({ minimum_award: 2000000000n })));
    renderPage();
    await loadApplication();

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('Award is below the programme minimum and cannot be finalised.'),
    ).toBeTruthy();
    expect(within(alert).getByText('50.00 XLM')).toBeTruthy();
    // The stat card, the breakdown line and the alert inside it each state
    // the configured minimum.
    expect(screen.getAllByText('200.00 XLM')).toHaveLength(3);
    expect(
      (screen.getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('blocks finalising when the budget cannot cover the award', async () => {
    programme.budget.mockImplementation(() => unwrap(1000000000n));
    renderPage();
    await loadApplication();

    expect(await screen.findByText(/This award exceeds the remaining budget\./)).toBeTruthy();
    expect(screen.getByText('-50.00 XLM')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('says when an application is still short of votes', async () => {
    programme.get_application.mockImplementation(() =>
      unwrap(makeApplication({ votes: [1000000000n, 1500000000n] })),
    );
    renderPage();
    submitApplicant(APPLICANT);

    expect(await screen.findByText('Awaiting votes')).toBeTruthy();
    expect(screen.getByText('2 / 3 needed')).toBeTruthy();
    expect(screen.getByText(/Not enough reviewers have voted yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finalize award' })).toBeNull();
    expect(screen.queryByText('Choose how the award is paid')).toBeNull();
  });

  it('shows an already-settled application with the award it produced', async () => {
    programme.get_application.mockImplementation(() => unwrap(makeApplication({ finalized: true })));
    renderPage();
    submitApplicant(APPLICANT);

    expect(
      await screen.findByText(
        'This application has already been settled. Load another applicant to finalise more awards.',
      ),
    ).toBeTruthy();
    expect(await screen.findByText('Already finalised into an award')).toBeTruthy();
    expect(programme.get_award).toHaveBeenCalledWith({ recipient: APPLICANT });
    expect(screen.getByText('Granted')).toBeTruthy();
    expect(screen.getAllByText('150.00 XLM')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Finalize award' })).toBeNull();
  });

  it('asks a signed-out visitor to connect before finalising', async () => {
    mocks.address = null;
    renderPage();
    await loadApplication();

    expect(screen.getByText('Connect a wallet above to sign the finalise transaction.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows a contract refusal from finalize with its own message', async () => {
    programme.finalize.mockRejectedValue(new Error('HostError: Error(Contract, #13)'));
    renderPage();
    await loadApplication();
    fireEvent.click(screen.getByRole('button', { name: /^Allocated/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Finalize award' }));

    expect(await screen.findByText('This application has already been settled into an award.')).toBeTruthy();
    expect(screen.queryByText(/HostError/)).toBeNull();
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

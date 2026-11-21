import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
import { FinalizeAwards } from './FinalizeAwards';

// `/finalize`: anyone can turn reviewers' votes into an award. The rows are
// the programme's indexed awards plus applicants added on the page, each read
// on the chain; each award is finalized in a sheet that asks for the mode and
// the payee that mode needs, following the contract's rules per mode.

const ADDRESS = `GFIN${'A'.repeat(52)}`;
const AWARDED = `GAWD${'B'.repeat(52)}`;
const APPLICANT = `GAPP${'C'.repeat(52)}`;
const PAYEE = `GPAY${'D'.repeat(52)}`;
const WALLET = `CWAL${'E'.repeat(52)}`;
const REAL_ID = `CREA${'F'.repeat(52)}`;
const POLICY_ID = `CPOL${'G'.repeat(52)}`;

const mocks = vi.hoisted(() => ({
  address: null as string | null,
  announce: vi.fn(),
  isInstalled: vi.fn(),
  metadata: {
    status: 'ok' as const,
    doc: {
      schema_version: '1.1.0',
      name: 'Programme',
      description: 'Desc',
      vertical: 'health',
      contact: { name: 'Trust', email: 'test@example.com' },
      labels: [
        { address: PAYEE, role: 'payee', label: 'St Jude Hospital' },
        { address: WALLET, role: 'reviewer', label: 'Reviewer Wallet' },
      ],
    },
  } as any,
}));

vi.mock('../hooks/useProgrammeMetadata', () => ({
  useProgrammeMetadata: () => mocks.metadata,
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: mocks.address,
    status: mocks.address ? 'connected' : 'disconnected',
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));

vi.mock('../hooks/useProgrammeParam', () => ({
  useProgrammeParam: () => ({
    raw: null,
    programmeId: null,
    status: 'absent',
    active: false,
    blocksProgramme: false,
    loading: false,
    error: null,
    message: null,
    clear: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/indexer')>()),
  fetchProgrammes: vi.fn(async () => [{ id: REAL_ID, name: 'Community health worker stipend 2026', creator: null, createdLedger: 1 }]),
  fetchAwards: vi.fn(async () => [
    { recipient: AWARDED, granted: '3000000000', released: '0', tranches: 3, tranchesReleased: 0, payee: AWARDED, mode: 'Allocated', updatedLedger: 1 },
  ]),
}));

function ok<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

function application(applicant: string, overrides: { finalized?: boolean; votes?: bigint[] } = {}) {
  return {
    applicant,
    finalized: overrides.finalized ?? false,
    metadata_hash: Buffer.alloc(32),
    requested: 5_000_000_000n,
    submitted_at: 0,
    votes: overrides.votes ?? [1_000_000_000n, 1_500_000_000n, 1_500_000_000n],
    withdrawn: false,
  };
}

function makeProgramme() {
  return {
    options: { contractId: REAL_ID },
    is_paused: vi.fn(async () => ({ result: false })),
    total_granted: vi.fn(async () => ({ result: 3_000_000_000n })),
    budget: vi.fn(() => ok(10_000_000_000n)),
    get_config: vi.fn(() =>
      ok({ quorum: 3, minimum_award: 0n, policy: POLICY_ID, apply_deadline: 1_900_000_000n }),
    ),
    get_phase: vi.fn(() => ok({ tag: 'Review' })),
    get_application: vi.fn(({ applicant }: { applicant: string }) =>
      ok(application(applicant, { finalized: applicant === AWARDED })),
    ),
    get_award: vi.fn(({ recipient }: { recipient: string }) =>
      ok({ recipient, granted: 3_000_000_000n, mode: { tag: 'Allocated' }, payee: recipient, tranches: 3 }),
    ),
    is_payee: vi.fn(async () => ({ result: true })),
    finalize: vi.fn(() => ({
      signAndSend: vi.fn(async () => ({
        result: { unwrap: () => ({ recipient: APPLICANT, granted: 1_500_000_000n, mode: { tag: 'Allocated' }, payee: APPLICANT, tranches: 3 }) },
      })),
    })),
  };
}

let programme = makeProgramme();

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: () => programme,
    registry: { is_programme: vi.fn(async () => ({ result: true })) },
    policy: { options: { contractId: POLICY_ID }, is_installed: mocks.isInstalled },
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/finalize']}>
      <FinalizeAwards />
    </MemoryRouter>,
  );
}

async function addApplicant(address = APPLICANT) {
  await screen.findByText('Finalized · Allocated');
  fireEvent.change(screen.getByLabelText('Applicant address'), { target: { value: address } });
  fireEvent.click(screen.getByRole('button', { name: 'Add applicant' }));
  const row = (await screen.findByText('Added here')).closest('tr')!;
  await within(row).findByText('150', { selector: 'b' });
  return row;
}

async function openSheet() {
  renderPage();
  const row = await addApplicant();
  const button = within(row).getByRole('button', { name: 'Finalize' }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  return screen.findByRole('dialog');
}

beforeEach(() => {
  programme = makeProgramme();
  mocks.address = ADDRESS;
  mocks.announce.mockClear();
  mocks.isInstalled.mockReset().mockResolvedValue({ result: true });
});

describe('FinalizeAwards — the board', () => {
  it('says anyone can finalize, reads the budget, and lists the indexed awards', async () => {
    renderPage();
    expect(screen.getByText('Anyone can do this')).toBeTruthy();
    expect(await screen.findByText('Finalized · Allocated')).toBeTruthy();
    const figures = document.querySelector('.finalize__figures') as HTMLElement;
    await waitFor(() => expect(within(figures).getByText('300')).toBeTruthy());
    expect(within(figures).getByText('700')).toBeTruthy();
    expect(screen.getByText(/Order matters when money is short/)).toBeTruthy();
  });

  it('marks the vote the contract will use, and gates a row short of quorum', async () => {
    programme.get_application.mockImplementation(({ applicant }) =>
      ok(application(applicant, { finalized: applicant === AWARDED, votes: applicant === APPLICANT ? [1_000_000_000n, 1_500_000_000n] : undefined })),
    );
    renderPage();
    await screen.findByText('Finalized · Allocated');
    fireEvent.change(screen.getByLabelText('Applicant address'), { target: { value: APPLICANT } });
    fireEvent.click(screen.getByRole('button', { name: 'Add applicant' }));
    const row = (await screen.findByText('Added here')).closest('tr')!;
    expect(await within(row).findByText('Needs 1 more vote')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Finalize' })).toBeNull();
  });

  it('says why a ready award can’t be finalized: over budget, below minimum, signed out', async () => {
    programme.budget.mockImplementation(() => ok(4_000_000_000n));
    renderPage();
    const row = await addApplicant();
    expect(await within(row).findByText('Only 100 XLM left')).toBeTruthy();
    expect((within(row).getByRole('button', { name: 'Finalize' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks a signed-out visitor to sign in, and says anyone can', async () => {
    mocks.address = null;
    renderPage();
    const row = await addApplicant();
    expect(within(row).getByText('Sign in to finalize. Anyone can.')).toBeTruthy();
  });

  it('says when finalizing opens for a programme still taking applications', async () => {
    programme.get_phase.mockImplementation(() => ok({ tag: 'Open' }));
    renderPage();
    const row = await addApplicant();
    expect(await within(row).findByText(/Finalizing opens when review starts, on/)).toBeTruthy();
  });
});

describe('FinalizeAwards — the sheet', () => {
  it('finalizes as Allocated by default, with no payee of its own', async () => {
    const sheet = await openSheet();
    expect((within(sheet).getByRole('radio', { name: /Allocated/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Finalize award' }));

    expect(await within(sheet).findByText('The award is fixed. Each tranche now waits for a verifier.')).toBeTruthy();
    expect(programme.finalize).toHaveBeenCalledWith({
      applicant: APPLICANT,
      payee: APPLICANT,
      mode: { tag: 'Allocated', values: undefined },
    });
    expect(mocks.announce).toHaveBeenCalledWith('Award finalized at 150 XLM.');
  });

  it('needs a payee this programme verified for Direct', async () => {
    programme.is_payee.mockResolvedValue({ result: false });
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole('radio', { name: /Direct/ }));
    fireEvent.change(within(sheet).getByLabelText('Verified payee'), { target: { value: PAYEE } });

    expect(await within(sheet).findByText('Not a verified payee for this programme.')).toBeTruthy();
    expect((within(sheet).getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled).toBe(true);
    expect(programme.is_payee).toHaveBeenCalledWith({ payee: PAYEE });

    programme.is_payee.mockResolvedValue({ result: true });
    fireEvent.change(within(sheet).getByLabelText('Verified payee'), { target: { value: `GPAZ${'D'.repeat(52)}` } });
    await waitFor(() =>
      expect((within(sheet).getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'Finalize award' }));
    await waitFor(() =>
      expect(programme.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ payee: `GPAZ${'D'.repeat(52)}`, mode: { tag: 'Direct', values: undefined } }),
      ),
    );
  });

  it('pays a Restricted award into the recipient’s smart wallet, and warns when it has no policy', async () => {
    mocks.isInstalled.mockResolvedValue({ result: false });
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole('radio', { name: /Restricted/ }));
    expect((within(sheet).getByRole('button', { name: 'Finalize award' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(within(sheet).getByLabelText('Recipient’s smart wallet'), { target: { value: WALLET } });
    expect(await within(sheet).findByText(/No spend policy is installed on this wallet/)).toBeTruthy();
    expect(mocks.isInstalled).toHaveBeenCalledWith({ wallet: WALLET });

    fireEvent.click(within(sheet).getByRole('button', { name: 'Finalize award' }));
    await waitFor(() =>
      expect(programme.finalize).toHaveBeenCalledWith({
        applicant: APPLICANT,
        payee: WALLET,
        mode: { tag: 'Restricted', values: undefined },
      }),
    );
  });

  it('names the recipient as the payee of an Open award', async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole('radio', { name: /Open/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Finalize award' }));
    await waitFor(() =>
      expect(programme.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ payee: APPLICANT, mode: { tag: 'Open', values: undefined } }),
      ),
    );
  });

  it('explains a refusal in the contract’s own words', async () => {
    programme.finalize.mockImplementation(() => {
      throw new Error('HostError: Error(Contract, #14)');
    });
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Finalize award' }));

    expect(await within(sheet).findByText('Award not finalized')).toBeTruthy();
    expect(within(sheet).getByText('The programme does not have enough budget left for this award.')).toBeTruthy();
    expect(within(sheet).queryByText(/HostError/)).toBeNull();
  });
});

describe('FinalizeAwards — a sample programme', () => {
  it('shows tagged sample applications, warns it is oversubscribed, and stands in for finalizing', async () => {
    renderPage();
    await screen.findByText('Finalized · Allocated');
    fireEvent.change(screen.getByLabelText('Programme'), {
      target: { value: 'CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C' },
    });

    expect(await screen.findByText(/This programme is oversubscribed/)).toBeTruthy();
    expect(screen.getAllByText('Sample data').length).toBeGreaterThan(1);
    expect(screen.getByText('Needs 2 more votes')).toBeTruthy();
    expect(programme.get_application).not.toHaveBeenCalledWith(expect.objectContaining({ applicant: expect.stringMatching(/^GAPL/) }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Finalize' })[0]);
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Finalize award' }));
    await waitFor(() => expect(within(sheet).getByText(/The award is fixed/)).toBeTruthy(), { timeout: 3000 });
    expect(programme.finalize).not.toHaveBeenCalled();
  });

  describe('creator payee names in FinalizeSheet (Issue #632)', () => {
    it('shows creator payee name beside address and verified badge when is_payee is true', async () => {
      programme.is_payee.mockResolvedValue({ result: true });
      const sheet = await openSheet();

      fireEvent.click(within(sheet).getByRole('radio', { name: /Direct/ }));
      fireEvent.change(within(sheet).getByLabelText('Verified payee'), { target: { value: PAYEE } });

      await waitFor(() => {
        expect(within(sheet).getByText('St Jude Hospital')).toBeDefined();
        expect(within(sheet).getByText('Verified payee')).toBeDefined();
      });
    });

    it('says "Not a verified payee" in words when named payee is not verified on chain', async () => {
      programme.is_payee.mockResolvedValue({ result: false });
      const sheet = await openSheet();

      fireEvent.click(within(sheet).getByRole('radio', { name: /Direct/ }));
      fireEvent.change(within(sheet).getByLabelText('Verified payee'), { target: { value: PAYEE } });

      await waitFor(() => {
        expect(within(sheet).getByText('St Jude Hospital')).toBeDefined();
        expect(within(sheet).getAllByText('Not a verified payee').length).toBeGreaterThan(0);
      });
    });

    it('shows no creator name for an unnamed address', async () => {
      const UNNAMED_PAYEE = `GPAY${'Z'.repeat(52)}`;
      const sheet = await openSheet();

      fireEvent.click(within(sheet).getByRole('radio', { name: /Direct/ }));
      fireEvent.change(within(sheet).getByLabelText('Verified payee'), { target: { value: UNNAMED_PAYEE } });

      await waitFor(() => {
        expect(within(sheet).queryByText('St Jude Hospital')).toBeNull();
      });
    });

    it('ignores labels for the same address with a different role', async () => {
      const sheet = await openSheet();

      fireEvent.click(within(sheet).getByRole('radio', { name: /Direct/ }));
      fireEvent.change(within(sheet).getByLabelText('Verified payee'), { target: { value: WALLET } });

      await waitFor(() => {
        expect(within(sheet).queryByText('Reviewer Wallet')).toBeNull();
      });
    });

    it('does not display creator payee name when metadata is unavailable', async () => {
      mocks.metadata = { status: 'unavailable', reason: 'failed' };
      const sheet = await openSheet();

      fireEvent.click(within(sheet).getByRole('radio', { name: /Direct/ }));
      fireEvent.change(within(sheet).getByLabelText('Verified payee'), { target: { value: PAYEE } });

      await waitFor(() => {
        expect(within(sheet).queryByText('St Jude Hospital')).toBeNull();
      });
    });
  });
});

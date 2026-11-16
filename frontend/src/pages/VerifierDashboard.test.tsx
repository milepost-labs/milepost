import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
import { DEMO_PROGRAMME_ID } from '../context/sorobanStore';
import { VerifierDashboard } from './VerifierDashboard';

// `/verifiers`: claims reach the review panel from a recipient's request link
// or the verifier's own lookup, and either way every fact is read from the
// chain before signing. Reviewer voting sits on the same page. The contract
// clients are faked through `useSoroban`; nothing touches the network.

const ADDRESS = `GRVW${'A'.repeat(52)}`;
const RECIPIENT = `GREC${'B'.repeat(52)}`;
const APPLICANT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';
const PROGRAMME = `CPRG${'C'.repeat(52)}`;
const OTHER_PROGRAMME = `COTH${'D'.repeat(52)}`;
const ATTEST_ID = `CATT${'E'.repeat(52)}`;
const SCHEMA = Buffer.alloc(32, 0x5c);
const SIGNED_UID = Buffer.alloc(32, 0xab);

const mocks = vi.hoisted(() => ({
  address: null as string | null,
  announce: vi.fn(),
  isProgramme: vi.fn(async () => ({ result: true })),
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

function ok<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

function sendable<T>(value: T) {
  return { signAndSend: vi.fn(async () => ({ result: { unwrap: () => value } })) };
}

function makeApplication(overrides: { finalized?: boolean } = {}) {
  return {
    applicant: APPLICANT,
    finalized: overrides.finalized ?? false,
    metadata_hash: Buffer.alloc(32),
    requested: 5_000_000_000n,
    submitted_at: 0,
    votes: [] as bigint[],
    withdrawn: false,
  };
}

function makeProgramme(id: string) {
  return {
    options: { contractId: id },
    is_reviewer: vi.fn(async () => ({ result: true })),
    is_verifier: vi.fn(async () => ({ result: true })),
    is_paused: vi.fn(async () => ({ result: false })),
    is_spent: vi.fn(async () => ({ result: false })),
    get_phase: vi.fn(() => ok({ tag: 'Review' })),
    get_config: vi.fn(() =>
      ok({ attest: ATTEST_ID, schema: SCHEMA, release_deadline: 4_102_444_800n, tranches: 3 }),
    ),
    get_award: vi.fn(() =>
      ok({
        recipient: RECIPIENT,
        granted: 3_000_000_000n,
        released: 1_000_000_000n,
        tranches: 3,
        tranches_released: 1,
        payee: RECIPIENT,
        mode: { tag: 'Allocated' },
      }),
    ),
    get_application: vi.fn(() => ok(makeApplication())),
    review: vi.fn(() => sendable(undefined)),
  };
}

function makeAttest() {
  return {
    options: { contractId: ATTEST_ID },
    attest: vi.fn(() => sendable(SIGNED_UID)),
    get_schema: vi.fn(() =>
      ok({ definition: 'Land prepared for planting', authority: ADDRESS, restricted: false, revocable: true }),
    ),
    get: vi.fn(() => ok({ revoked_at: undefined })),
    revoke: vi.fn(() => sendable(undefined)),
  };
}

let clients = new Map<string, ReturnType<typeof makeProgramme>>();
let attest = makeAttest();
let indexed: { id: string; name: string | null; creator: string | null; createdLedger: number | null }[] = [];

function client(id: string) {
  if (!clients.has(id)) clients.set(id, makeProgramme(id));
  return clients.get(id)!;
}

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    attest,
    registry: { is_programme: mocks.isProgramme },
    programmeAt: (id: string) => client(id),
  }),
}));

vi.mock('../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/indexer')>()),
  fetchProgrammes: vi.fn(async () => indexed),
}));

const requestUrl = (extra = '') =>
  `/verifiers?programme=${PROGRAMME}&recipient=${RECIPIENT}&tranche=2&note=Plot%2014${extra}`;

function renderPage(url = '/verifiers') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <VerifierDashboard />
    </MemoryRouter>,
  );
}

function signButton() {
  return screen.getByRole('button', { name: 'Sign attestation' }) as HTMLButtonElement;
}

beforeEach(() => {
  clients = new Map();
  attest = makeAttest();
  indexed = [];
  mocks.address = ADDRESS;
  mocks.announce.mockClear();
  mocks.isProgramme.mockReset().mockResolvedValue({ result: true });
  window.localStorage.clear();
});

describe('VerifierDashboard — a request link', () => {
  it('opens the claim with every fact read from the chain, and signs under the programme’s schema', async () => {
    renderPage(requestUrl());

    expect(await screen.findByRole('heading', { name: 'Land prepared for planting' })).toBeTruthy();
    expect(screen.getByText('Plot 14')).toBeTruthy();
    expect(screen.getByText('From their link, not the chain')).toBeTruthy();
    // tranches_released is 1, so the next tranche is 2 of 3: the link agrees.
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.getByText('100 XLM')).toBeTruthy();
    expect(client(PROGRAMME).get_award).toHaveBeenCalledWith({ recipient: RECIPIENT });

    await screen.findByText('Tick the box above to confirm you checked it yourself.');
    expect(signButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/I checked this myself/));
    await waitFor(() => expect(signButton().disabled).toBe(false));
    fireEvent.click(signButton());

    expect(await screen.findByRole('heading', { name: 'Attestation signed', level: 3 })).toBeTruthy();
    expect(attest.attest).toHaveBeenCalledWith({
      attester: ADDRESS,
      schema_uid: SCHEMA,
      subject: RECIPIENT,
      data_hash: Buffer.alloc(32),
      expires_at: undefined,
    });
    expect(screen.getByRole('button', { name: 'Copy reply link' })).toBeTruthy();
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringMatching(/^Attestation signed\./));
  });

  it('hashes the reference rather than putting it on the chain', async () => {
    renderPage(requestUrl());
    await screen.findByRole('heading', { name: 'Land prepared for planting' });

    fireEvent.change(screen.getByLabelText('Your reference (optional)'), { target: { value: 'VR-2291' } });
    fireEvent.click(screen.getByLabelText(/I checked this myself/));
    await waitFor(() => expect(signButton().disabled).toBe(false));
    fireEvent.click(signButton());

    await waitFor(() => expect(attest.attest).toHaveBeenCalled());
    const { data_hash } = (attest.attest.mock.calls[0] as unknown as [{ data_hash: Buffer }])[0];
    const expected = Buffer.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('VR-2291'))),
    );
    expect(data_hash.equals(expected)).toBe(true);
  });

  it('says when the link’s tranche is not the next one', async () => {
    renderPage(`/verifiers?programme=${PROGRAMME}&recipient=${RECIPIENT}&tranche=3`);
    expect(await screen.findByText(/The link asked about tranche 3/)).toBeTruthy();
  });

  it('refuses to sign for a programme the registry did not deploy', async () => {
    mocks.isProgramme.mockResolvedValue({ result: false });
    renderPage(requestUrl());
    fireEvent.click(await screen.findByLabelText(/I checked this myself/));

    expect(await screen.findByText(/registry did not deploy this programme/)).toBeTruthy();
    expect(signButton().disabled).toBe(true);
  });

  it('refuses to sign when this address is not one of the programme’s verifiers', async () => {
    client(PROGRAMME).is_verifier.mockResolvedValue({ result: false });
    renderPage(requestUrl());
    expect(await screen.findByText(/not one of the programme’s verifiers/)).toBeTruthy();
    expect(signButton().disabled).toBe(true);
  });

  it('says there is nothing to unlock when the recipient has no award', async () => {
    client(PROGRAMME).get_award.mockRejectedValue(new Error('HostError: Error(Contract, #19)'));
    renderPage(requestUrl());
    expect(await screen.findByText(/has no award in this programme/)).toBeTruthy();
    expect(screen.queryByText(/HostError/)).toBeNull();
  });

  it('explains a failed signature and keeps the request', async () => {
    attest.attest.mockRejectedValue(new Error('HostError: Error(Contract, #1)'));
    renderPage(requestUrl());
    await screen.findByRole('heading', { name: 'Land prepared for planting' });
    fireEvent.click(screen.getByLabelText(/I checked this myself/));
    await waitFor(() => expect(signButton().disabled).toBe(false));
    fireEvent.click(signButton());

    expect(await screen.findByText('Attestation not signed')).toBeTruthy();
    expect(screen.getByText('No such schema.')).toBeTruthy();
    expect(screen.queryByText(/HostError/)).toBeNull();
    expect(mocks.announce).toHaveBeenCalledWith('Attestation not signed. No such schema.', 'alert');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(within(screen.getByRole('list', { name: 'Requests' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('drops the request once the signed sheet closes, and lists the attestation', async () => {
    renderPage(requestUrl());
    await screen.findByRole('heading', { name: 'Land prepared for planting' });
    fireEvent.click(screen.getByLabelText(/I checked this myself/));
    await waitFor(() => expect(signButton().disabled).toBe(false));
    fireEvent.click(signButton());
    await screen.findByRole('heading', { name: 'Attestation signed', level: 3 });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('No requests yet')).toBeTruthy();
    const uid = SIGNED_UID.toString('hex');
    const table = screen.getByRole('table');
    expect(await within(table).findByRole('cell', { name: `${uid.slice(0, 8)}…${uid.slice(-6)}` })).toBeTruthy();
    expect(within(table).getByRole('button', { name: /Copy reply link for/ })).toBeTruthy();
    const row = within(table).getByRole('cell', { name: `${uid.slice(0, 8)}…${uid.slice(-6)}` }).closest('tr')!;
    expect(await within(row).findByText('Not used yet')).toBeTruthy();
    expect(client(PROGRAMME).is_spent).toHaveBeenCalledWith({ attestation: SIGNED_UID });
  });

  it('sends nothing when the verifier can’t confirm', async () => {
    renderPage(requestUrl());
    await screen.findByRole('heading', { name: 'Land prepared for planting' });

    fireEvent.click(screen.getByRole('button', { name: 'Can’t confirm' }));

    expect(await screen.findByText('No requests yet')).toBeTruthy();
    expect(attest.attest).not.toHaveBeenCalled();
  });

  it('asks a signed-out visitor to sign in, and says a request is waiting', () => {
    mocks.address = null;
    renderPage(requestUrl());
    expect(screen.getByText('Confirm conditions and unlock payments')).toBeTruthy();
    expect(screen.getByText(/A recipient sent you a claim to confirm/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign attestation' })).toBeNull();
  });
});

describe('VerifierDashboard — looking up a recipient', () => {
  it('opens a claim from a programme the verifier picked and a pasted recipient', async () => {
    indexed = [{ id: PROGRAMME, name: 'Oyo Smallholder Inputs', creator: null, createdLedger: 1 }];
    renderPage();

    expect(await screen.findByText('No requests yet')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Where claims come from' })).getByRole('button', { name: 'Look up a recipient' }));

    const programmeSelect = (await screen.findAllByLabelText('Programme', { selector: 'select' }))[0] as HTMLSelectElement;
    await waitFor(() => expect(within(programmeSelect).getByText('Oyo Smallholder Inputs')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: RECIPIENT } });
    fireEvent.click(screen.getByRole('button', { name: 'Open claim' }));

    expect(await screen.findByRole('heading', { name: 'Land prepared for planting' })).toBeTruthy();
    expect(client(PROGRAMME).get_award).toHaveBeenCalledWith({ recipient: RECIPIENT });
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('refuses a malformed recipient without reading anything', async () => {
    renderPage();
    fireEvent.click(within(await screen.findByRole('group', { name: 'Where claims come from' })).getByRole('button', { name: 'Look up a recipient' }));
    fireEvent.change(screen.getByLabelText('Programme address'), { target: { value: PROGRAMME } });
    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open claim' }));

    expect(await screen.findByText(/Enter the recipient’s Stellar address/)).toBeTruthy();
    expect(client(PROGRAMME).get_award).not.toHaveBeenCalled();
  });
});

describe('VerifierDashboard — reviewer voting', () => {
  async function voteRow() {
    const rows = await screen.findByRole('list', { name: 'Applicants' });
    const row = (await within(rows).findByText('Sunrise cooperative')).closest('li')!;
    await within(row).findByText(/Asked for 500 XLM/);
    return row;
  }

  function vote(row: HTMLElement, amount: string) {
    fireEvent.change(within(row).getByLabelText(/Amount to approve/), { target: { value: amount } });
    fireEvent.click(within(row).getByRole('button', { name: 'Vote' }));
  }

  it('submits a vote with the reviewer’s amount', async () => {
    renderPage();
    const row = await voteRow();
    await screen.findByText('Reviewer wallet');
    await waitFor(() => expect((within(row).getByRole('button', { name: 'Vote' }) as HTMLButtonElement).disabled).toBe(false));

    vote(row, '250');

    await waitFor(() =>
      expect(client(DEMO_PROGRAMME_ID).review).toHaveBeenCalledWith({
        reviewer: ADDRESS,
        applicant: APPLICANT,
        approved: 2_500_000_000n,
      }),
    );
    expect(await screen.findByText('Review vote submitted')).toBeTruthy();
    expect(mocks.announce).toHaveBeenCalledWith('Review vote submitted for GAH3D4…KXCA.');
  });

  it('refuses an amount over the request inline, without signing anything', async () => {
    renderPage();
    const row = await voteRow();
    await waitFor(() => expect((within(row).getByRole('button', { name: 'Vote' }) as HTMLButtonElement).disabled).toBe(false));
    vote(row, '600');

    expect(await within(row).findByText('The approved amount cannot exceed what the applicant requested.')).toBeTruthy();
    expect(client(DEMO_PROGRAMME_ID).review).not.toHaveBeenCalled();
  });

  it('tells a non-reviewer why they cannot vote', async () => {
    client(DEMO_PROGRAMME_ID).is_reviewer.mockResolvedValue({ result: false });
    renderPage();
    const row = await voteRow();

    expect(await screen.findByText('The connected wallet is not a registered reviewer for this programme.')).toBeTruthy();
    expect(screen.getByText('Not a reviewer')).toBeTruthy();
    expect((within(row).getByRole('button', { name: 'Vote' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains a wrong-phase refusal rather than showing the raw error', async () => {
    client(DEMO_PROGRAMME_ID).review.mockRejectedValue(new Error('HostError: Error(Contract, #2)'));
    renderPage();
    const row = await voteRow();
    await waitFor(() => expect((within(row).getByRole('button', { name: 'Vote' }) as HTMLButtonElement).disabled).toBe(false));
    vote(row, '250');

    expect(await screen.findByText('The window for this action is not open.')).toBeTruthy();
    expect(screen.getByText('Nothing was transferred · program error 2')).toBeTruthy();
    expect(screen.queryByText(/HostError/)).toBeNull();
    expect(mocks.announce).toHaveBeenCalledWith('The window for this action is not open.', 'alert');
  });

  it('does not allow voting once the application is finalized', async () => {
    client(DEMO_PROGRAMME_ID).get_application.mockImplementation(() => ok(makeApplication({ finalized: true })));
    renderPage();
    const rows = await screen.findByRole('list', { name: 'Applicants' });
    const row = (await within(rows).findByText('Sunrise cooperative')).closest('li')!;

    expect(await within(row).findByText('Finalized')).toBeTruthy();
    expect((within(row).getByRole('button', { name: 'Vote' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(row).getByLabelText(/Amount to approve/) as HTMLInputElement).disabled).toBe(true);
  });

  it('refuses a malformed applicant and adds a valid one', async () => {
    const manual = `GB${'B'.repeat(54)}`;
    renderPage();
    await voteRow();

    fireEvent.change(screen.getByLabelText('Applicant address'), { target: { value: 'not-an-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add applicant' }));
    expect(await screen.findByText('Enter a valid applicant address.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Applicant address'), { target: { value: manual } });
    fireEvent.click(screen.getByRole('button', { name: 'Add applicant' }));
    const rows = screen.getByRole('list', { name: 'Applicants' });
    expect(await within(rows).findByText('Added by you')).toBeTruthy();
    expect(client(DEMO_PROGRAMME_ID).get_application).toHaveBeenCalledWith({ applicant: manual });
  });

  it('shows a failed application read through explain()', async () => {
    client(DEMO_PROGRAMME_ID).get_application.mockRejectedValue(new Error('Failed to fetch'));
    renderPage();
    expect(await screen.findAllByText('Could not reach the network.')).not.toHaveLength(0);
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it('switches to another programme and sends the vote there', async () => {
    renderPage();
    await voteRow();
    fireEvent.change(screen.getAllByLabelText('Programme', { selector: 'select' })[0], {
      target: { value: '__other' },
    });
    fireEvent.change(screen.getByLabelText('Programme address'), { target: { value: OTHER_PROGRAMME } });
    fireEvent.click(screen.getByRole('button', { name: 'Use programme' }));

    await waitFor(() => expect(client(OTHER_PROGRAMME).is_reviewer).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Applicant address'), { target: { value: APPLICANT } });
    fireEvent.click(screen.getByRole('button', { name: 'Add applicant' }));
    const rows = await screen.findByRole('list', { name: 'Applicants' });
    const row = (await within(rows).findByText('Added by you')).closest('li')!;
    await within(row).findByText(/Asked for 500 XLM/);
    await waitFor(() => expect((within(row).getByRole('button', { name: 'Vote' }) as HTMLButtonElement).disabled).toBe(false));
    vote(row, '10');

    await waitFor(() =>
      expect(client(OTHER_PROGRAMME).review).toHaveBeenCalledWith({
        reviewer: ADDRESS,
        applicant: APPLICANT,
        approved: 100_000_000n,
      }),
    );
  });

  it('counts the programmes where the wallet actually holds a role', async () => {
    indexed = [
      { id: PROGRAMME, name: 'Community resilience grants 2026', creator: null, createdLedger: 1 },
      { id: OTHER_PROGRAMME, name: 'Workforce skills grants, cohort 3', creator: null, createdLedger: 2 },
    ];
    client(PROGRAMME).is_reviewer.mockResolvedValue({ result: false });
    client(PROGRAMME).get_phase.mockImplementation(() => ok({ tag: 'Open' }));
    client(OTHER_PROGRAMME).is_verifier.mockResolvedValue({ result: false });
    renderPage();

    const summary = screen.getByRole('list', { name: 'Verification summary' });
    await waitFor(() => expect(within(summary).getByText('1 in Review now')).toBeTruthy());
    expect(await screen.findByRole('option', { name: 'Workforce skills grants, cohort 3 · Review' })).toBeTruthy();
  });
});

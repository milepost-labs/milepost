import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Buffer } from 'buffer';
import { ProgrammeDetail } from './ProgrammeDetail';

// Issue #342 — the programme detail page. One page shows a real programme's
// on-chain reads (phase, money, config, registry), what each phase lets you do,
// what the registry thinks of the address, and — when the creator published
// one — the metadata document, but only when it hashes to the on-chain
// commitment. Contract clients, the index and the token read are faked;
// nothing touches the network.

const REAL_ID = `CB${'Q'.repeat(54)}`;
const VIEWER = `GVIEW${'A'.repeat(51)}`;
const TOKEN = `CT${'F'.repeat(54)}`;
const RPC_URL = 'https://soroban-testnet.stellar.org';
/** 2100-01-01, so every configured deadline is still upcoming. */
const FAR_FUTURE = 4102444800;

const mocks = vi.hoisted(() => ({
  address: null as string | null,
  announce: vi.fn(),
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

function unwrap<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

interface TestConfig {
  apply_deadline: bigint | number;
  review_deadline: bigint | number;
  release_deadline: bigint | number;
  sweep_deadline: bigint | number;
  creator: string;
  treasury: string;
  token: string;
  quorum: number;
  tranches: number;
  fee_bps: number;
  metadata_hash: Buffer;
  schema: Buffer;
}

function makeConfig(overrides: Partial<TestConfig> = {}): TestConfig {
  return {
    apply_deadline: FAR_FUTURE,
    review_deadline: FAR_FUTURE + 86_400,
    release_deadline: FAR_FUTURE + 2 * 86_400,
    sweep_deadline: FAR_FUTURE + 3 * 86_400,
    creator: `GC${'D'.repeat(54)}`,
    treasury: `GT${'E'.repeat(54)}`,
    token: TOKEN,
    quorum: 3,
    tranches: 3,
    fee_bps: 200,
    metadata_hash: Buffer.from('ab'.repeat(32), 'hex'),
    schema: Buffer.from('cd'.repeat(32), 'hex'),
    ...overrides,
  };
}

function makeProgramme() {
  return {
    options: { contractId: REAL_ID },
    is_paused: vi.fn(async () => ({ result: false })),
    get_config: vi.fn(() => unwrap(makeConfig())),
    get_phase: vi.fn(() => unwrap({ tag: 'Open' })),
    budget: vi.fn(() => unwrap(79200000000n)),
    fee: vi.fn(() => unwrap(800000000n)),
    total_contributed: vi.fn(async () => ({ result: 80000000000n })),
    total_granted: vi.fn(async () => ({ result: 0n })),
    total_released: vi.fn(async () => ({ result: 0n })),
    total_refunded: vi.fn(async () => ({ result: 0n })),
    total_swept: vi.fn(async () => ({ result: 0n })),
  };
}

function makeRegistry() {
  return { is_programme: vi.fn(async () => ({ result: true })) };
}

let programme = makeProgramme();
let registry = makeRegistry();
let indexed: { id: string; name: string | null; creator: string | null; createdLedger: number | null }[] = [];

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: () => programme,
    registry,
    rpcUrl: RPC_URL,
  }),
}));

vi.mock('../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/indexer')>()),
  fetchProgrammes: vi.fn(async () => indexed),
  fetchAwards: vi.fn(async () => []),
}));

const tokenNameMock = vi.hoisted(() => vi.fn(async () => ({ result: 'native' })));

vi.mock('../lib/token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/token')>()),
  fetchTokenName: tokenNameMock,
}));

function renderProgramme(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/programme/:programmeId" element={<ProgrammeDetail />} />
        <Route path="/programme" element={<ProgrammeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The money panel is the last thing to fill in; its headline is the marker. */
const moneyReady = () => screen.findByText('Budget 7,920.00 XLM');

beforeEach(() => {
  programme = makeProgramme();
  registry = makeRegistry();
  indexed = [];
  mocks.address = VIEWER;
  mocks.announce.mockClear();
  tokenNameMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProgrammeDetail — a deployed programme', () => {
  it('renders the index name, the on-chain reads and everything derived from config', async () => {
    indexed = [{ id: REAL_ID, name: 'Riverside horticulture grants', creator: null, createdLedger: 4811204 }];
    renderProgramme(`/programme/${REAL_ID}`);

    // The header: index name and ledger, the phase read live from the chain.
    expect(await screen.findByRole('heading', { name: 'Riverside horticulture grants' })).toBeTruthy();
    expect(screen.getByText('Phase read on-chain just now')).toBeTruthy();
    expect(screen.getByText('4,811,204')).toBeTruthy();
    expect(screen.queryByText(/Showing the seeded demo programme/)).toBeNull();
    expect(screen.getByText('Now · Contributions and applications')).toBeTruthy();

    // Funding summary: four stats straight off the reads.
    const funding = screen.getByRole('region', { name: 'Programme funding summary' });
    expect(within(funding).getByText('Contributed')).toBeTruthy();
    expect(await within(funding).findByText('8,000.00 XLM')).toBeTruthy();
    expect(within(funding).getByText('Granted')).toBeTruthy();
    expect(within(funding).getByText('Released')).toBeTruthy();

    // Money panel reconciles contributed less fee.
    await moneyReady();
    expect(screen.getByText('Where the money is')).toBeTruthy();
    expect(screen.getByText('Not yet awarded')).toBeTruthy();
    expect(screen.getByText('Protocol fee')).toBeTruthy();

    // Registry verdict from `registry.is_programme`.
    expect(await screen.findByText(/The Milepost registry deployed this programme/)).toBeTruthy();
    expect(screen.getAllByText('Registry-deployed')).toHaveLength(2);

    // Rules: asset read through the token contract, rest straight from config.
    expect(await screen.findByText('XLM')).toBeTruthy();
    expect(tokenNameMock).toHaveBeenCalledWith(TOKEN, RPC_URL);
    expect(screen.getByText('Asset contract')).toBeTruthy();
    expect(screen.getByText('3 reviewer votes')).toBeTruthy();
    expect(screen.getByText('3 votes required')).toBeTruthy();
    expect(screen.getByText('ab'.repeat(32))).toBeTruthy();
    expect(screen.getByText('cd'.repeat(32))).toBeTruthy();

    // Timeline and the tabbed detail panels are present.
    expect(screen.getByText('Timeline and phase')).toBeTruthy();
    expect(screen.getByText(/Next deadline:/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Programme timeline' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Programme details' })).toBeTruthy();
    expect(screen.getByRole('tab', { selected: true })).toBeTruthy();
    expect(screen.getByLabelText('Metadata document URL')).toBeTruthy();
  });

  it('says when it is showing the seeded demo programme', async () => {
    renderProgramme('/programme');

    expect(await screen.findByRole('heading', { name: 'Programme detail' })).toBeTruthy();
    expect(screen.getByText(/Showing the seeded demo programme/)).toBeTruthy();
    expect(screen.getByText('/programme/')).toBeTruthy();
  });

  it('marks a programme the registry did not deploy without calling it untrustworthy', async () => {
    registry.is_programme.mockResolvedValue({ result: false });
    renderProgramme(`/programme/${REAL_ID}`);

    expect(await screen.findByText(/This address was not deployed by the Milepost registry/)).toBeTruthy();
    expect(screen.getByText(/That is not a verdict on the creator/)).toBeTruthy();
    expect(screen.getAllByText('Not registry-deployed')).toHaveLength(2);
  });

  it('announces a paused programme before anything else', async () => {
    programme.is_paused.mockResolvedValue({ result: true });
    renderProgramme(`/programme/${REAL_ID}`);

    expect(await screen.findByText('This programme is paused')).toBeTruthy();
  });
});

describe('ProgrammeDetail — what each phase allows', () => {
  it('offers contributing and applying while Open, and explains the wait for the rest', async () => {
    renderProgramme(`/programme/${REAL_ID}`);
    await moneyReady();

    const contribute = await screen.findByRole('link', { name: 'Contribute' });
    expect(contribute.getAttribute('href')).toBe(`/funders?programme=${REAL_ID}`);
    expect(screen.getByRole('heading', { name: 'What you can do now' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apply' })).toBeTruthy();
    expect(screen.getAllByText('Re-checked on-chain when you continue.')).toHaveLength(2);

    // Finalising waits for Review; releases and refunds wait for Settled.
    expect(screen.getByText('Available only during Review. This programme is Open.')).toBeTruthy();
    expect(
      screen.getAllByText('Available only once the programme is Settled. This programme is Open.'),
    ).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Finalize' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('makes finalising available in Review and names the reviewers’ job', async () => {
    programme.get_phase.mockImplementation(() => unwrap({ tag: 'Review' }));
    renderProgramme(`/programme/${REAL_ID}`);
    await moneyReady();

    expect(await screen.findByRole('link', { name: 'Finalize' })).toBeTruthy();
    expect(
      screen.getByText(
        'Needs the required reviewer votes on the application. In an oversubscribed round, whoever finalizes first decides the order.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Now · Reviewers vote; anyone can finalize')).toBeTruthy();
    expect(
      screen.getAllByText('Available only while the programme is Open. This programme is Review.'),
    ).toHaveLength(2);
    expect(
      screen.getAllByText('Available only once the programme is Settled. This programme is Review.'),
    ).toHaveLength(2);
  });

  it('opens releases when Settled but keeps refunds shut until the window passes', async () => {
    programme.get_phase.mockImplementation(() => unwrap({ tag: 'Settled' }));
    renderProgramme(`/programme/${REAL_ID}`);

    expect(await screen.findByRole('link', { name: 'Release' })).toBeTruthy();
    expect(screen.getByText('Refunds open after the release window closes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refund' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Available only during Review. This programme is Settled.')).toBeTruthy();
  });

  it('passes every deadline and opens refunds once the release window has passed', async () => {
    programme.get_config.mockImplementation(() =>
      unwrap(
        makeConfig({
          apply_deadline: 1,
          review_deadline: 2,
          release_deadline: 3,
          sweep_deadline: 4,
        }),
      ),
    );
    programme.get_phase.mockImplementation(() => unwrap({ tag: 'Settled' }));
    renderProgramme(`/programme/${REAL_ID}`);

    expect(await screen.findByText('All configured deadlines have passed.')).toBeTruthy();
    expect(screen.getAllByText('Passed')).toHaveLength(4);
    expect(screen.queryByText('Refunds open after the release window closes.')).toBeNull();

    const refund = await screen.findByRole('link', { name: 'Refund' });
    expect(refund.getAttribute('href')).toBe(`/funders?programme=${REAL_ID}`);
    expect(
      screen.getByText('7,920.00 XLM is refundable, in proportion to what each funder put in.'),
    ).toBeTruthy();
  });

  it('turns refunds on and flags the cancellation when the programme was cancelled', async () => {
    programme.get_phase.mockImplementation(() => unwrap({ tag: 'Cancelled' }));
    renderProgramme(`/programme/${REAL_ID}`);

    expect(await screen.findByText('This programme was cancelled.')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Refund' })).toBeTruthy();
    expect(
      screen.getByText('7,920.00 XLM is refundable, in proportion to what each funder put in.'),
    ).toBeTruthy();
    // Cancelled is not one of the stepper's steps, so nothing is marked current.
    expect(screen.queryByText(/^Now · /)).toBeNull();
    expect(screen.getByText('Available only during Review. This programme is Cancelled.')).toBeTruthy();
  });

  it('asks a signed-out visitor to sign in before acting', async () => {
    mocks.address = null;
    renderProgramme(`/programme/${REAL_ID}`);
    await moneyReady();

    expect(
      screen.getByText('Sign in to act on this programme. Everything on this page stays readable without it.'),
    ).toBeTruthy();
    expect(screen.getByText('Sign in to contribute.')).toBeTruthy();
    expect(screen.getByText('Sign in to apply for an award.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Contribute' })).toBeNull();
    // Phase rules still win over the sign-in prompt.
    expect(screen.getByText('Available only during Review. This programme is Open.')).toBeTruthy();
  });

  it('says the phase could not be read instead of guessing', async () => {
    programme.get_phase.mockRejectedValue(new Error('Failed to fetch'));
    renderProgramme(`/programme/${REAL_ID}`);

    expect(await screen.findByText('Could not read the phase on-chain')).toBeTruthy();
    expect(screen.getAllByText('Reading the phase on-chain…')).toHaveLength(5);
    expect(screen.queryByText(/^Now · /)).toBeNull();
  });
});

describe('ProgrammeDetail — when a read fails', () => {
  it('shows a failed money read with a retry that refetches everything', async () => {
    programme.budget.mockRejectedValueOnce(new Error('Failed to fetch'));
    renderProgramme(`/programme/${REAL_ID}`);

    expect((await screen.findAllByText('Could not reach the network.')).length).toBeGreaterThan(0);
    const retries = screen.getAllByRole('button', { name: 'Try again' });
    fireEvent.click(retries[retries.length - 1]);

    expect(await screen.findByText('Budget 7,920.00 XLM')).toBeTruthy();
    expect(screen.queryByText('Could not reach the network.')).toBeNull();
  });
});

describe('ProgrammeDetail — the metadata document', () => {
  it('only displays a document that hashes to the on-chain commitment', async () => {
    const doc = {
      schema_version: '1.0.0',
      name: 'Riverside horticulture grants',
      description: 'Support for smallholder horticulture in the riverside districts.',
      vertical: 'agriculture',
      contact: { name: 'Amina Okafor', email: 'amina@example.org' },
    };
    // Sorted, compact JSON — the canonical form both the app and the docs use.
    const canonical =
      '{"contact":{"email":"amina@example.org","name":"Amina Okafor"},"description":"Support for smallholder horticulture in the riverside districts.","name":"Riverside horticulture grants","schema_version":"1.0.0","vertical":"agriculture"}';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    programme.get_config.mockImplementation(() =>
      unwrap(makeConfig({ metadata_hash: Buffer.from(hash, 'hex') })),
    );

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderProgramme(`/programme/${REAL_ID}`);
    const urlField = await screen.findByLabelText('Metadata document URL');
    const verify = () => screen.getByRole('button', { name: 'Fetch & verify' }) as HTMLButtonElement;
    expect(verify().disabled).toBe(true);

    // 1. The document the programme committed to is fetched and displayed.
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(doc) });
    fireEvent.change(urlField, { target: { value: 'https://example.org/grants.json' } });
    fireEvent.click(verify());
    expect(await screen.findByText('Verified against on-chain commitment.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('https://example.org/grants.json');
    expect(screen.getByText(/Amina Okafor/)).toBeTruthy();
    expect(screen.getByText('amina@example.org')).toBeTruthy();

    // 2. A document that does not hash to the commitment is refused, with both
    // hashes shown so the mismatch can be checked.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ ...doc, description: 'Changed.' }),
    });
    fireEvent.change(urlField, { target: { value: 'https://example.org/changed.json' } });
    fireEvent.click(verify());
    expect(await screen.findByText('Hash mismatch — document refused.')).toBeTruthy();
    expect(screen.getByText('Fetched document hash')).toBeTruthy();
    expect(screen.getByText('On-chain commitment')).toBeTruthy();

    // 3. Broken JSON and a missing required field each say exactly what is wrong.
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => 'not json' });
    fireEvent.change(urlField, { target: { value: 'https://example.org/broken.json' } });
    fireEvent.click(verify());
    expect(await screen.findByText('Document is malformed.')).toBeTruthy();
    expect(screen.getByText(/The document is not valid JSON\./)).toBeTruthy();

    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ schema_version: '1.0.0' }) });
    fireEvent.change(urlField, { target: { value: 'https://example.org/partial.json' } });
    fireEvent.click(verify());
    expect(await screen.findByText(/Required field "name" is missing or empty\./)).toBeTruthy();

    // 4. An unreachable document leaves the commitment visible and says the
    // programme still works.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
    fireEvent.change(urlField, { target: { value: 'https://example.org/down.json' } });
    fireEvent.click(verify());
    expect(await screen.findByText('Metadata unavailable.')).toBeTruthy();
    expect(screen.getByText(/Server returned 500 Server Error\./)).toBeTruthy();
    expect(screen.getByText(/only the human-readable description is missing/)).toBeTruthy();
  });
});

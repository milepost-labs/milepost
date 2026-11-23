import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import { DeployProgramme } from './DeployProgramme';
import { handleMetadataRequest, memoryBackend } from '../../lib/metadataStore';
import { metadataHash } from '../../lib/metadata';
import { buildMetadata, type DeployDraft } from '../../lib/deployRules';

// The deploy wizard: Details, People, Timeline, Review & deploy. Every rule
// the programme constructor enforces is checked on its own step, the asset
// and schema are confirmed on the chain, and the deploy runs in a sheet.

const CREATOR = `G${'A'.repeat(55)}`;
const REVIEWER_A = `GREV${'A'.repeat(52)}`;
const REVIEWER_B = `GREV${'B'.repeat(52)}`;
const VERIFIER = `GVER${'C'.repeat(52)}`;
const AUTHORITY = `GAUT${'D'.repeat(52)}`;
const PILOT_TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const OTHER_TOKEN = `CTOK${'E'.repeat(52)}`;
const PILOT_SCHEMA = Buffer.alloc(32, 0x76);
const NEW_PROGRAMME = `CNEW${'F'.repeat(52)}`;

const mocks = vi.hoisted(() => ({
  address: null as string | null,
  announce: vi.fn(),
  create: vi.fn(),
  getConfig: vi.fn(),
  getSchema: vi.fn(),
  tokenName: vi.fn(),
}));

// The seeded programme the wizard offers as a pilot; a network with none has
// no pilot to offer.
const demoProgramme = vi.hoisted(() => ({
  id: 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6' as string | null,
}));
vi.mock('../../context/sorobanStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../context/sorobanStore')>()),
  get DEMO_PROGRAMME_ID() {
    return demoProgramme.id;
  },
}));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({ address: mocks.address, status: 'connected', signTransaction: vi.fn() }),
}));

vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));

vi.mock('../../lib/token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/token')>()),
  fetchTokenName: (id: string) => mocks.tokenName(id),
}));

const soroban = vi.hoisted(() => ({
  value: null as unknown,
}));

vi.mock('../../context/useSoroban', () => ({ useSoroban: () => soroban.value }));

function ok<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

function schema(overrides: Partial<{ restricted: boolean; definition: string }> = {}) {
  return {
    authority: AUTHORITY,
    definition: overrides.definition ?? 'milepost:milestone-met:v1',
    predecessor: undefined,
    restricted: overrides.restricted ?? false,
    revocable: true,
  };
}

const toInput = (seconds: number) => {
  const d = new Date(seconds * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function renderWizard(url = '/admin') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DeployProgramme />
    </MemoryRouter>,
  );
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;

function describe_() {
  fireEvent.change(screen.getByLabelText('What it funds, and on what terms'), {
    target: { value: 'Monthly stipends for community nurses.' },
  });
  fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'health' } });
  fireEvent.change(screen.getByLabelText('Who stands behind it'), { target: { value: 'Kano Health Trust' } });
  fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'grants@kano.example' } });
}

async function passDetails() {
  await screen.findByText('Schema found');
  fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Kano clinic stipends 2027' } });
  describe_();
  await waitFor(() => expect(continueButton().disabled).toBe(false));
  fireEvent.click(continueButton());
}

function addTo(noun: string, text: string) {
  fireEvent.change(screen.getByLabelText(`Add ${noun} address`), { target: { value: text } });
  const field = screen.getByLabelText(`Add ${noun} address`).closest('fieldset')!;
  fireEvent.click(within(field).getByRole('button', { name: 'Add' }));
}

function passPeople() {
  addTo('reviewer', `${REVIEWER_A}, ${REVIEWER_B}`);
  addTo('verifier', VERIFIER);
  fireEvent.change(screen.getByLabelText(/Name for verifier/), { target: { value: 'District clinic lead' } });
  fireEvent.click(continueButton());
}

function setDates(offsetsInDays: number[]) {
  const now = Math.floor(Date.now() / 1000);
  ['Applications close', 'Review ends', 'Release window ends', 'Sweep date'].forEach((label, i) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value: toInput(now + offsetsInDays[i] * 86_400) } });
  });
}

// The description store, served by the same handler as the deployed function.
let store = memoryBackend();
let storeDown = false;

/** The draft the deploy test fills in, for working out the hash it should commit. */
function draftFromScreen(): DeployDraft {
  return {
    name: 'Kano clinic stipends 2027',
    token: PILOT_TOKEN,
    minAward: '',
    tranches: 3,
    schema: PILOT_SCHEMA.toString('hex'),
    metadataHash: '',
    describe: true,
    description: 'Monthly stipends for community nurses.',
    vertical: 'health',
    contactName: 'Kano Health Trust',
    contactEmail: 'grants@kano.example',
    labels: { [VERIFIER]: 'District clinic lead' },
    reviewers: [REVIEWER_A, REVIEWER_B],
    verifiers: [VERIFIER],
    quorum: 1,
    applyDeadline: null,
    reviewDeadline: null,
    releaseDeadline: null,
    sweepDeadline: null,
  };
}

beforeEach(() => {
  store = memoryBackend();
  storeDown = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (storeDown) throw new TypeError('Failed to fetch');
    return handleMetadataRequest(new Request(new URL(String(input), 'http://localhost'), init), store);
  });
  mocks.address = CREATOR;
  mocks.announce.mockClear();
  mocks.create.mockReset();
  mocks.getConfig.mockReset().mockImplementation(() => ok({ token: PILOT_TOKEN, schema: PILOT_SCHEMA }));
  mocks.getSchema.mockReset().mockImplementation(() => ok(schema()));
  mocks.tokenName.mockReset().mockImplementation(async (id: string) => ({
    result: id === PILOT_TOKEN ? 'native' : 'USDC:GISSUER',
  }));
  demoProgramme.id = 'CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6';
  soroban.value = {
    rpcUrl: 'https://rpc.test',
    registry: { create: mocks.create, get_config: () => ok({ fee_bps: 250 }) },
    attest: { get_schema: mocks.getSchema },
    demoProgramme: { get_config: mocks.getConfig },
  };
});

describe('DeployProgramme — details', () => {
  it('offers the testnet pilot’s asset and schema, read from the chain, and waits for a name', async () => {
    renderWizard();

    expect(await screen.findByRole('option', { name: 'XLM (native)' })).toBeTruthy();
    expect(await screen.findByText('Every payment uses it. It’s what the testnet pilot uses.')).toBeTruthy();
    expect(await screen.findByText('Schema found')).toBeTruthy();
    expect(screen.getAllByText('milepost:milestone-met:v1').length).toBeGreaterThan(0);
    expect(mocks.getSchema).toHaveBeenCalledWith({ uid: PILOT_SCHEMA });

    expect(continueButton().disabled).toBe(true);
    expect(screen.getByText('Give the programme a name.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Kano clinic stipends 2027' } });
    // The public description is on by default, so it needs its words first.
    expect(screen.getByText('Describe what the programme funds.')).toBeTruthy();
    describe_();
    await waitFor(() => expect(continueButton().disabled).toBe(false));
  });

  it('offers no pilot defaults when the network has no demo programme', async () => {
    demoProgramme.id = null;
    renderWizard();

    await screen.findByLabelText('Asset');
    // Nothing is read from a pilot, and none of its copy appears.
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(screen.queryByText(/testnet pilot/i)).toBeNull();
    expect(screen.queryByRole('option', { name: 'XLM (native)' })).toBeNull();

    // Both choices start empty on "Another…", with the normal fields shown.
    expect((screen.getByLabelText('Asset') as HTMLSelectElement).value).toBe('__other');
    expect((screen.getByLabelText('What verifiers sign') as HTMLSelectElement).value).toBe('__other');
    expect(screen.getByLabelText('Asset contract')).toBeTruthy();
  });

  it('blocks a schema id that is not registered, and never reads a malformed one', async () => {
    renderWizard();
    await screen.findByText('Schema found');
    fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Kano' } });
    fireEvent.change(screen.getByLabelText('What verifiers sign'), { target: { value: '__other' } });

    mocks.getSchema.mockClear();
    fireEvent.change(screen.getByLabelText('Schema id'), { target: { value: 'not-hex' } });
    expect(screen.getAllByText('Enter the schema id: 64 hex characters.').length).toBeGreaterThan(0);
    expect(mocks.getSchema).not.toHaveBeenCalled();

    mocks.getSchema.mockRejectedValue(new Error('HostError: Error(Contract, #1)'));
    fireEvent.change(screen.getByLabelText('Schema id'), { target: { value: 'ab'.repeat(32) } });
    expect((await screen.findAllByText(/No schema with this id exists\./)).length).toBeGreaterThan(0);
    expect(continueButton().disabled).toBe(true);
  });

  it('reads another asset contract and refuses one that is not a token', async () => {
    renderWizard();
    await screen.findByText('Schema found');
    fireEvent.change(await screen.findByLabelText('Asset'), { target: { value: '__other' } });

    fireEvent.change(screen.getByLabelText('Asset contract'), { target: { value: OTHER_TOKEN } });
    expect(await screen.findByText('Reads as USDC.')).toBeTruthy();

    mocks.tokenName.mockRejectedValue(new Error('not a token'));
    fireEvent.change(screen.getByLabelText('Asset contract'), { target: { value: `CBAD${'G'.repeat(52)}` } });
    expect(await screen.findByText('That contract does not answer as a token.')).toBeTruthy();
  });
});

describe('DeployProgramme — people and timeline', () => {
  it('adds pasted reviewers, refuses a bad address, and caps quorum at the reviewer count', async () => {
    renderWizard();
    await passDetails();

    addTo('reviewer', 'nope');
    expect(await screen.findByText('nope is not a Stellar address.')).toBeTruthy();

    addTo('reviewer', `${REVIEWER_A}, ${REVIEWER_B}`);
    expect(screen.getByRole('list', { name: 'Reviewers' }).querySelectorAll('li')).toHaveLength(2);

    const more = screen.getByRole('button', { name: 'More votes needed' }) as HTMLButtonElement;
    fireEvent.click(more);
    expect(more.disabled).toBe(true);
    expect(screen.getByRole('group', { name: 'Quorum' }).textContent).toContain('2');

    expect(continueButton().disabled).toBe(true);
    expect(screen.getByText('Add at least one verifier, or no tranche could ever be released.')).toBeTruthy();
  });

  it('asks for a restricted schema’s authority as a verifier', async () => {
    mocks.getSchema.mockImplementation(() => ok(schema({ restricted: true })));
    renderWizard();
    await passDetails();
    addTo('reviewer', REVIEWER_A);
    addTo('verifier', VERIFIER);

    expect(continueButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add it as a verifier' }));
    await waitFor(() => expect(continueButton().disabled).toBe(false));
  });

  it('says when the dates are out of order', async () => {
    renderWizard();
    await passDetails();
    passPeople();

    setDates([3, 2, 4, 5]);
    expect(screen.getAllByText('The dates must run in order: applications, review, release, then sweep.').length).toBeGreaterThan(0);
    expect(continueButton().disabled).toBe(true);
  });
});

describe('DeployProgramme — deploying', () => {
  async function reachReview() {
    renderWizard();
    await passDetails();
    passPeople();
    setDates([2, 3, 4, 5]);
    fireEvent.click(continueButton());
    await screen.findByRole('heading', { name: 'Review & deploy' });
  }

  it('deploys with every argument the registry needs, then links to the new programme', async () => {
    mocks.create.mockResolvedValue({ signAndSend: vi.fn(async () => ({ result: { unwrap: () => NEW_PROGRAMME } })) });
    await reachReview();
    expect(screen.getByText(/The protocol takes 2.5% of each contribution/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    expect(await screen.findByRole('heading', { name: 'Programme deployed', level: 3 })).toBeTruthy();
    const args = mocks.create.mock.calls[0][0];
    expect(args).toMatchObject({
      creator: CREATOR,
      token: PILOT_TOKEN,
      quorum: 1,
      tranches: 3,
      reviewers: [REVIEWER_A, REVIEWER_B],
      verifiers: [VERIFIER],
      name: 'Kano clinic stipends 2027',
      minimum_award: 0n,
    });
    expect(Buffer.from(args.schema).equals(PILOT_SCHEMA)).toBe(true);
    // The description was published first, and its hash is what went on the chain.
    const expectedHash = await metadataHash(buildMetadata({ ...draftFromScreen() }));
    expect(Buffer.from(args.metadata_hash).toString('hex')).toBe(expectedHash);
    expect(store.entries.has(expectedHash)).toBe(true);
    expect(args.apply_deadline < args.review_deadline && args.release_deadline < args.sweep_deadline).toBe(true);
    expect(screen.getByRole('link', { name: 'Open its page' }).getAttribute('href')).toBe(`/programme/${NEW_PROGRAMME}`);
    expect(mocks.announce).toHaveBeenCalledWith('Programme deployed.');
  });

  it('offers to deploy without a description when the store can’t be reached', async () => {
    mocks.create.mockResolvedValue({ signAndSend: vi.fn(async () => ({ result: { unwrap: () => NEW_PROGRAMME } })) });
    storeDown = true;
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    expect(await screen.findByText('The description wasn’t published.')).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Deploy without a description' }));

    expect(await screen.findByRole('heading', { name: 'Programme deployed', level: 3 })).toBeTruthy();
    expect(Buffer.from(mocks.create.mock.calls[0][0].metadata_hash).equals(Buffer.alloc(32))).toBe(true);
  });

  it('explains a constructor refusal in the programme’s own words', async () => {
    mocks.create.mockRejectedValue(new Error('HostError: Error(Contract, #5)'));
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    expect(await screen.findByText('Programme not deployed')).toBeTruthy();
    expect(
      screen.getByText('The required reviewer votes must be at least 1 and no more than the number of reviewers.'),
    ).toBeTruthy();
    expect(screen.queryByText(/HostError/)).toBeNull();
  });

  it('retries publishing the description after a failure, then deploys', async () => {
    mocks.create.mockResolvedValue({ signAndSend: vi.fn(async () => ({ result: { unwrap: () => NEW_PROGRAMME } })) });
    storeDown = true;
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    const sheet = await screen.findByRole('dialog', { name: 'Deploy programme' });
    expect(await within(sheet).findByText('The description wasn’t published.')).toBeTruthy();
    expect(within(sheet).getByText(/Nothing has been deployed yet\./)).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('Description not published.'), 'alert');

    storeDown = false;
    fireEvent.click(within(sheet).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Programme deployed', level: 3 })).toBeTruthy();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const expectedHash = await metadataHash(buildMetadata({ ...draftFromScreen() }));
    expect(Buffer.from(mocks.create.mock.calls[0][0].metadata_hash).toString('hex')).toBe(expectedHash);
    expect(screen.getByRole('link', { name: 'Open its page' }).getAttribute('href')).toBe(`/programme/${NEW_PROGRAMME}`);
  });

  it('retries deploying after registry.create fails following a description publish', async () => {
    mocks.create
      .mockRejectedValueOnce(new Error('HostError: Error(Contract, #2)'))
      .mockResolvedValueOnce({ signAndSend: vi.fn(async () => ({ result: { unwrap: () => NEW_PROGRAMME } })) });
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    const sheet = await screen.findByRole('dialog', { name: 'Deploy programme' });
    expect(await within(sheet).findByText('Programme not deployed')).toBeTruthy();
    expect(store.entries.size).toBe(1);
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('Programme not deployed.'), 'alert');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Programme deployed', level: 3 })).toBeTruthy();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Open its page' }).getAttribute('href')).toBe(`/programme/${NEW_PROGRAMME}`);
  });

  it('closes the deploy sheet when publish fails and Close is clicked', async () => {
    storeDown = true;
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Deploy programme' }));

    const sheet = await screen.findByRole('dialog', { name: 'Deploy programme' });
    expect(await within(sheet).findByText('The description wasn’t published.')).toBeTruthy();
    // The sheet's header has its own Close button; this is the one beside Try again.
    const actions = within(sheet).getByRole('button', { name: 'Try again' }).parentElement!;
    fireEvent.click(within(actions).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('jumps back to a step from the summary', async () => {
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Change people' }));
    expect(await screen.findByRole('heading', { name: 'People' })).toBeTruthy();
  });
});

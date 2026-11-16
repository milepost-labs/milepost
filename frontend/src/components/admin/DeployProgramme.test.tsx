import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'buffer';
import { DeployProgramme } from './DeployProgramme';

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
  getSchema: vi.fn(),
  tokenName: vi.fn(),
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

async function passDetails() {
  await screen.findByText('Schema found');
  fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Kano clinic stipends 2027' } });
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
  fireEvent.click(continueButton());
}

function setDates(offsetsInDays: number[]) {
  const now = Math.floor(Date.now() / 1000);
  ['Applications close', 'Review ends', 'Release window ends', 'Sweep date'].forEach((label, i) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value: toInput(now + offsetsInDays[i] * 86_400) } });
  });
}

beforeEach(() => {
  mocks.address = CREATOR;
  mocks.announce.mockClear();
  mocks.create.mockReset();
  mocks.getSchema.mockReset().mockImplementation(() => ok(schema()));
  mocks.tokenName.mockReset().mockImplementation(async (id: string) => ({
    result: id === PILOT_TOKEN ? 'native' : 'USDC:GISSUER',
  }));
  soroban.value = {
    rpcUrl: 'https://rpc.test',
    registry: { create: mocks.create, get_config: () => ok({ fee_bps: 250 }) },
    attest: { get_schema: mocks.getSchema },
    demoProgramme: { get_config: () => ok({ token: PILOT_TOKEN, schema: PILOT_SCHEMA }) },
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
    await waitFor(() => expect(continueButton().disabled).toBe(false));
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
    expect(Buffer.from(args.metadata_hash).equals(Buffer.alloc(32))).toBe(true);
    expect(args.apply_deadline < args.review_deadline && args.release_deadline < args.sweep_deadline).toBe(true);
    expect(screen.getByRole('link', { name: 'Open its page' }).getAttribute('href')).toBe(`/programme/${NEW_PROGRAMME}`);
    expect(mocks.announce).toHaveBeenCalledWith('Programme deployed.');
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

  it('jumps back to a step from the summary', async () => {
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Change people' }));
    expect(await screen.findByRole('heading', { name: 'People' })).toBeTruthy();
  });
});

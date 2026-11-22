import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Buffer } from 'buffer';
import { FIXTURE_ATTESTATIONS } from '../fixtures/attestationFixtures';
import { AttestationLookup } from './AttestationLookup';

// Issue #408 — the used/unused state comes from `program.is_spent` for the
// selected programme, never from a fixture flag. Without a programme the page
// says the check needs one.

const PROGRAMME = `C${'A'.repeat(55)}`;
const sample = FIXTURE_ATTESTATIONS.find((a) => !a.revoked)!;

const state = vi.hoisted(() => {
  const programme = {
    is_spent: (...args: unknown[]) => state.isSpent(...args),
  };
  // Stable across renders, like the real provider's memoized `programmeAt`.
  const programmeAt = () => programme;
  const attest = {
    get: (...args: unknown[]) => state.getAttest(...args),
    get_schema: (...args: unknown[]) => state.getSchema(...args),
  };
  return {
    isSpent: vi.fn(),
    getAttest: vi.fn(),
    getSchema: vi.fn(() => Promise.reject(new Error('not found'))),
    programmeAt,
    attest,
    search: vi.fn(),
    verifyClaim: vi.fn(),
  };
});

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: state.programmeAt, attest: state.attest, rpcUrl: 'http://rpc' }),
}));

vi.mock('../lib/txLookup', () => ({ rpcServer: () => ({}) }));

vi.mock('../lib/attestationSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/attestationSearch')>()),
  searchAttestations: (...args: unknown[]) => state.search(...args),
}));

vi.mock('../lib/attestationVerify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/attestationVerify')>()),
  verifyClaimOnChain: (...args: unknown[]) => state.verifyClaim(...args),
}));

function renderPage() {
  return render(<AttestationLookup />);
}

function lookUpSample() {
  fireEvent.click(screen.getByRole('button', { name: sample.uid }));
}

function selectProgramme() {
  fireEvent.change(
    screen.getByLabelText('Programme (to check whether a proof was used)'),
    { target: { value: PROGRAMME } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use programme' }));
}

describe('AttestationLookup spent status', () => {
  beforeEach(() => {
    state.isSpent = vi.fn(() => Promise.resolve({ result: true }));
  });

  it('asks for a programme instead of guessing the used state', () => {
    renderPage();
    lookUpSample();

    expect(screen.getByText('Select a programme to check usage')).toBeTruthy();
    expect(state.isSpent).not.toHaveBeenCalled();
  });

  it('shows a proof already spent in the selected programme', async () => {
    state.isSpent = vi.fn(() => Promise.resolve({ result: true }));
    renderPage();
    lookUpSample();
    selectProgramme();

    await screen.findByText('Already released a tranche here');
    // The status names the programme it was checked against.
    expect(screen.getByText(PROGRAMME)).toBeTruthy();
    expect(state.isSpent).toHaveBeenCalled();
    expect(state.isSpent.mock.calls[0][0].attestation.toString('hex')).toBe(sample.uid);
  });

  it('shows a proof that is still unused in the selected programme', async () => {
    state.isSpent = vi.fn(() => Promise.resolve({ result: false }));
    renderPage();
    lookUpSample();
    selectProgramme();

    await screen.findByText('Not used in this programme');
  });

  it('does not claim the proof is unused when the read fails', async () => {
    state.isSpent = vi.fn(() => Promise.reject(new Error('rpc down')));
    renderPage();
    lookUpSample();
    selectProgramme();

    await screen.findByText('Could not check this programme');
  });

  it('shows both revoked and used for a proof revoked after it released', async () => {
    const revoked = FIXTURE_ATTESTATIONS.find((a) => a.revoked)!;
    state.isSpent = vi.fn(() => Promise.resolve({ result: true }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: revoked.uid }));
    selectProgramme();

    await screen.findByText('Already released a tranche here');
    expect(screen.getByText('Revoked')).toBeTruthy();
    expect(state.isSpent.mock.calls[0][0].attestation.toString('hex')).toBe(revoked.uid);
  });
});

// Issue #536 — a recipient or verifier address is searched in recent
// `Attested` events and each hit is re-read, so the status is today's.
describe('AttestationLookup search by address', () => {
  const RECIPIENT = `G${'B'.repeat(55)}`;
  const VERIFIER = `G${'C'.repeat(55)}`;
  const window = { fromLedger: 1_000, toLedger: 121_960 };

  function attestation(n: number, overrides: Record<string, unknown> = {}) {
    return {
      uid: Buffer.from(String(n).repeat(64), 'hex'),
      schema: Buffer.alloc(32),
      attester: VERIFIER,
      subject: RECIPIENT,
      data_hash: Buffer.alloc(32),
      created_at: 1_700_000_000n,
      expires_at: undefined,
      revoked_at: undefined,
      ...overrides,
    };
  }

  function search(address: string) {
    fireEvent.change(screen.getByLabelText('Attestation id or address'), { target: { value: address } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  }

  it('lists matches with their current status and the window searched', async () => {
    state.search = vi.fn(async () => ({
      address: RECIPIENT,
      window,
      truncated: false,
      matches: [
        { uid: '1'.repeat(64), role: 'subject', ledger: 300, attestation: attestation(1) },
        { uid: '2'.repeat(64), role: 'subject', ledger: 200, attestation: attestation(2, { revoked_at: 5n }) },
        { uid: '3'.repeat(64), role: 'subject', ledger: 100, attestation: attestation(3, { expires_at: 1n }) },
      ],
    }));
    renderPage();
    search(RECIPIENT);

    await screen.findByText(/3 attestations name this address/);
    expect(state.search.mock.calls[0][2]).toBe(RECIPIENT);
    expect(screen.getByText(/about 7 days/)).toBeTruthy();
    expect(screen.getByText('Valid')).toBeTruthy();
    expect(screen.getByText('Revoked')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    // Used is per programme, so a valid hit asks for one rather than guessing.
    expect(screen.getByText('Select a programme to check usage')).toBeTruthy();
    // Sample attestations never mix into a real address search.
    const results = document.querySelector('.attest-lookup__results') as HTMLElement;
    expect(within(results).queryByText('Sample data')).toBeNull();
  });

  it('says plainly when the window holds nothing for the address', async () => {
    state.search = vi.fn(async () => ({ address: VERIFIER, window, truncated: false, matches: [] }));
    renderPage();
    search(VERIFIER);

    await screen.findByText(/No attestations name this address as recipient or verifier/);
    expect(screen.getByText(/look them up by id/)).toBeTruthy();
  });

  it('explains a failed search and offers a retry', async () => {
    state.search = vi.fn(async () => {
      throw new Error('rpc down');
    });
    renderPage();
    search(RECIPIENT);

    await screen.findByText('Could not search attestations');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows the truncated search window notice and lets the reader switch to an unreadable hit', async () => {
    state.search = vi.fn(async () => ({
      address: VERIFIER,
      window,
      truncated: true,
      matches: [
        { uid: '1'.repeat(64), role: 'attester', ledger: 450, attestation: attestation(1) },
        { uid: '4'.repeat(64), role: 'both', ledger: 120, attestation: null },
      ],
    }));
    renderPage();
    search(VERIFIER);

    await screen.findByText(/2 attestations name this address/);
    expect(screen.getByText(/1,000–121,960/)).toBeTruthy();
    expect(screen.getByText(/This contract was busy, so only the oldest part of that window was searched\./)).toBeTruthy();
    expect(screen.getByText('Signed by this address')).toBeTruthy();
    expect(screen.getByText('Event ledger')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Entry not readable now/ }));
    expect(screen.getByText('Signed by and about this address')).toBeTruthy();
    expect(screen.getByText(/The event shows it was made, but its entry couldn’t be read now/)).toBeTruthy();
  });
});

describe('AttestationLookup on-chain states and claim check', () => {
  const UID = 'ab'.repeat(32);
  const SCHEMA = 'cd'.repeat(32);
  const ATTESTER = `G${'D'.repeat(55)}`;
  const SUBJECT = `G${'E'.repeat(55)}`;

  function makeAttestation(overrides: Record<string, unknown> = {}) {
    return {
      uid: Buffer.from(UID, 'hex'),
      schema: Buffer.from(SCHEMA, 'hex'),
      attester: ATTESTER,
      subject: SUBJECT,
      data_hash: Buffer.alloc(32),
      created_at: 1_700_000_000n,
      expires_at: null,
      revoked_at: null,
      ...overrides,
    };
  }

  function lookUp(value: string) {
    fireEvent.change(screen.getByLabelText('Attestation id or address'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  }

  beforeEach(() => {
    state.isSpent = vi.fn(() => Promise.resolve({ result: false }));
    state.getSchema = vi.fn(() => Promise.reject(new Error('not found')));
  });

  it('shows valid state with schema definition and spent status on a selected programme', async () => {
    state.getAttest = vi.fn(async () => ({ result: { unwrap: () => makeAttestation() } }));
    state.getSchema = vi.fn(async () => ({ result: { unwrap: () => ({ definition: 'Enrolment confirmed' }) } }));
    state.isSpent = vi.fn(async () => ({ result: true }));

    renderPage();
    lookUp(UID);

    await screen.findByText('It can unlock one tranche in a programme that trusts this signer and schema.');
    await screen.findByText('Enrolment confirmed');

    // Invalid programme address is rejected before calling is_spent.
    fireEvent.change(
      screen.getByLabelText('Programme (to check whether a proof was used)'),
      { target: { value: 'not-an-address' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use programme' }));
    expect(screen.getByText('Enter a valid programme contract address.')).toBeTruthy();

    selectProgramme();
    await screen.findByText('Already released a tranche here');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Select a programme to check usage')).toBeTruthy();
  });

  it('shows revoked state and revocation timestamp for a revoked attestation', async () => {
    state.getAttest = vi.fn(async () => ({
      result: { unwrap: () => makeAttestation({ revoked_at: 1_700_000_500n }) },
    }));

    renderPage();
    lookUp(UID);

    await screen.findByText(/The signer withdrew it\. It can’t unlock anything now/);
    expect(screen.getByText('Revoked')).toBeTruthy();
  });

  it('shows expired state and expiry timestamp for an expired attestation', async () => {
    state.getAttest = vi.fn(async () => ({
      result: { unwrap: () => makeAttestation({ expires_at: 1n }) },
    }));

    renderPage();
    lookUp(UID);

    await screen.findByText('Its expiry has passed, so it can’t unlock anything.');
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText('Expires')).toBeTruthy();
  });

  it('shows not found for an unknown 64-hex UID and for an unrecognised non-hex query', async () => {
    state.getAttest = vi.fn(async () => {
      throw new Error('Error(Contract, #3)');
    });

    renderPage();
    lookUp(UID);

    await screen.findByText(`Nothing found for “${UID}”`);
    expect(screen.getByText(/archived ones need a keepalive before they can be read/)).toBeTruthy();

    lookUp('not-a-uid');
    await screen.findByText('Nothing found for “not-a-uid”');
  });

  it('supports checking a claim: validation, valid, invalid, and error', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Check a claim' }));

    // Empty submit shows field validation errors without calling verifyClaimOnChain.
    fireEvent.click(screen.getByRole('button', { name: 'Check claim' }));
    expect(state.verifyClaim).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Attestation uid (hex)'), { target: { value: UID } });
    fireEvent.change(screen.getByLabelText('Schema uid (hex)'), { target: { value: SCHEMA } });
    fireEvent.change(screen.getByLabelText('Subject address'), { target: { value: SUBJECT } });
    fireEvent.change(screen.getByLabelText('Attester address'), { target: { value: ATTESTER } });

    state.verifyClaim = vi.fn(async () => ({ valid: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Check claim' }));
    await screen.findByText('This subject holds a valid claim under this schema from this attester.');

    state.verifyClaim = vi.fn(async () => ({ valid: false, reason: 'Attestation is revoked.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check claim' }));
    await screen.findByText('Attestation is revoked.');

    state.verifyClaim = vi.fn(async () => {
      throw new Error('Failed to fetch');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check claim' }));
    await screen.findByText(/Could not reach/);
  });
});

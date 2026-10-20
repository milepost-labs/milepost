import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  const attest = {};
  return { isSpent: vi.fn(), programmeAt, attest, search: vi.fn() };
});

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: state.programmeAt, attest: state.attest, rpcUrl: 'http://rpc' }),
}));

vi.mock('../lib/txLookup', () => ({ rpcServer: () => ({}) }));

vi.mock('../lib/attestationSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/attestationSearch')>()),
  searchAttestations: (...args: unknown[]) => state.search(...args),
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
    expect(screen.queryByText('Sample data')).toBeNull();
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
});

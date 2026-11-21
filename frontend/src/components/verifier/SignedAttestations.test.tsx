import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
import { SignedAttestations } from './SignedAttestations';
import { describeWindow } from '../../lib/contractEvents';
import { explain } from '../../lib/errors';
import type { SignedRecord } from '../../lib/verifyLinks';

const ME = `G${'A'.repeat(55)}`;
const ALICE = `G${'B'.repeat(55)}`;
const BOB = `G${'C'.repeat(55)}`;
const PROGRAMME = `C${'D'.repeat(55)}`;
const LOCAL_UID = 'a'.repeat(64);
const BOTH_UID = 'b'.repeat(64);
const ELSEWHERE_UID = 'c'.repeat(64);
const WINDOW = { fromLedger: 1_000, toLedger: 1_000 + 17_280 * 7 };

const ok = <T,>(value: T) => Promise.resolve({ result: { unwrap: () => value } });

const hoisted = vi.hoisted(() => {
  const search = vi.fn();
  const isSpent = vi.fn();
  const get = vi.fn();
  const programme = { is_spent: isSpent };
  // Stable like the real context, so the event search runs once per address.
  const soroban = {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    attest: { get, options: { contractId: `C${'E'.repeat(55)}` } },
    programmeAt: () => programme,
  };
  return { search, isSpent, get, soroban };
});

vi.mock('../../lib/samples', () => ({ samplesEnabled: () => false }));
vi.mock('../../lib/attestationSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/attestationSearch')>()),
  searchAttestations: hoisted.search,
}));
vi.mock('../../context/useSoroban', () => ({ useSoroban: () => hoisted.soroban }));
vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({ address: ME, status: 'connected', signTransaction: vi.fn() }),
}));
vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));

const record = (uid: string, recipient: string, tranche: number): SignedRecord => ({
  uid,
  programmeId: PROGRAMME,
  recipient,
  attester: ME,
  tranche,
  signedAt: 1,
});

const renderSection = (records: SignedRecord[]) =>
  render(
    <MemoryRouter>
      <SignedAttestations
        attester={ME}
        records={records}
        allProgrammes={[{ id: PROGRAMME, name: 'Clinic stipends', isVerifier: true, isReviewer: false, phase: null }]}
      />
    </MemoryRouter>,
  );

describe('attestations you have signed', () => {
  beforeEach(() => {
    hoisted.get.mockReset().mockImplementation(() => ok({ revoked_at: undefined }));
    hoisted.isSpent.mockReset().mockImplementation(() => ok(false));
    hoisted.search.mockReset().mockResolvedValue({
      address: ME,
      matches: [
        { uid: ELSEWHERE_UID, role: 'attester', subject: BOB, ledger: 1_200, attestation: null },
        { uid: BOTH_UID, role: 'attester', subject: ALICE, ledger: 1_100, attestation: null },
      ],
      window: WINDOW,
      truncated: false,
    });
  });

  it('lists attestations signed in this browser and ones signed elsewhere, each once', async () => {
    renderSection([record(LOCAL_UID, ALICE, 1), record(BOTH_UID, ALICE, 2)]);

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4));
    const [, local, both, elsewhere] = screen.getAllByRole('row');
    expect(local.textContent).toContain('tranche 1');
    expect(local.textContent).toContain('Clinic stipends');
    expect(both.textContent).toContain('tranche 2');
    expect(elsewhere.textContent).toContain('Signed on another device');
    expect(elsewhere.textContent).not.toContain('tranche');
    expect(hoisted.search).toHaveBeenCalledWith(expect.anything(), expect.anything(), ME);
  });

  it('keeps the status read from the chain for both sources', async () => {
    hoisted.get.mockImplementation(({ uid }: { uid: Uint8Array }) =>
      ok({ revoked_at: Buffer.from(uid).toString('hex') === ELSEWHERE_UID ? 5n : undefined }),
    );
    hoisted.isSpent.mockImplementation(() => ok(true));

    renderSection([record(LOCAL_UID, ALICE, 1)]);

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4));
    const [, local, elsewhere, other] = screen.getAllByRole('row');
    await waitFor(() => expect(within(local).getByText('Released a tranche')).toBeTruthy());
    await waitFor(() => expect(within(elsewhere).getByText('Revoked')).toBeTruthy());
    // Found only in events: not revoked, and no programme to ask whether it was used.
    await waitFor(() => expect(within(other).getByText('Not revoked')).toBeTruthy());
  });

  it('says which window of events it looked at', async () => {
    renderSection([]);

    expect(
      await screen.findByText(new RegExp(`recent events, which cover ${describeWindow(WINDOW)}`)),
    ).toBeTruthy();
  });

  it('says so when the window holds nothing and nothing was signed here', async () => {
    hoisted.search.mockResolvedValue({ address: ME, matches: [], window: WINDOW, truncated: false });

    renderSection([]);

    expect(await screen.findByText(/You have not signed any attestations in the network’s recent events/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('falls back to this browser, through explain(), when the events cannot be read', async () => {
    hoisted.search.mockRejectedValue(new Error('Failed to fetch'));

    renderSection([record(LOCAL_UID, ALICE, 1)]);

    const message = await screen.findByText(/Couldn’t read the network’s recent events/);
    expect(message.textContent).toContain(explain(new Error('Failed to fetch'), 'attest').message);
    expect(screen.getAllByRole('row')).toHaveLength(2);

    hoisted.search.mockResolvedValue({ address: ME, matches: [], window: WINDOW, truncated: false });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(hoisted.search).toHaveBeenCalledTimes(2));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProtocolConfigCard } from './ProtocolConfigCard';

// Issue #342 — the registry admin's edit controls now live on the same view
// as the read-only protocol config, and the old separate console is gone.

const ADMIN = 'GADMINISTRATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE';
const NON_ADMIN = 'GNOTADMINISTRATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAM';

const mocks = vi.hoisted(() => ({ address: null as string | null }));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({ address: mocks.address, status: mocks.address ? 'connected' : 'disconnected' }),
}));

function unwrap<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

function sendable<T>(result: T) {
  return Promise.resolve({ signAndSend: vi.fn().mockResolvedValue({ result }) });
}

function makeRegistry(config: Record<string, unknown>) {
  return {
    get_config: vi.fn(() => unwrap(config)),
    set_fee: vi.fn(() => sendable(undefined)),
    set_treasury: vi.fn(() => sendable(undefined)),
    set_policy: vi.fn(() => sendable(undefined)),
    set_admin: vi.fn(() => sendable(undefined)),
  };
}

const baseConfig = {
  admin: ADMIN,
  treasury: 'GTREASURYEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMP',
  attest: 'CATTESTCONTRACTEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPL',
  record: 'CRECORDCONTRACTEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPL',
  policy: 'CPOLICYCONTRACTEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPL',
  fee_bps: 250,
};

let registry = makeRegistry(baseConfig);

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({ registry }),
}));

function renderCard() {
  return render(<ProtocolConfigCard />);
}

describe('ProtocolConfigCard', () => {
  beforeEach(() => {
    mocks.address = null;
    registry = makeRegistry(baseConfig);
  });

  it('renders every config field read-only when not the admin', async () => {
    mocks.address = NON_ADMIN;
    renderCard();

    await screen.findByText('2.5%');
    expect(screen.queryByRole('button', { name: 'Set fee' })).toBeNull();
    expect(screen.getByText(/read-only mode/i)).toBeTruthy();
  });

  it('shows edit controls only for the connected registry admin', async () => {
    mocks.address = ADMIN;
    renderCard();

    await screen.findByRole('button', { name: 'Set fee' });
    expect(screen.getByRole('button', { name: 'Set treasury' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set policy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Transfer registry admin' })).toBeTruthy();
  });

  it('rejects a fee above the protocol cap inline, without sending a transaction', async () => {
    mocks.address = ADMIN;
    renderCard();

    const feeInput = await screen.findByLabelText(/Protocol fee/);
    fireEvent.change(feeInput, { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set fee' }));

    expect(await screen.findByText(/cannot exceed the protocol cap/i)).toBeTruthy();
    expect(registry.set_fee).not.toHaveBeenCalled();
  });

  it('sets a valid fee and refetches the config', async () => {
    mocks.address = ADMIN;
    renderCard();

    const feeInput = await screen.findByLabelText(/Protocol fee/);
    fireEvent.change(feeInput, { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set fee' }));

    await waitFor(() => expect(registry.set_fee).toHaveBeenCalledWith({ fee_bps: 400 }));
    // get_config is called once on mount and again by the refetch on success.
    await waitFor(() => expect(registry.get_config).toHaveBeenCalledTimes(2));
  });

  it('rejects an invalid treasury address inline', async () => {
    mocks.address = ADMIN;
    renderCard();

    const treasuryInput = await screen.findByLabelText('Treasury address');
    fireEvent.change(treasuryInput, { target: { value: 'not-an-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set treasury' }));

    expect(await screen.findByText(/Enter a valid Stellar address/)).toBeTruthy();
    expect(registry.set_treasury).not.toHaveBeenCalled();
  });

  it('requires the new admin address to be re-typed identically before confirming a transfer', async () => {
    mocks.address = ADMIN;
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Transfer registry admin' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm admin handover' });

    fireEvent.change(within(dialog).getByLabelText('New admin address'), {
      target: { value: NON_ADMIN },
    });
    const confirmField = within(dialog).getByLabelText(/Re-type the new admin address/);
    fireEvent.change(confirmField, { target: { value: NON_ADMIN.slice(0, -1) } });

    const confirmButton = within(dialog).getByRole('button', { name: 'Confirm irreversible transfer' });
    expect(confirmButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(confirmField, { target: { value: NON_ADMIN } });
    expect(confirmButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() => expect(registry.set_admin).toHaveBeenCalledWith({ admin: NON_ADMIN }));
  });

  it('shows sample data and no edit controls while the registry read has not resolved', () => {
    mocks.address = ADMIN;
    registry.get_config.mockReturnValue(new Promise(() => {})); // never resolves
    renderCard();

    expect(screen.getByText('Sample data')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set fee' })).toBeNull();
  });
});

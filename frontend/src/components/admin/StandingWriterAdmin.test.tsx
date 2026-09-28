import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StandingWriterAdmin } from './StandingWriterAdmin';

// Issue #341 — rebuilt on the current UI kit / useSoroban, same
// add_writer/remove_writer/is_writer calls and admin gating as before.

const ADMIN = 'GADMINISTRATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE';
const NON_ADMIN = 'GNOTADMINISTRATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAM';
const WRITER = 'CWRITERCONTRACTEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPL';

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

function makeRecord() {
  return {
    get_admin: vi.fn(() => unwrap(ADMIN)),
    is_writer: vi.fn(() => Promise.resolve({ result: false })),
    add_writer: vi.fn(() => sendable(undefined)),
    remove_writer: vi.fn(() => sendable(undefined)),
  };
}

let record = makeRecord();

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({ record }),
}));

function renderPanel() {
  return render(<StandingWriterAdmin />);
}

describe('StandingWriterAdmin', () => {
  beforeEach(() => {
    mocks.address = null;
    record = makeRecord();
  });

  it('is read-only for a connected wallet that is not the record admin', async () => {
    mocks.address = NON_ADMIN;
    renderPanel();

    await screen.findByText(/read-only mode/i);
    expect(screen.queryByRole('button', { name: 'Add writer' })).toBeNull();
  });

  it('shows admin controls for the record admin', async () => {
    mocks.address = ADMIN;
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Add writer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove writer' })).toBeTruthy();
  });

  it('rejects an invalid address before signing', async () => {
    mocks.address = ADMIN;
    renderPanel();

    const input = await screen.findByLabelText('Add writer');
    fireEvent.change(input, { target: { value: 'not-an-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add writer' }));

    expect(await screen.findByText('Enter a valid contract address.')).toBeTruthy();
    expect(record.add_writer).not.toHaveBeenCalled();
  });

  it('adds a writer and re-checks its status', async () => {
    mocks.address = ADMIN;
    renderPanel();

    const input = await screen.findByLabelText('Add writer');
    fireEvent.change(input, { target: { value: WRITER } });
    fireEvent.click(screen.getByRole('button', { name: 'Add writer' }));

    await waitFor(() => expect(record.add_writer).toHaveBeenCalledWith({ writer: WRITER }));
    await waitFor(() => expect(record.is_writer).toHaveBeenCalledWith({ addr: WRITER }));
  });

  it('removes a writer', async () => {
    mocks.address = ADMIN;
    renderPanel();

    const input = await screen.findByLabelText('Remove writer');
    fireEvent.change(input, { target: { value: WRITER } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove writer' }));

    await waitFor(() => expect(record.remove_writer).toHaveBeenCalledWith({ writer: WRITER }));
  });

  it('shows the writer-status badge once a valid address is entered in the checker', async () => {
    mocks.address = NON_ADMIN;
    record.is_writer.mockReturnValue(Promise.resolve({ result: true }));
    renderPanel();

    const checkInput = await screen.findByLabelText('Check writer status');
    fireEvent.change(checkInput, { target: { value: WRITER } });

    expect(await screen.findByText('Authorized writer')).toBeTruthy();
  });
});

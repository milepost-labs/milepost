import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Buffer } from 'buffer';
import { AttestationRevoke } from './AttestationRevoke';

const ATTESTER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NON_ATTESTER = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const UID_HEX = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const LABEL = 'Attestation #1234';

const mocks = vi.hoisted(() => ({
  address: ATTESTER as string | null,
  announce: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: mocks.address,
    status: mocks.address ? 'connected' : 'disconnected',
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => mocks.announce,
}));

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({
    attest: {
      revoke: mocks.revoke,
      options: { contractId: 'CATTESTCONTRACTADDRESS' },
    },
  }),
}));

function sendable(unwrapFn: () => void = () => undefined) {
  return Promise.resolve({
    signAndSend: vi.fn().mockResolvedValue({
      result: {
        unwrap: unwrapFn,
      },
    }),
  });
}

function renderRevoke(props: Partial<Parameters<typeof AttestationRevoke>[0]> = {}) {
  return render(
    <AttestationRevoke
      uidHex={UID_HEX}
      label={LABEL}
      sampleDelayMs={0}
      {...props}
    />,
  );
}

describe('AttestationRevoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.address = ATTESTER;
    mocks.revoke.mockImplementation(() => sendable());
  });

  it('renders revoke button and opens confirmation sheet with warning copy', () => {
    renderRevoke();

    const openBtn = screen.getByRole('button', { name: `Revoke ${LABEL}` });
    expect(openBtn).toBeDefined();

    fireEvent.click(openBtn);

    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });
    expect(dialog).toBeDefined();
    expect(within(dialog).getByText(LABEL)).toBeDefined();
    expect(
      within(dialog).getByText(/Revoking stops this proof being used again/),
    ).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Yes, revoke' })).toBeDefined();
  });

  it('cancels confirmation when clicking "Keep it" without making any contract call', () => {
    renderRevoke();

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();
  });

  it('successfully revokes attestation on confirmation, speaks announcement, and invokes onRevoked', async () => {
    const onRevoked = vi.fn();
    renderRevoke({ onRevoked });

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));

    await waitFor(() => {
      expect(mocks.revoke).toHaveBeenCalledWith({
        attester: ATTESTER,
        uid: Buffer.from(UID_HEX, 'hex'),
      });
    });

    await waitFor(() => {
      expect(within(dialog).getByText('Attestation revoked')).toBeDefined();
      expect(within(dialog).getByText('The proof can no longer release a tranche.')).toBeDefined();
    });

    expect(mocks.announce).toHaveBeenCalledWith('Attestation revoked.');
    expect(onRevoked).toHaveBeenCalledTimes(1);

    // Click Done closes sheet
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('handles non-revocable schema failure (contract error #4)', async () => {
    mocks.revoke.mockImplementation(() =>
      sendable(() => {
        throw new Error('HostError: Error(Contract, #4)');
      }),
    );

    renderRevoke();

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Not revoked')).toBeDefined();
      expect(
        within(dialog).getByText('Attestations under this schema cannot be revoked.'),
      ).toBeDefined();
    });

    expect(mocks.announce).toHaveBeenCalledWith(
      'Attestations under this schema cannot be revoked.',
      'alert',
    );
  });

  it('handles not the attester failure (contract error #5)', async () => {
    mocks.revoke.mockImplementation(() =>
      sendable(() => {
        throw new Error('HostError: Error(Contract, #5)');
      }),
    );

    renderRevoke();

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Not revoked')).toBeDefined();
      expect(
        within(dialog).getByText('Only the verifier who made an attestation can revoke it.'),
      ).toBeDefined();
    });

    expect(mocks.announce).toHaveBeenCalledWith(
      'Only the verifier who made an attestation can revoke it.',
      'alert',
    );
  });

  it('handles already revoked failure (contract error #6)', async () => {
    mocks.revoke.mockImplementation(() =>
      sendable(() => {
        throw new Error('HostError: Error(Contract, #6)');
      }),
    );

    renderRevoke();

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Not revoked')).toBeDefined();
      expect(
        within(dialog).getByText('This attestation has already been revoked.'),
      ).toBeDefined();
    });

    expect(mocks.announce).toHaveBeenCalledWith(
      'This attestation has already been revoked.',
      'alert',
    );
  });

  it('handles declined signature when user rejects transaction in wallet', async () => {
    mocks.revoke.mockImplementation(() =>
      Promise.resolve({
        signAndSend: vi.fn().mockRejectedValue(new Error('User declined to sign transaction')),
      }),
    );

    renderRevoke();

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Not revoked')).toBeDefined();
      expect(within(dialog).getByText('User declined to sign transaction')).toBeDefined();
    });

    expect(mocks.announce).toHaveBeenCalledWith(
      'User declined to sign transaction',
      'alert',
    );
  });

  it('handles generic contract call failure and permits retry', async () => {
    let attempts = 0;
    mocks.revoke.mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.reject(new Error('Horizon RPC timeout'));
      }
      return sendable();
    });

    renderRevoke();

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Not revoked')).toBeDefined();
      expect(within(dialog).getByText('Horizon RPC timeout')).toBeDefined();
    });

    // Retry should trigger second attempt
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Attestation revoked')).toBeDefined();
    });
    expect(attempts).toBe(2);
  });

  it('does not submit twice when clicked while revoke transaction is pending', async () => {
    let resolveSignAndSend: () => void = () => undefined;
    mocks.revoke.mockImplementation(() =>
      Promise.resolve({
        signAndSend: () =>
          new Promise((resolve) => {
            resolveSignAndSend = () => resolve({ result: { unwrap: () => undefined } });
          }),
      }),
    );

    renderRevoke();

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    const revokeBtn = within(dialog).getByRole('button', { name: 'Yes, revoke' });
    fireEvent.click(revokeBtn);

    // Second click while in flight
    fireEvent.click(revokeBtn);

    expect(mocks.revoke).toHaveBeenCalledTimes(1);

    // Finish pending transaction
    resolveSignAndSend();

    await waitFor(() => {
      expect(within(dialog).getByText('Attestation revoked')).toBeDefined();
    });
  });

  it('supports revoking sample attestations when uidHex is null', async () => {
    const onRevoked = vi.fn();
    renderRevoke({ uidHex: null, onRevoked });

    fireEvent.click(screen.getByRole('button', { name: `Revoke ${LABEL}` }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke attestation' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));

    await waitFor(() => {
      expect(within(dialog).getByText('Attestation revoked')).toBeDefined();
    });

    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalledWith('Attestation revoked.');
    expect(onRevoked).toHaveBeenCalledTimes(1);
  });
});

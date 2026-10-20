import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Buffer } from 'buffer';
import { MemoryRouter } from 'react-router-dom';
import { DeployProgramme } from './DeployProgramme';

// Issue #411 — the schema UID must be confirmed against attest before the
// user can continue. These tests cover the found, not-found and malformed
// cases through the real form.

const ADMIN = `G${'A'.repeat(55)}`;
const UID = 'ab'.repeat(32);

const SCHEMA = {
  authority: `G${'B'.repeat(55)}`,
  definition: 'Requires a verified clinic visit',
  predecessor: null,
  restricted: false,
  revocable: true,
  uid: Buffer.from(UID, 'hex'),
};

const state = vi.hoisted(() => {
  const holder = {
    getSchema: vi.fn(),
    attest: {} as { get_schema: (...args: unknown[]) => unknown },
    registry: { create: () => undefined },
  };
  // Stable client object across renders, like the real memoized provider.
  holder.attest = { get_schema: (...args: unknown[]) => holder.getSchema(...args) };
  return holder;
});

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: ADMIN,
    status: 'connected',
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({ registry: state.registry, attest: state.attest }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <DeployProgramme />
    </MemoryRouter>,
  );
}

function fillStepOne(schema: string) {
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Health worker stipends 2027' },
  });
  fireEvent.change(screen.getByLabelText('Attestation schema UID'), {
    target: { value: schema },
  });
}

describe('DeployProgramme schema check', () => {
  it('confirms a schema exists and shows its definition and revocability', async () => {
    state.getSchema = vi.fn(() => Promise.resolve({ result: { unwrap: () => SCHEMA } }));
    renderPage();
    fillStepOne(UID);

    await screen.findByText('Schema found');
    expect(screen.getByText('Requires a verified clinic visit')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(state.getSchema).toHaveBeenCalled();
    expect(state.getSchema.mock.calls[0][0].uid.toString('hex')).toBe(UID);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(false);
  });

  it('blocks the next step when attest has no schema with that UID', async () => {
    state.getSchema = vi.fn(() =>
      Promise.resolve({
        result: {
          unwrap: () => {
            throw new Error('Error(Contract, #1)');
          },
        },
      }),
    );
    renderPage();
    fillStepOne(UID);

    await screen.findByText(/No schema with this UID exists in attest/);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
  });

  it('never queries attest for a UID that is not 32 bytes of hex', () => {
    state.getSchema = vi.fn();
    renderPage();
    fillStepOne('not-a-uid');

    expect(screen.getByText(/Enter the schema UID as a 32-byte hex string/)).toBeTruthy();
    expect(state.getSchema).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpendPolicy } from './SpendPolicy';

// Issues #409/#410 — configuring the policy and managing its payees. The
// contract gates both on the steward, and the first configuration additionally
// needs the wallet's consent (see contracts/policy-spend/src/lib.rs).

const STEWARD = `G${'A'.repeat(55)}`;
const OTHER = `G${'B'.repeat(55)}`;
const TOKEN = `C${'C'.repeat(55)}`;
const PAYEE = `G${'D'.repeat(55)}`;

const state = vi.hoisted(() => ({
  address: null as string | null,
  policy: null as ReturnType<typeof makePolicy> | null,
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: state.address,
    status: state.address ? 'connected' : 'disconnected',
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ policy: state.policy }),
}));

vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));

function unwrap<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

function confirmed<T>(value: T) {
  return Promise.resolve({
    signAndSend: vi.fn().mockResolvedValue({ result: { unwrap: () => value } }),
  });
}

function direct<T>(value: T) {
  return Promise.resolve({ signAndSend: vi.fn().mockResolvedValue({ result: value }) });
}

function makePolicy(steward = STEWARD) {
  const policy = {
    steward,
    token: TOKEN,
    cap: 1_000n * 10_000_000n,
    period: 30n * 86_400n,
    spent: 0n,
    window_start: 0n,
  };
  return {
    is_installed: vi.fn(() => Promise.resolve({ result: true })),
    get_policy: vi.fn(() => unwrap(policy)),
    remaining: vi.fn(() => unwrap(policy.cap)),
    install: vi.fn(() => direct(null)),
    configure: vi.fn(() => confirmed(undefined)),
    allow_payee: vi.fn(() => confirmed(undefined)),
    deny_payee: vi.fn(() => confirmed(undefined)),
    is_payee: vi.fn(() => Promise.resolve({ result: true })),
  };
}

async function renderPage() {
  render(<SpendPolicy />);
  await screen.findByRole('heading', { name: 'Checks' });
}

function fillConfigureForm(cap = '500', period = '30') {
  fireEvent.change(screen.getByLabelText('Asset contract'), { target: { value: TOKEN } });
  fireEvent.change(screen.getByLabelText('Spending cap per period'), { target: { value: cap } });
  fireEvent.change(screen.getByLabelText('Period (days)'), { target: { value: period } });
}

describe('SpendPolicy configure', () => {
  beforeEach(() => {
    state.address = STEWARD;
    state.policy = makePolicy();
  });

  it('sends configure with the cap and period the steward reviewed', async () => {
    await renderPage();
    fillConfigureForm('500', '30');

    fireEvent.click(screen.getByRole('button', { name: 'Update policy' }));

    await waitFor(() =>
      expect(state.policy!.configure).toHaveBeenCalledWith({
        steward: STEWARD,
        wallet: STEWARD,
        token: TOKEN,
        cap: 500n * 10_000_000n,
        period: 30n * 86_400n,
      }),
    );
  });

  it('rejects an invalid period inline and refuses to sign', async () => {
    await renderPage();
    fillConfigureForm('500', '0');

    expect(screen.getByText('Enter a whole number of days from 1 to 365.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Update policy' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('gates configure on the connected account being the steward', async () => {
    state.address = OTHER;
    await renderPage();
    fillConfigureForm();

    expect(screen.getAllByText(/Only the policy steward/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Update policy' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(state.policy!.configure).not.toHaveBeenCalled();
  });
});

describe('SpendPolicy payees', () => {
  beforeEach(() => {
    state.address = STEWARD;
    state.policy = makePolicy();
  });

  it('adds a payee and remembers it for this session', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Add a payee'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Add payee' }));

    await waitFor(() =>
      expect(state.policy!.allow_payee).toHaveBeenCalledWith({
        steward: STEWARD,
        wallet: STEWARD,
        payee: PAYEE,
      }),
    );
    await screen.findByText('Added this session');
  });

  it('checks a single address with is_payee and shows the result', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Check an address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));

    await screen.findByText('Allowed payee');
    expect(state.policy!.is_payee).toHaveBeenCalledWith({ wallet: STEWARD, payee: PAYEE });
  });

  it('removes a payee added in this session', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Add a payee'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Add payee' }));
    await screen.findByText('Added this session');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(state.policy!.deny_payee).toHaveBeenCalledWith({
        steward: STEWARD,
        wallet: STEWARD,
        payee: PAYEE,
      }),
    );
  });

  it('does not let a non-steward add payees', async () => {
    state.address = OTHER;
    await renderPage();
    fireEvent.change(screen.getByLabelText('Add a payee'), { target: { value: PAYEE } });

    expect(screen.getAllByText(/Only the policy steward/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Add payee' }).hasAttribute('disabled')).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TransactionState } from '../../hooks/useTransaction';
import { explain } from '../../lib/errors';
import { TxSheet } from './TxSheet';

vi.mock('../../hooks/useBalances', () => ({
  useBalances: () => ({
    xlm: null,
    isUnfunded: false,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

function makeTx(overrides: Partial<TransactionState<null>> = {}): TransactionState<null> {
  return {
    phase: 'confirming',
    busy: false,
    error: null,
    result: null,
    estimatedFee: 100_000n,
    slow: false,
    send: vi.fn(),
    prepare: vi.fn(),
    confirm: vi.fn().mockResolvedValue(null),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('TxSheet confirm step', () => {
  it('shows the simulated network fee and enables signing when XLM covers the fee', () => {
    const tx = makeTx({ phase: 'confirming', estimatedFee: 150_000n });
    render(
      <TxSheet
        open
        onClose={vi.fn()}
        tx={tx}
        eyebrow="Spend policy"
        pendingTitle="Installing the policy signer"
        doneTitle="Policy signer installed"
        failTitle="Policy signer not installed"
        xlmBalance={10_000_000n}
        friendbot
      />,
    );

    expect(screen.getByText('Network fee: about 0.015 XLM')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    const signButton = screen.getByRole('button', { name: 'Sign and send' }) as HTMLButtonElement;
    expect(signButton.disabled).toBe(false);
    fireEvent.click(signButton);
    expect(tx.confirm).toHaveBeenCalledOnce();
  });

  it('shows the explained error instead of the sign button when simulation fails', () => {
    const explained = explain(new Error('HostError: Error(Contract, #2)'), 'program');
    const tx = makeTx({
      phase: 'error',
      error: explained,
      estimatedFee: null,
    });
    const onRetry = vi.fn();

    render(
      <TxSheet
        open
        onClose={vi.fn()}
        tx={tx}
        eyebrow="Payees"
        pendingTitle="Verifying the payee"
        doneTitle="Payee verified"
        failTitle="Payee not verified"
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Sign and send' })).toBeNull();
    expect(screen.getByText('Payee not verified')).toBeTruthy();
    expect(screen.getByText(/Nothing was transferred/)).toBeTruthy();
  });

  it('warns and disables signing when XLM balance cannot cover the fee (with Friendbot on testnet)', () => {
    const tx = makeTx({ phase: 'confirming', estimatedFee: 200_000n });
    render(
      <TxSheet
        open
        onClose={vi.fn()}
        tx={tx}
        eyebrow="Schemas"
        pendingTitle="Registering the schema"
        doneTitle="Schema registered"
        failTitle="Schema not registered"
        xlmBalance={50_000n}
        friendbot
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('0.005 XLM');
    expect(alert.textContent).toContain('0.02 XLM');
    expect(alert.textContent).toContain('Friendbot');

    const signButton = screen.getByRole('button', { name: 'Sign and send' }) as HTMLButtonElement;
    expect(signButton.disabled).toBe(true);
    fireEvent.click(signButton);
    expect(tx.confirm).not.toHaveBeenCalled();
  });

  it('omits Friendbot from the insufficient-XLM warning when friendbot is disabled (mainnet)', () => {
    const tx = makeTx({ phase: 'confirming', estimatedFee: 200_000n });
    render(
      <TxSheet
        open
        onClose={vi.fn()}
        tx={tx}
        eyebrow="Schemas"
        pendingTitle="Registering the schema"
        doneTitle="Schema registered"
        failTitle="Schema not registered"
        xlmBalance={50_000n}
        friendbot={false}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).not.toContain('Friendbot');
    expect((screen.getByRole('button', { name: 'Sign and send' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { validateAmount } from '../../lib/amount';
import { AmountField } from './AmountField';

describe('validateAmount', () => {
  it('accepts seven decimal places and refuses an eighth', () => {
    expect(validateAmount('1.0000001')).toEqual({ ok: true, value: 10_000_001n });
    expect(validateAmount('1.00000001')).toEqual({ ok: false, error: 'At most 7 decimal places' });
  });

  it('refuses zero and negative amounts', () => {
    expect(validateAmount('0')).toMatchObject({ ok: false });
    expect(validateAmount('0.0000000')).toMatchObject({ ok: false });
    expect(validateAmount('-5')).toMatchObject({ ok: false });
  });

  it('refuses more than the balance, and accepts exactly the balance', () => {
    expect(validateAmount('100', { balance: 1_000_000_000n })).toMatchObject({ ok: true });
    expect(validateAmount('100.0000001', { balance: 1_000_000_000n })).toMatchObject({ ok: false });
  });
});

function Harness({ balance }: { balance?: bigint }) {
  const [value, setValue] = useState('');
  return (
    <AmountField label="Amount" value={value} onChange={setValue} presets={['100', '500']} balance={balance} />
  );
}

describe('AmountField', () => {
  it('announces an invalid amount once the field is left', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Amount');
    fireEvent.change(input, { target: { value: '-1' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toBe('Amount must not be negative');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('fills the input from a preset and checks it against the balance', () => {
    render(<Harness balance={2_000_000_000n} />);
    fireEvent.click(screen.getByRole('button', { name: '500' }));
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('500');
    expect(screen.getByRole('alert').textContent).toMatch(/^More than your balance/);
  });
});

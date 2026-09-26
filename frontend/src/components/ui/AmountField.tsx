import { useState, type InputHTMLAttributes } from 'react';
import { formatAmount, validateAmount } from '../../lib/amount';
import { Field } from './Field';
import './ui.css';

export interface AmountFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'type'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Trailing unit label. */
  asset?: string;
  /** Whole-unit amounts offered as one-press presets, e.g. ['100', '500', '1,000']. */
  presets?: string[];
  /** In stroops. When given, amounts above it are refused and it is shown as the hint. */
  balance?: bigint;
  hint?: string;
}

/**
 * The one input for money.
 *
 * An invalid amount is refused inline, before anything is signed. The message
 * waits until the field has been left or a preset used, so typing "0." on the
 * way to "0.5" is not shouted at, and it is announced through `Field`'s
 * `role="alert"`.
 */
export function AmountField({
  label,
  value,
  onChange,
  asset = 'USDC',
  presets,
  balance,
  hint,
  onBlur,
  ...rest
}: AmountFieldProps) {
  const [touched, setTouched] = useState(false);
  const result = validateAmount(value, { balance, asset });
  const error = touched && !result.ok ? result.error : null;
  const balanceHint =
    balance !== undefined ? `Balance ${formatAmount(balance, { asset })}` : undefined;

  return (
    <div className="ui-amount">
      <Field
        {...rest}
        className="ui-field--amount"
        label={label}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          setTouched(true);
          onBlur?.(event);
        }}
        suffix={asset}
        hint={hint ?? balanceHint}
        error={error}
      />
      {presets && presets.length > 0 && (
        <div className="ui-amount__presets" role="group" aria-label={`${label} presets`}>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className="ui-amount__preset numeric"
              aria-pressed={value === preset}
              onClick={() => {
                setTouched(true);
                onChange(preset);
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

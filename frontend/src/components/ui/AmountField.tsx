import { useState, type InputHTMLAttributes } from 'react';
import { formatAmount, formatExact, validateAmount } from '../../lib/amount';
import { Field } from './Field';
import './ui.css';

export interface AmountFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'type'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Trailing unit label. Null when the asset is not known yet: the field then shows no unit. */
  asset?: string | null;
  /** Whole-unit amounts offered as one-press presets, e.g. ['100', '500', '1,000']. */
  presets?: string[];
  /** In stroops. When given, amounts above it are refused and it is shown as the hint. */
  balance?: bigint;
  hint?: string;
  /**
   * What to say when the amount is above `balance`, for a limit that is not a
   * wallet balance (a remaining share, say). Defaults to the balance wording.
   */
  overMessage?: string;
  /** Offer a "Max" preset that fills in the whole balance. Needs `balance`. */
  offerMax?: boolean;
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
  overMessage,
  offerMax = false,
  onBlur,
  ...rest
}: AmountFieldProps) {
  const [touched, setTouched] = useState(false);
  const result = validateAmount(value, { balance, asset, overMessage });
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
        suffix={asset ?? undefined}
        hint={hint ?? balanceHint}
        error={error}
      />
      {((presets && presets.length > 0) || (offerMax && balance !== undefined)) && (
        <div className="ui-amount__presets" role="group" aria-label={`${label} presets`}>
          {(presets ?? []).map((preset) => (
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
          {offerMax && balance !== undefined && (
            <button
              type="button"
              className="ui-amount__preset"
              aria-pressed={value === formatExact(balance)}
              onClick={() => {
                setTouched(true);
                onChange(formatExact(balance));
              }}
            >
              Max
            </button>
          )}
        </div>
      )}
    </div>
  );
}

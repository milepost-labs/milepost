import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { formatDateTime } from '../../lib/format';
import './ui.css';

/**
 * The inputs beyond a text field: select, textarea, radio group and a date
 * control that speaks Unix seconds.
 *
 * Each wires its own label and message with `useId`, the same as `Field`. A
 * duplicated id silently breaks label association and only screen-reader users
 * notice, so no caller supplies one.
 */

interface Wrapper {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

function Message({ id, hint, error }: { id: string; hint?: ReactNode; error?: string | null }) {
  const message = error ?? hint;
  if (!message) return null;
  return (
    <p
      id={id}
      className={`ui-field__message${error ? ' ui-field__message--error' : ''}`}
      role={error ? 'alert' : undefined}
    >
      {message}
    </p>
  );
}

export interface SelectProps
  extends Wrapper,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, hint, error, options, placeholder, ...rest }: SelectProps) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>{label}</label>
      <div className={`ui-field__control${error ? ' ui-field__control--error' : ''}`}>
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? messageId : undefined}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <Message id={messageId} hint={hint} error={error} />
    </div>
  );
}

export interface TextAreaProps
  extends Wrapper,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {}

export function TextArea({ label, hint, error, rows = 5, ...rest }: TextAreaProps) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>{label}</label>
      <div className={`ui-field__control ui-field__control--multiline${error ? ' ui-field__control--error' : ''}`}>
        <textarea
          id={id}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? messageId : undefined}
          {...rest}
        />
      </div>
      <Message id={messageId} hint={hint} error={error} />
    </div>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  /** Explains the consequence of choosing this. Worth using where it matters. */
  description?: ReactNode;
}

/**
 * A group of mutually exclusive choices, as a real `fieldset`/`legend` so it is
 * announced as one question rather than several unrelated controls.
 *
 * `description` exists because some choices in this app carry consequences a
 * label cannot convey — a disbursement mode decides whether funds can reach an
 * unverified address.
 */
export function RadioGroup<T extends string>({
  label,
  hint,
  error,
  name,
  value,
  options,
  onChange,
}: Wrapper & {
  name: string;
  value: T | null;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <fieldset className="ui-radiogroup" aria-describedby={hint || error ? messageId : undefined}>
      <legend className="ui-field__label">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`ui-radio${value === option.value ? ' ui-radio--selected' : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="ui-radio__text">
            <span className="ui-radio__label">{option.label}</span>
            {option.description && (
              <span className="ui-radio__description">{option.description}</span>
            )}
          </span>
        </label>
      ))}
      <Message id={messageId} hint={hint} error={error} />
    </fieldset>
  );
}

export interface DateFieldProps extends Wrapper {
  /** Unix **seconds**, matching the contracts. Null when unset. */
  value: number | null;
  onChange: (unixSeconds: number | null) => void;
  /** Earliest permitted value, also in Unix seconds. */
  min?: number | null;
  required?: boolean;
}

/**
 * A date-time control that speaks Unix seconds.
 *
 * Every deadline in these contracts is Unix seconds, and `datetime-local` deals
 * in local-time strings. Converting in each screen is how a programme ends up
 * with deadlines an hour out, so the conversion lives here once.
 */
export function DateField({ label, hint, error, value, onChange, min, required }: DateFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;

  // `datetime-local` wants local time with no zone, so the offset is removed
  // before slicing rather than using toISOString, which would shift by the zone.
  const toInput = (seconds: number | null) => {
    if (seconds === null) return '';
    const date = new Date(seconds * 1000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>{label}</label>
      <div className={`ui-field__control${error ? ' ui-field__control--error' : ''}`}>
        <input
          id={id}
          type="datetime-local"
          required={required}
          value={toInput(value)}
          min={min ? toInput(min) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? messageId : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === '' ? null : Math.floor(new Date(raw).getTime() / 1000));
          }}
        />
      </div>
      <Message
        id={messageId}
        hint={value !== null && !error ? formatDateTime(value) : hint}
        error={error}
      />
    </div>
  );
}

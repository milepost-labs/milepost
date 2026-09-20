import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './ui.css';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Shown under the input. Replaced by `error` when there is one. */
  hint?: ReactNode;
  error?: string | null;
  suffix?: ReactNode;
}

/**
 * Label, input, and its message wired together properly.
 *
 * `useId` rather than a caller-supplied id: a duplicated id silently breaks the
 * label association, and the failure is invisible to anyone not using a screen
 * reader. The error is linked with `aria-describedby` and announced, so it is
 * not only a red border.
 */
export function Field({ label, hint, error, suffix, className = '', ...rest }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={`ui-field ${className}`.trim()}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`ui-field__control${error ? ' ui-field__control--error' : ''}`}>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          {...rest}
        />
        {suffix && <span className="ui-field__suffix">{suffix}</span>}
      </div>
      {message && (
        <p
          id={messageId}
          className={`ui-field__message${error ? ' ui-field__message--error' : ''}`}
          role={error ? 'alert' : undefined}
        >
          {message}
        </p>
      )}
    </div>
  );
}

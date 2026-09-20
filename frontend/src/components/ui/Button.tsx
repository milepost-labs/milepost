import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  /** Disables the button and announces work in progress. */
  loading?: boolean;
  /** Shown while `loading`. Defaults to the button's own label. */
  loadingLabel?: string;
  icon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * Every action in this app either costs money or takes seconds, so `loading` is
 * a first-class prop rather than something each caller reinvents. It disables
 * the button — a double-submitted transaction is a real cost — and announces
 * itself, because a spinner alone tells a screen reader nothing.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  icon,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`ui-button ui-button--${variant} ui-button--${size}${fullWidth ? ' ui-button--full' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <span className="ui-spinner" aria-hidden="true" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

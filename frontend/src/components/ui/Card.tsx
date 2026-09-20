import type { ReactNode } from 'react';
import './ui.css';

export interface CardProps {
  title?: ReactNode;
  /** Sits opposite the title — an action, a status, a timestamp. */
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, aside, footer, children, className = '' }: CardProps) {
  return (
    <section className={`ui-card ${className}`.trim()}>
      {(title || aside) && (
        <header className="ui-card__header">
          {title && <h2 className="ui-card__title">{title}</h2>}
          {aside && <div className="ui-card__aside">{aside}</div>}
        </header>
      )}
      <div className="ui-card__body">{children}</div>
      {footer && <footer className="ui-card__footer">{footer}</footer>}
    </section>
  );
}

/**
 * A single figure. `numeric` renders amounts in tabular figures so columns of
 * money line up — they are always read by comparison, never in isolation.
 */
export function Stat({
  label,
  value,
  hint,
  numeric = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="ui-stat">
      <span className="ui-stat__label">{label}</span>
      <span className={`ui-stat__value${numeric ? ' numeric' : ''}`}>{value}</span>
      {hint && <span className="ui-stat__hint">{hint}</span>}
    </div>
  );
}

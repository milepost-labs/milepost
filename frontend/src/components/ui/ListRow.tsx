import type { ReactNode } from 'react';
import './ui.css';

/**
 * Card-like list rows for dashboards.
 *
 * The redesign separates by background step and space rather than borders, so
 * a row is a filled surface with room around it and no rule underneath. Every
 * row is at least `--tap-min` tall so a trailing action stays tappable, and
 * the trailing slot holds the amount, badge or button.
 *
 * `ListRow` renders an `<li>`: put rows inside {@link List} so the group is
 * announced as a list.
 */
export interface ListRowProps {
  /** Optional leading marker: an icon, an avatar or a money square. */
  leading?: ReactNode;
  title: ReactNode;
  /** Quiet second line under the title. */
  meta?: ReactNode;
  /** Right-aligned amount, badge or action. */
  trailing?: ReactNode;
  className?: string;
}

export function ListRow({ leading, title, meta, trailing, className }: ListRowProps) {
  return (
    <li className={className ? `ui-list-row ${className}` : 'ui-list-row'}>
      {leading && <span className="ui-list-row__leading">{leading}</span>}
      <span className="ui-list-row__main">
        <span className="ui-list-row__title">{title}</span>
        {meta && <span className="ui-list-row__meta">{meta}</span>}
      </span>
      {trailing && <span className="ui-list-row__trailing">{trailing}</span>}
    </li>
  );
}

export interface ListProps {
  children: ReactNode;
  className?: string;
  /** Accessible name for the group, e.g. "Your contributions". */
  label?: string;
}

/** A `<ul>` of {@link ListRow}s with the shared no-divider spacing. */
export function List({ children, className, label }: ListProps) {
  return (
    <ul className={className ? `ui-list ${className}` : 'ui-list'} aria-label={label}>
      {children}
    </ul>
  );
}

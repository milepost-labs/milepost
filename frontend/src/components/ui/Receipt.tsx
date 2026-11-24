import type { ReactNode } from 'react';
import './ui.css';

export interface ReceiptRow {
  label: string;
  value: ReactNode;
  /** Set for words rather than figures; values are mono by default. */
  text?: boolean;
}

/**
 * Label–value rows on a sunken ground: a receipt, a summary before signing,
 * the facts of one record. Values are mono, since most are amounts, ids or
 * ledgers.
 */
export function Receipt({ rows, className = '' }: { rows: ReceiptRow[]; className?: string }) {
  return (
    <dl className={`ui-receipt ${className}`.trim()}>
      {rows.map((row) => (
        <div key={row.label} className="ui-receipt__row">
          <dt>{row.label}</dt>
          <dd className={row.text ? undefined : 'numeric'}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

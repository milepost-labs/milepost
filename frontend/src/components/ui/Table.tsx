import type { ReactNode } from 'react';
import './ui.css';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  /** Right-aligns and uses tabular figures. Use for amounts and counts. */
  numeric?: boolean;
}

/**
 * A table that becomes a list of cards on narrow screens.
 *
 * Horizontal scrolling is the usual answer and it is a poor one on a phone,
 * which is the device most of these users have. Each cell carries its column
 * header as a data attribute so the stacked layout stays readable.
 */
export function Table<Row>({
  columns,
  rows,
  keyOf,
  caption,
}: {
  columns: Column<Row>[];
  rows: Row[];
  keyOf: (row: Row, index: number) => string;
  caption?: string;
}) {
  return (
    <div
      className="ui-table__scroll"
      tabIndex={0}
      role="region"
      aria-label={caption ?? 'Data table'}
    >
      <table className="ui-table">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? 'numeric-col' : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={keyOf(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={typeof column.header === 'string' ? column.header : undefined}
                  className={column.numeric ? 'numeric numeric-col' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

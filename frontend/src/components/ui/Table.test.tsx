import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, type Column } from './Table';
import { List, ListRow } from './ListRow';

interface Row {
  id: string;
  recipient: string;
  amount: string;
}

const rows: Row[] = [{ id: 'a', recipient: 'GBB4…8T19', amount: '14,000.00 USDC' }];

const columns: Column<Row>[] = [
  { key: 'recipient', header: 'Recipient', render: (row) => row.recipient },
  { key: 'amount', header: 'Amount', numeric: true, render: (row) => row.amount },
];

describe('Table (issue #251)', () => {
  it('keeps table semantics and labels cells with their column for the stacked layout', () => {
    render(
      <Table
        columns={columns}
        rows={rows}
        keyOf={(row) => row.id}
        caption="Contributions"
      />,
    );

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Recipient' })).toBeDefined();

    const cell = screen.getByRole('cell', { name: 'GBB4…8T19' });
    expect(cell.getAttribute('data-label')).toBe('Recipient');

    const amountCell = screen.getByRole('cell', { name: '14,000.00 USDC' });
    expect(amountCell.className).toContain('numeric-col');
    expect(amountCell.getAttribute('data-label')).toBe('Amount');
  });

  it('exposes the caption to assistive technology', () => {
    render(
      <Table columns={columns} rows={rows} keyOf={(row) => row.id} caption="Contributions" />,
    );
    expect(screen.getByRole('table', { name: 'Contributions' })).toBeDefined();
  });
});

describe('List / ListRow (issue #251)', () => {
  it('renders rows as list items with leading, meta and trailing slots', () => {
    render(
      <List label="Contributions">
        <ListRow
          leading={<span aria-hidden="true">■</span>}
          title="Programme A"
          meta="Open"
          trailing="500 USDC"
        />
      </List>,
    );

    expect(screen.getByRole('list', { name: 'Contributions' })).toBeDefined();
    expect(screen.getByRole('listitem')).toBeDefined();
    expect(screen.getByText('Programme A')).toBeDefined();
    expect(screen.getByText('Open')).toBeDefined();
    expect(screen.getByText('500 USDC')).toBeDefined();
  });
});

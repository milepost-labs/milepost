import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgrammeLifetimesTable, type ProgrammeLifetimeRow } from './ProgrammeLifetimesTable';
import { explain } from '../../lib/errors';
import { truncateAddress } from '../../lib/format';

const id = (letter: string) => `C${letter.repeat(55)}`;

const ROWS: ProgrammeLifetimeRow[] = [
  { programmeId: id('A'), name: 'Long lived', liveForDays: 85, error: null },
  { programmeId: id('B'), name: 'Nearly due', liveForDays: 12, error: null },
  { programmeId: id('C'), name: null, liveForDays: 30, error: null },
  { programmeId: id('D'), name: 'Unreadable', liveForDays: null, error: new Error('Failed to fetch') },
  { programmeId: id('E'), name: 'Archived', liveForDays: null, error: null },
];

const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('every programme\'s lifetime table', () => {
  it('lists the programmes with fewest days left first', () => {
    render(<ProgrammeLifetimesTable rows={ROWS} onExtend={vi.fn()} />);

    const names = bodyRows().map((row) => within(row).getAllByRole('cell')[0].textContent);
    expect(names[0]).toContain('Archived');
    expect(names[1]).toContain('Nearly due');
    expect(names[2]).toContain(truncateAddress(id('C')));
    expect(names[3]).toContain('Long lived');
    expect(names[4]).toContain('Unreadable');
  });

  it('marks rows under 30 days in words, not only colour', () => {
    render(<ProgrammeLifetimesTable rows={ROWS} onExtend={vi.fn()} />);
    const [archived, nearlyDue, thirty, longLived] = bodyRows();

    expect(within(nearlyDue).getByText('12 days')).toBeTruthy();
    expect(within(nearlyDue).getByText('Under 30 days')).toBeTruthy();
    expect(within(archived).getByText('Not found')).toBeTruthy();
    expect(within(archived).getByText(/Archived or missing/)).toBeTruthy();
    expect(within(thirty).queryByText('Under 30 days')).toBeNull();
    expect(within(longLived).queryByText('Under 30 days')).toBeNull();
  });

  it('says a read failed, through explain(), instead of showing a number', () => {
    render(<ProgrammeLifetimesTable rows={ROWS} onExtend={vi.fn()} />);
    const unreadable = bodyRows()[4];

    expect(within(unreadable).getByText(/^Could not read:/).textContent).toBe(
      `Could not read: ${explain(new Error('Failed to fetch')).message}`,
    );
    expect(within(unreadable).queryByText(/days$/)).toBeNull();
  });

  it('hands the chosen programme to the extend flow', () => {
    const onExtend = vi.fn();
    render(<ProgrammeLifetimesTable rows={ROWS} onExtend={onExtend} />);

    fireEvent.click(screen.getByRole('button', { name: 'Extend Nearly due' }));

    expect(onExtend).toHaveBeenCalledWith(id('B'));
  });
});

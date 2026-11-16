import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DisabledReason, Notice, PageHead, Receipt, Segmented, StatTile } from './index';

describe('Notice', () => {
  it('carries its tone, a decorative icon and an optional role', () => {
    const { container } = render(
      <Notice tone="warn" role="status">
        <strong>This list is 14 hours old.</strong> Figures may be out of date.
      </Notice>,
    );
    const notice = screen.getByRole('status');
    expect(notice.className).toContain('ui-notice--warn');
    expect(notice.textContent).toContain('This list is 14 hours old.');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is plain text when no role is given', () => {
    const { container } = render(<Notice>Lists are advisory.</Notice>);
    expect(container.firstElementChild?.getAttribute('role')).toBeNull();
    expect(container.firstElementChild?.className).toContain('ui-notice--info');
  });
});

describe('DisabledReason', () => {
  it('can be pointed at by the control it explains', () => {
    render(
      <>
        <button type="button" aria-disabled="true" aria-describedby="why">
          Contribute
        </button>
        <DisabledReason id="why">Available only while the programme is Open. This programme is in Review.</DisabledReason>
      </>,
    );
    const button = screen.getByRole('button', { name: 'Contribute' });
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Available only while the programme is Open. This programme is in Review.',
    );
  });
});

describe('PageHead', () => {
  it('renders the section, one h1, the lead and the action', () => {
    render(
      <PageHead eyebrow="Programmes" title="Where the money is going" action={<a href="/admin">Deploy a programme</a>}>
        Every programme on Milepost.
      </PageHead>,
    );
    expect(screen.getByText('Programmes')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Where the money is going']);
    expect(screen.getByText('Every programme on Milepost.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Deploy a programme' })).toBeTruthy();
  });
});

describe('Segmented', () => {
  it('marks the chosen option as pressed and reports a new choice', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Filter by phase"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'All', count: 7 },
          { value: 'open', label: 'Open', count: 2 },
        ]}
      />,
    );
    const group = within(screen.getByRole('group', { name: 'Filter by phase' }));
    expect(group.getByRole('button', { name: /All/ }).getAttribute('aria-pressed')).toBe('true');
    const open = group.getByRole('button', { name: /Open/ });
    expect(open.getAttribute('aria-pressed')).toBe('false');
    expect(open.textContent).toBe('Open2');
    fireEvent.click(open);
    expect(onChange).toHaveBeenCalledWith('open');
  });
});

describe('StatTile', () => {
  it('shows the label, figure, unit and hint, and can carry the accent', () => {
    const { container } = render(<StatTile label="Released" value="6,400" unit="USDC" hint="3 tranches per award" highlight />);
    expect(screen.getByText('Released')).toBeTruthy();
    expect(container.querySelector('.ui-stat-tile__value')?.textContent).toBe('6,400USDC');
    expect(screen.getByText('3 tranches per award')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('ui-stat-tile--highlight');
  });
});

describe('Receipt', () => {
  it('lists label–value pairs, mono for figures and plain for words', () => {
    render(
      <Receipt
        rows={[
          { label: 'Programme', value: 'Lakeside Secondary Bursaries 2027', text: true },
          { label: 'Sent', value: '250.00 USDC' },
        ]}
      />,
    );
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Programme', 'Sent']);
    const [programme, sent] = screen.getAllByRole('definition');
    expect(programme.className).toBe('');
    expect(sent.className).toBe('numeric');
    expect(sent.textContent).toBe('250.00 USDC');
  });
});

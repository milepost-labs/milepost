import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Deadline } from './Deadline';

describe('Deadline', () => {
  it('renders local date and relative time', () => {
    const futureUnix = Math.floor(Date.now() / 1000) + 3 * 86_400;
    render(<Deadline unixSeconds={futureUnix} />);

    expect(screen.getByText(/3 days/)).toBeTruthy();
  });

  it('reads local, relative and UTC in that order with no tab stop', () => {
    const futureUnix = Math.floor(Date.now() / 1000) + 3 * 86_400;
    render(<Deadline unixSeconds={futureUnix} label="Applications close" />);

    const el = document.querySelector('.deadline');
    expect(el).toBeTruthy();
    // Issue #481: a deadline is not a control, so it must not be a tab stop.
    expect(el?.querySelector('[tabindex]')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();

    expect(Array.from(el?.children ?? []).map((child) => child.className)).toEqual([
      'deadline__label',
      'deadline__local',
      'deadline__relative',
      'deadline__utc',
    ]);

    const local = el?.querySelector('.deadline__local');
    const relative = el?.querySelector('.deadline__relative');
    const utc = el?.querySelector('.deadline__utc');
    expect(local?.textContent?.trim().length).toBeGreaterThan(0);
    expect(relative?.textContent?.trim().length).toBeGreaterThan(0);
    expect(utc?.textContent).toContain('UTC');
    expect(
      local && relative && local.compareDocumentPosition(relative) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows label when provided', () => {
    const futureUnix = Math.floor(Date.now() / 1000) + 3 * 86_400;
    render(<Deadline unixSeconds={futureUnix} label="Applications close" />);

    expect(screen.getByText('Applications close')).toBeTruthy();
  });

  it('marks past deadlines and leaves upcoming ones unmarked', () => {
    const pastUnix = Math.floor(Date.now() / 1000) - 3 * 86_400;
    const futureUnix = Math.floor(Date.now() / 1000) + 3 * 86_400;

    const { rerender } = render(<Deadline unixSeconds={pastUnix} />);
    expect(document.querySelector('.deadline')?.hasAttribute('data-past')).toBe(true);

    rerender(<Deadline unixSeconds={futureUnix} />);
    expect(document.querySelector('.deadline')?.hasAttribute('data-past')).toBe(false);
  });
});

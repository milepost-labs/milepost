import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Deadline } from './Deadline';

describe('Deadline', () => {
  it('renders local date and relative time', () => {
    const futureUnix = Math.floor(Date.now() / 1000) + 3 * 86_400;
    render(<Deadline unixSeconds={futureUnix} />);

    expect(screen.getByText(/3 days/)).toBeTruthy();
  });

  it('renders UTC on hover/focus', () => {
    const futureUnix = Math.floor(Date.now() / 1000) + 3 * 86_400;
    render(<Deadline unixSeconds={futureUnix} />);

    const utcEl = screen.getByRole('note');
    expect(utcEl.textContent).toContain('UTC');
  });

  it('shows label when provided', () => {
    const futureUnix = Math.floor(Date.now() / 1000) + 3 * 86_400;
    render(<Deadline unixSeconds={futureUnix} label="Applications close" />);

    expect(screen.getByText('Applications close')).toBeTruthy();
  });

  it('marks past deadlines', () => {
    const pastUnix = Math.floor(Date.now() / 1000) - 3 * 86_400;
    render(<Deadline unixSeconds={pastUnix} />);

    const el = document.querySelector('.deadline');
    expect(el?.hasAttribute('data-past')).toBe(true);
  });
});

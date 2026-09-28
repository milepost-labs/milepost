import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Deadline } from './Deadline';

describe('Deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders local date and relative time', () => {
    const futureUnix = Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000);
    render(<Deadline unixSeconds={futureUnix} />);

    expect(screen.getByText(/7 days/)).toBeTruthy();
  });

  it('renders UTC on hover/focus', () => {
    const futureUnix = Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000);
    render(<Deadline unixSeconds={futureUnix} />);

    const utcEl = screen.getByRole('note');
    expect(utcEl.textContent).toContain('UTC');
  });

  it('shows label when provided', () => {
    const futureUnix = Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000);
    render(<Deadline unixSeconds={futureUnix} label="Applications close" />);

    expect(screen.getByText('Applications close')).toBeTruthy();
  });

  it('marks past deadlines', () => {
    const pastUnix = Math.floor(new Date('2026-09-20T12:00:00Z').getTime() / 1000);
    render(<Deadline unixSeconds={pastUnix} />);

    const el = document.querySelector('.deadline');
    expect(el?.getAttribute('data-past')).toBe('');
  });
});

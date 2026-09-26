import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProgrammeHeader } from './ProgrammeHeader';

const baseProps = {
  id: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
  name: 'Secondary school bursaries 2026',
  creator: 'GAKR7W…D2QX',
  createdLedger: 4811204,
};

describe('ProgrammeHeader', () => {
  it('shows the phase, name and read provenance, and no mode pill', () => {
    render(<ProgrammeHeader {...baseProps} phase="Open" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Secondary school bursaries 2026',
    );
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.queryByText(/ mode$/)).toBeNull();
    expect(screen.getByText('GAKR7W…D2QX')).toBeTruthy();
    expect(screen.getByText(/4,811,204/)).toBeTruthy();
    expect(screen.getByText(/Phase read on-chain just now/i)).toBeTruthy();
  });

  it('marks nothing current while the phase is unread, and says when the read failed', () => {
    const { rerender } = render(<ProgrammeHeader {...baseProps} phase={null} />);
    expect(screen.queryByText(/Now ·/)).toBeNull();
    expect(screen.getByText(/Reading the phase on-chain/)).toBeTruthy();
    rerender(<ProgrammeHeader {...baseProps} phase={null} phaseError />);
    expect(screen.getByText(/Could not read the phase on-chain/)).toBeTruthy();
  });

  it('marks the current step and ticks passed phases', () => {
    render(<ProgrammeHeader {...baseProps} phase="Review" />);

    const current = screen.getByText(/Now ·/).closest('li');
    expect(current?.getAttribute('aria-current')).toBe('step');
    expect(current?.textContent).toContain('Review');

    // Open has passed, so it carries a tick.
    expect(screen.getByText(/✓ Open/)).toBeTruthy();
    expect(screen.getByText(/Phase read on-chain just now/i)).toBeTruthy();
  });

  it('shows no current step and a banner when cancelled', () => {
    render(<ProgrammeHeader {...baseProps} phase="Cancelled" />);

    expect(screen.queryByText(/Now ·/)).toBeNull();
    expect(screen.getByText(/was cancelled/i)).toBeTruthy();
  });
});

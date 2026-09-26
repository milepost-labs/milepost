import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProgrammeHeader } from './ProgrammeHeader';

const baseProps = {
  id: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY',
  name: 'Secondary school bursaries 2026',
  creator: 'GAKR7W…D2QX',
  createdLedger: 4811204,
  mode: 'Direct',
  sampleTag: 'Sample chain read' as string | null,
  cancelled: false,
};

describe('ProgrammeHeader', () => {
  it('shows the phase, mode, name and read provenance', () => {
    render(<ProgrammeHeader {...baseProps} phase="Open" readStatus="sample" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Secondary school bursaries 2026',
    );
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.getByText('Direct mode')).toBeTruthy();
    expect(screen.getByText('Sample chain read')).toBeTruthy();
    expect(screen.getByText('GAKR7W…D2QX')).toBeTruthy();
    expect(screen.getByText(/4,811,204/)).toBeTruthy();
    expect(screen.getByText(/sample until on-chain reads are wired/i)).toBeTruthy();
  });

  it('marks the current step and ticks passed phases', () => {
    render(<ProgrammeHeader {...baseProps} phase="Review" readStatus="live" />);

    const current = screen.getByText(/Now ·/).closest('li');
    expect(current?.getAttribute('aria-current')).toBe('step');
    expect(current?.textContent).toContain('Review');

    // Open has passed, so it carries a tick.
    expect(screen.getByText(/✓ Open/)).toBeTruthy();
    expect(screen.getByText(/Phase read on-chain just now/i)).toBeTruthy();
  });

  it('shows no current step and a banner when cancelled', () => {
    render(<ProgrammeHeader {...baseProps} phase="Cancelled" readStatus="live" cancelled />);

    expect(screen.queryByText(/Now ·/)).toBeNull();
    expect(screen.getByText(/was cancelled/i)).toBeTruthy();
  });
});

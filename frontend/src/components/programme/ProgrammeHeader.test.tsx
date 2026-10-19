import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ProgrammeHeader } from './ProgrammeHeader';

const baseProps = {
  id: 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7',
  name: 'Community resilience grants 2026',
  creator: 'GAKR7W…D2QX',
  createdLedger: 4811204,
};

function renderHeader(props: Parameters<typeof ProgrammeHeader>[0]) {
  return render(
    <MemoryRouter>
      <ProgrammeHeader {...props} />
    </MemoryRouter>,
  );
}

describe('ProgrammeHeader', () => {
  it('shows the phase, name and read provenance for a real programme, with no sample tag', () => {
    renderHeader({ ...baseProps, phase: 'Open' });

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Community resilience grants 2026',
    );
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    // A deployed programme has no programme-level mode on-chain, so nothing
    // invents one for it.
    expect(screen.queryByText(/ mode$/)).toBeNull();
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.getByText('GAKR7W…D2QX')).toBeTruthy();
    expect(screen.getByText(/4,811,204/)).toBeTruthy();
    expect(screen.getByText(/Phase read on-chain just now/i)).toBeTruthy();
  });

  it('shows the phase, planned mode and sample tag together for a sample programme', () => {
    renderHeader({ ...baseProps, phase: 'Review', mode: 'Direct', sample: true });

    const badges = screen.getByText('Direct mode').parentElement as HTMLElement;
    expect(within(badges).getByText('Review')).toBeTruthy();
    expect(within(badges).getByText('Direct mode')).toBeTruthy();
    expect(within(badges).getByText('Sample data')).toBeTruthy();
  });

  it('returns to the directory the reader came from, filters included', () => {
    renderHeader({ ...baseProps, phase: 'Open', backTo: '/directory?q=flood&phase=Open' });

    expect(screen.getByRole('link', { name: /All programmes/ }).getAttribute('href')).toBe(
      '/directory?q=flood&phase=Open',
    );
  });

  it('returns to the plain directory when the programme link carried no filters', () => {
    renderHeader({ ...baseProps, phase: 'Open' });

    expect(screen.getByRole('link', { name: /All programmes/ }).getAttribute('href')).toBe(
      '/directory',
    );
  });

  it('marks nothing current while the phase is unread, and says when the read failed', () => {
    const { rerender } = render(<ProgrammeHeader {...baseProps} phase={null} />, {
      wrapper: MemoryRouter,
    });
    expect(screen.queryByText(/Now ·/)).toBeNull();
    expect(screen.getByText(/Reading the phase on-chain/)).toBeTruthy();
    rerender(<ProgrammeHeader {...baseProps} phase={null} phaseError />);
    expect(screen.getByText(/Could not read the phase on-chain/)).toBeTruthy();
  });

  it('marks the current step and ticks passed phases', () => {
    renderHeader({ ...baseProps, phase: 'Review' });

    const current = screen.getByText(/Now ·/).closest('li');
    expect(current?.getAttribute('aria-current')).toBe('step');
    expect(current?.textContent).toContain('Review');

    // Open has passed, so it carries a tick.
    expect(screen.getByText(/✓ Open/)).toBeTruthy();
    expect(screen.getByText(/Phase read on-chain just now/i)).toBeTruthy();
  });

  it('shows no current step and a banner when cancelled', () => {
    renderHeader({ ...baseProps, phase: 'Cancelled' });

    expect(screen.queryByText(/Now ·/)).toBeNull();
    expect(screen.getByText(/was cancelled/i)).toBeTruthy();
    expect(screen.getByText(/their share of everything not yet paid out/i)).toBeTruthy();
  });
});

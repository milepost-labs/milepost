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

    const badges = screen.getByText('Direct').parentElement as HTMLElement;
    expect(within(badges).getByText('Review')).toBeTruthy();
    expect(within(badges).getByText('Direct')).toBeTruthy();
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
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    expect(screen.getByText(/Reading the phase on-chain/)).toBeTruthy();
    rerender(<ProgrammeHeader {...baseProps} phase={null} phaseError />);
    expect(screen.getByText(/Could not read the phase on-chain/)).toBeTruthy();
  });

  it('marks the current step "now" and says which steps have passed', () => {
    renderHeader({ ...baseProps, phase: 'Review' });

    const steps = within(screen.getByRole('list', { name: 'Programme phases' })).getAllByRole('listitem');
    expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual([null, 'step', null, null]);
    expect(steps[1].textContent).toContain('Review · now');

    // Open has passed; the fill is colour, so the words say it too.
    expect(steps[0].textContent).toContain('Open (passed)');
    expect(screen.getByText(/Phase read on-chain just now/i)).toBeTruthy();
  });

  it('dates each step from the programme deadlines, in the tense the clock gives', () => {
    const day = 86_400;
    const now = 1_800_000_000;
    renderHeader({
      ...baseProps,
      phase: 'Review',
      nowMs: now * 1000,
      deadlines: { apply: now - day, review: now + day, release: now + 30 * day, sweep: now + 60 * day },
    });

    const steps = within(screen.getByRole('list', { name: 'Programme phases' })).getAllByRole('listitem');
    expect(steps[0].textContent).toContain('Applications closed');
    expect(steps[1].textContent).toContain('Review ends');
    // Half of the review window has gone, so the bar is painted half way.
    expect(steps[1].style.getPropertyValue('--phase-progress')).toBe('50%');
    // The Open step has no start on the chain, so it is never part-filled.
    expect(steps[0].style.getPropertyValue('--phase-progress')).toBe('');
  });

  it('moves to Sweep once a settled programme passes its release window', () => {
    const day = 86_400;
    const now = 1_800_000_000;
    renderHeader({
      ...baseProps,
      phase: 'Settled',
      nowMs: now * 1000,
      deadlines: { apply: now - 9 * day, review: now - 6 * day, release: now - day, sweep: now + 5 * day },
    });

    const current = document.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain('Sweep · now');
    expect(current?.textContent).toContain('Leftovers to treasury from');
  });

  it('shortens the creator address so the header never runs wider than a phone', () => {
    renderHeader({
      ...baseProps,
      creator: 'GCS7774GF6OHIEXCXMUGI56RLOPHE3SEOK4F2CEMQYFXALNEYLK5IGHX',
      phase: 'Open',
    });

    expect(screen.getByText('GCS777…IGHX')).toBeTruthy();
    expect(screen.queryByText('GCS7774GF6OHIEXCXMUGI56RLOPHE3SEOK4F2CEMQYFXALNEYLK5IGHX')).toBeNull();
  });

  it('shows no current step and a banner when cancelled', () => {
    renderHeader({ ...baseProps, phase: 'Cancelled' });

    expect(document.querySelector('[aria-current="step"]')).toBeNull();
    expect(screen.getByText(/was cancelled/i)).toBeTruthy();
    expect(screen.getByText(/their share of everything not yet paid out/i)).toBeTruthy();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
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
    // No lastReadAt passed — chip not shown, static fallback text shown.
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
    // No lastReadAt — chip not shown, static fallback shown.
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

  // ── Creation date ────────────────────────────────────────────────────────

  it('shows the ledger number and exact creation date when createdAt is provided', () => {
    // 2024-01-15 00:00:00 UTC
    const createdAt = 1_705_276_800;
    renderHeader({ ...baseProps, phase: 'Open', createdAt });

    // The ledger number is still present.
    expect(screen.getByText(/4,811,204/)).toBeTruthy();
    // The formatted date appears somewhere in the document; exact locale
    // string varies by environment so we match the year at minimum.
    expect(screen.getByText(/2024/)).toBeTruthy();
    // No "about" label for an exact date.
    expect(screen.queryByText(/about/i)).toBeNull();
  });

  it('marks the date approximate with "about" when createdAtIsEstimate is true', () => {
    const createdAt = 1_705_276_800;
    renderHeader({ ...baseProps, phase: 'Open', createdAt, createdAtIsEstimate: true });

    expect(screen.getByText(/about/i)).toBeTruthy();
    expect(screen.getByText(/2024/)).toBeTruthy();
  });

  it('shows only the ledger number and no date when createdAt is null', () => {
    renderHeader({ ...baseProps, phase: 'Open', createdAt: null });

    expect(screen.getByText(/4,811,204/)).toBeTruthy();
    // No year from a date — there should be nothing that looks like a
    // four-digit year from the creation date rendering.
    // (Phase bar dates use relative labels so years don't bleed in here.)
    expect(screen.queryByText(/about/i)).toBeNull();
  });

  it('shows a dash when createdLedger is null and createdAt is null', () => {
    renderHeader({ ...baseProps, createdLedger: null, phase: 'Open' });

    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText(/about/i)).toBeNull();
  });

  // ── Chain-age chip ───────────────────────────────────────────────────────

  describe('chain-age chip', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows "just now" chip when lastReadAt is the current time', () => {
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      renderHeader({ ...baseProps, phase: 'Open', lastReadAt: now });

      expect(screen.getByRole('button', { name: /read on the chain just now/i })).toBeTruthy();
    });

    it('shows "N s ago" after 10 seconds', async () => {
      const readAt = 1_700_000_000_000;
      vi.setSystemTime(readAt);
      renderHeader({ ...baseProps, phase: 'Open', lastReadAt: readAt });

      // Initial render shows "just now".
      expect(screen.getByRole('button', { name: /read on the chain just now/i })).toBeTruthy();

      // Advance clock and flush timers inside act so React sees the state update.
      await act(async () => { vi.advanceTimersByTime(10_000); });

      expect(screen.getByRole('button', { name: /10 s ago/i })).toBeTruthy();
    });

    it('shows "N min ago" after more than a minute', async () => {
      const readAt = 1_700_000_000_000;
      vi.setSystemTime(readAt);
      renderHeader({ ...baseProps, phase: 'Open', lastReadAt: readAt });

      await act(async () => { vi.advanceTimersByTime(70_000); });

      expect(screen.getByRole('button', { name: /1 min ago/i })).toBeTruthy();
    });

    it('calls onRefetch when the chip is pressed', () => {
      const readAt = 1_700_000_000_000;
      vi.setSystemTime(readAt);
      const onRefetch = vi.fn();
      renderHeader({ ...baseProps, phase: 'Open', lastReadAt: readAt, onRefetch });

      fireEvent.click(screen.getByRole('button', { name: /read on the chain/i }));
      expect(onRefetch).toHaveBeenCalledOnce();
    });

    it('shows the fallback loading text when lastReadAt is not provided', () => {
      renderHeader({ ...baseProps, phase: 'Open' });

      expect(screen.queryByRole('button', { name: /read on the chain/i })).toBeNull();
      // No lastReadAt — the static fallback is shown instead of the chip.
      expect(screen.getByText(/Phase read on-chain just now/i)).toBeTruthy();
    });

    it('does not use an aria-live region (chip ticking must not announce itself)', () => {
      const readAt = 1_700_000_000_000;
      vi.setSystemTime(readAt);
      const { container } = renderHeader({ ...baseProps, phase: 'Open', lastReadAt: readAt });

      // No aria-live attribute anywhere in the header.
      expect(container.querySelector('[aria-live]')).toBeNull();
    });
  });
});

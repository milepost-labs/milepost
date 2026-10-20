import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgrammeActions } from './ProgrammeActions';

const wallet = vi.hoisted(() => ({ address: null as string | null }));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({ address: wallet.address, status: 'disconnected', connect: vi.fn() }),
}));

const ID = 'CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C';

function renderPanel(props: Partial<Parameters<typeof ProgrammeActions>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProgrammeActions programmeId={ID} phase="Review" refundsOpen={false} refundable={null} verified={true} {...props} />
    </MemoryRouter>,
  );
}

const row = (name: string) =>
  screen.getByText(name, { selector: '.programme-action__label' }).closest('li') as HTMLElement;

describe('ProgrammeActions', () => {
  beforeEach(() => {
    wallet.address = 'GD4KQ2EXAMPLEADDRESSFORTESTSONLYXXXXXXXXXXXXXXXXXXX2QXW';
  });

  it('wires every unavailable action to its reason through aria-describedby', () => {
    renderPanel({ phase: 'Review' });
    const contribute = within(row('Contribute')).getByRole('button', { name: 'Contribute' });
    expect(contribute.getAttribute('aria-disabled')).toBe('true');

    const reasonId = contribute.getAttribute('aria-describedby')!;
    expect(document.getElementById(reasonId)?.textContent).toBe(
      'Available only while the programme is Open. This programme is Review.',
    );
  });

  it('keeps unavailable actions focusable so the reason can be reached', () => {
    renderPanel({ phase: 'Review' });
    const release = within(row('Release a tranche')).getByRole('button', { name: 'Release' });
    expect(release.hasAttribute('disabled')).toBe(false);
    release.focus();
    expect(document.activeElement).toBe(release);
  });

  it('deep-links available actions with ?programme=', () => {
    renderPanel({ phase: 'Review' });
    const finalize = within(row('Finalize awards')).getByRole('link', { name: 'Finalize' });
    expect(finalize.getAttribute('href')).toBe(`/finalize?programme=${ID}`);
    expect(document.getElementById(finalize.getAttribute('aria-describedby')!)).not.toBeNull();
  });

  it('links to payee management with the programme preselected', () => {
    renderPanel();
    const manage = screen.getByRole('link', { name: 'Manage payees' });
    expect(manage.getAttribute('href')).toBe(`/admin/payees?programme=${ID}`);
  });

  it('names who each action is for', () => {
    renderPanel();
    expect(within(row('Contribute')).getByText('Funders')).toBeTruthy();
    expect(within(row('Finalize awards')).getByText('Anyone')).toBeTruthy();
  });

  it('shows what signing in would enable when signed out', () => {
    wallet.address = null;
    renderPanel({ phase: 'Open' });

    expect(screen.getByText(/Sign in to act on this programme/)).toBeTruthy();
    expect(within(screen.getByRole('list')).queryAllByRole('link')).toHaveLength(0);
    expect(within(row('Contribute')).getByText('Sign in to contribute.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeTruthy();
  });

  it('offers a refund with the amount once refunds open', () => {
    renderPanel({ phase: 'Settled', refundsOpen: true, refundable: '165 XLM' });
    const refund = within(row('Claim a refund')).getByRole('link', { name: 'Refund' });
    expect(document.getElementById(refund.getAttribute('aria-describedby')!)?.textContent).toMatch(/^165 XLM is refundable/);
  });
});

describe('Registry verification gating', () => {
  beforeEach(() => {
    wallet.address = 'GD4KQ2EXAMPLEADDRESSFORTESTSONLYXXXXXXXXXXXXXXXXXXX2QXW';
  });

  describe('verified — normal operation', () => {
    it('renders write actions normally when the registry confirms deployment', () => {
      renderPanel({ phase: 'Open', verified: true });

      // No warning banner.
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText(/not deployed by the milepost registry/i)).toBeNull();

      // The contribute action is enabled (Open phase, signed in).
      const contribute = within(row('Contribute')).getByRole('link', { name: 'Contribute' });
      expect(contribute.getAttribute('href')).toContain('/funders');
    });

    it('does not show a directory link when verified', () => {
      renderPanel({ phase: 'Open', verified: true });
      expect(screen.queryByRole('link', { name: /find a programme in the directory/i })).toBeNull();
    });
  });

  describe('unverified — write actions blocked', () => {
    it('shows the warning banner when verified is false', () => {
      renderPanel({ phase: 'Open', verified: false });

      const banner = screen.getByRole('alert');
      expect(banner.textContent).toMatch(/not deployed by the milepost registry/i);
    });

    it('links to the directory from the warning banner', () => {
      renderPanel({ phase: 'Open', verified: false });

      const link = screen.getByRole('link', { name: /find a programme in the directory/i });
      expect(link.getAttribute('href')).toBe('/directory');
    });

    it('disables every write action when verified is false', () => {
      renderPanel({ phase: 'Open', verified: false });

      // No <Link> elements for actions (all must be aria-disabled buttons).
      const actionLinks = screen
        .queryAllByRole('link')
        .filter((el) => el.closest('.programme-actions__list'));
      expect(actionLinks).toHaveLength(0);

      // Every action button is aria-disabled.
      const buttons = screen
        .getAllByRole('button')
        .filter((el) => el.getAttribute('aria-disabled') === 'true');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('explains verification failure through aria-describedby on each action', () => {
      renderPanel({ phase: 'Open', verified: false });

      const contributeBtn = within(row('Contribute')).getByRole('button', { name: 'Contribute' });
      const reasonId = contributeBtn.getAttribute('aria-describedby')!;
      expect(document.getElementById(reasonId)?.textContent).toMatch(
        /not deployed by the milepost registry/i,
      );
    });

    it('keeps every action button focusable so the reason is reachable by keyboard', () => {
      renderPanel({ phase: 'Open', verified: false });

      const contributeBtn = within(row('Contribute')).getByRole('button', { name: 'Contribute' });
      // aria-disabled, not disabled — stays in the tab order.
      expect(contributeBtn.hasAttribute('disabled')).toBe(false);
      contributeBtn.focus();
      expect(document.activeElement).toBe(contributeBtn);
    });
  });

  describe('pending — verified is null (read in flight)', () => {
    it('shows a quiet status notice while the registry read is in flight', () => {
      renderPanel({ phase: 'Open', verified: null });

      // role="status" (polite), not role="alert" — pending is temporary.
      const notice = screen.getByRole('status');
      expect(notice.textContent).toMatch(/checking registry/i);
    });

    it('does not show the negative warning copy while pending', () => {
      renderPanel({ phase: 'Open', verified: null });
      expect(screen.queryByText(/not deployed by the milepost registry/i)).toBeNull();
    });

    it('disables every write action while the read is in flight', () => {
      renderPanel({ phase: 'Open', verified: null });

      const actionLinks = screen
        .queryAllByRole('link')
        .filter((el) => el.closest('.programme-actions__list'));
      expect(actionLinks).toHaveLength(0);

      const buttons = screen
        .getAllByRole('button')
        .filter((el) => el.getAttribute('aria-disabled') === 'true');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('explains pending through aria-describedby on each action', () => {
      renderPanel({ phase: 'Open', verified: null });

      const contributeBtn = within(row('Contribute')).getByRole('button', { name: 'Contribute' });
      const reasonId = contributeBtn.getAttribute('aria-describedby')!;
      expect(document.getElementById(reasonId)?.textContent).toMatch(/checking whether this programme/i);
    });
  });

  describe('failed read — treated as unverified', () => {
    // The caller (ProgrammeDetail) maps isRegistered.error → false, so
    // ProgrammeActions sees verified=false, not an error object.
    // These tests confirm that verified=false behaves identically to a
    // negative read — the component cannot tell them apart, by design.

    it('blocks all writes when verified=false (the value a failed read produces)', () => {
      renderPanel({ phase: 'Open', verified: false });

      const actionLinks = screen
        .queryAllByRole('link')
        .filter((el) => el.closest('.programme-actions__list'));
      expect(actionLinks).toHaveLength(0);
    });

    it('shows the unverified warning (not a generic error) when the read failed', () => {
      renderPanel({ phase: 'Open', verified: false });

      // The banner is the unverified warning, not a technical error panel.
      expect(screen.getByRole('alert').textContent).toMatch(/not deployed by the milepost registry/i);
      expect(screen.queryByText(/something went wrong/i)).toBeNull();
    });

    it('still links to the directory when the read failed', () => {
      renderPanel({ phase: 'Open', verified: false });
      const link = screen.getByRole('link', { name: /find a programme in the directory/i });
      expect(link.getAttribute('href')).toBe('/directory');
    });
  });
});

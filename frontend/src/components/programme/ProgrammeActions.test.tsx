import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgrammeActions } from './ProgrammeActions';

const wallet = vi.hoisted(() => ({ address: null as string | null }));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({ address: wallet.address, status: 'disconnected', connect: vi.fn() }),
}));

const ID = 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC';

function renderPanel(props: Partial<Parameters<typeof ProgrammeActions>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProgrammeActions programmeId={ID} phase="Review" refundsOpen={false} refundable={null} {...props} />
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

  it('names who each action is for', () => {
    renderPanel();
    expect(within(row('Contribute')).getByText('Funders')).toBeTruthy();
    expect(within(row('Finalize awards')).getByText('Anyone')).toBeTruthy();
  });

  it('shows what signing in would enable when signed out', () => {
    wallet.address = null;
    renderPanel({ phase: 'Open' });

    expect(screen.getByText(/Sign in to act on this programme/)).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
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

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { explainCode } from '../lib/errors';
import { FunderDashboard } from './FunderDashboard';

const mocks = vi.hoisted(() => ({ address: null as string | null, announce: vi.fn() }));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: mocks.address, status: mocks.address ? 'connected' : 'disconnected', connect: vi.fn() }),
}));
vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));
vi.mock('../context/useSoroban', () => ({ useSoroban: () => ({ programmeAt: vi.fn() }) }));
vi.mock('../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/indexer')>()),
  fetchProgrammes: vi.fn(async () => []),
}));
// Live reads against the seeded testnet programme; covered by their own components.
vi.mock('../components/funder/SeededProgrammeTools', () => ({ SeededProgrammeTools: () => null }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/funders']}>
      <FunderDashboard />
    </MemoryRouter>,
  );
}

const card = (name: string) => screen.getByRole('link', { name }).closest('li') as HTMLElement;

describe('Issue #82 — Cancel programme error explanations and logic', () => {
  it('translates Cancelled (16) into a clear error explanation', () => {
    const explained = explainCode('program', 16);
    expect(explained.kind).toBe('blocked');
    expect(explained.message).toContain('This programme has been cancelled');
  });

  it('translates NotCancellable (17) into a clear error explanation', () => {
    const explained = explainCode('program', 17);
    expect(explained.kind).toBe('denied');
    expect(explained.message).toContain('A programme that holds funds or has made awards cannot be cancelled');
  });
});

describe('Funding dashboard', () => {
  beforeEach(() => {
    mocks.address = 'GDONOR';
    mocks.announce.mockClear();
  });

  it('explains what signing in would show when signed out, instead of empty panels', () => {
    mocks.address = null;
    renderPage();
    expect(screen.getByRole('heading', { name: 'Sign in to see your funding' })).toBeTruthy();
    const preview = screen.getByRole('list', { name: 'What signing in shows' });
    expect(within(preview).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Your contributions')).toBeNull();
    expect(screen.queryByText('Refundable now')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows contributed, programmes and refundable-now totals', async () => {
    renderPage();
    const stats = screen.getByRole('region', { name: 'Your funding' });
    await waitFor(() => expect(within(stats).getByText('3,500 USDC')).toBeTruthy());
    expect(within(stats).getByText('3')).toBeTruthy();
    // 220 from SME microgrants + 495 from the cancelled flood programme.
    expect(within(stats).getByText('715 USDC')).toBeTruthy();
  });

  it('offers a refund claim only on contributions where it is claimable', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Secondary school bursaries 2026' });

    expect(within(card('Secondary school bursaries 2026')).queryByRole('button', { name: 'Claim refund' })).toBeNull();
    expect(within(card('Secondary school bursaries 2026')).getByText(/Still open/)).toBeTruthy();
    expect(within(card('SME supplier microgrants Q2')).getByRole('button', { name: 'Claim refund' })).toBeTruthy();
    expect(within(card('Flood response cash transfers')).getByRole('button', { name: 'Claim refund' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Claim refund' })).toHaveLength(2);
  });

  it('removes the claim once refunded and announces it', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Flood response cash transfers' });
    fireEvent.click(within(card('Flood response cash transfers')).getByRole('button', { name: 'Claim refund' }));

    await waitFor(
      () => expect(within(card('Flood response cash transfers')).getByText('Refunded 495 USDC.')).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(within(card('Flood response cash transfers')).queryByRole('button', { name: 'Claim refund' })).toBeNull();
    expect(mocks.announce).toHaveBeenCalledWith('Refund of 495 USDC sent to your account.');
    expect(within(screen.getByRole('region', { name: 'Your funding' })).getByText('220 USDC')).toBeTruthy();
  });

  it('shows each contribution with its programme, phase, amount and a status note', async () => {
    renderPage();
    const sme = await screen.findByRole('link', { name: 'SME supplier microgrants Q2' });
    expect(sme.getAttribute('href')).toBe('/programme/CA3NSMEMICROGRANTSQ2V8TX4QK7PL2RZ9MD5HW6JUB');
    const item = card('SME supplier microgrants Q2');
    expect(within(item).getByText('Settled')).toBeTruthy();
    expect(within(item).getByText('2,000 USDC')).toBeTruthy();
    expect(within(item).getByText('220 USDC refundable, your share of unawarded budget.')).toBeTruthy();
  });
});

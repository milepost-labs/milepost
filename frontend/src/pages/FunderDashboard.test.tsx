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
vi.mock('../context/useSoroban', () => {
  // Built once: reads key on the clients, and the real context is memoized.
  const soroban = {
    programmeAt: vi.fn(),
    registry: { is_programme: vi.fn(async () => ({ result: true })) },
  };
  return { useSoroban: () => soroban, useOptionalSoroban: () => soroban };
});
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
    expect(explained.message).toContain('Money has already been paid out to a recipient');
  });
});

describe('Funding dashboard', () => {
  beforeEach(() => {
    mocks.address = 'GDONOR';
    mocks.announce.mockClear();
  });

  it('says what signing in would show when signed out, instead of empty panels', () => {
    mocks.address = null;
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Your funding' })).toBeTruthy();
    expect(screen.getByText("See and manage what you've funded")).toBeTruthy();
    expect(screen.getByText(/You can browse every programme without signing in\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse programmes' }).getAttribute('href')).toBe('/directory');
    expect(screen.queryByRole('region', { name: 'Your funding' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Contribute' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Freighter' }));
    expect(screen.getByRole('dialog', { name: 'Connect your wallet' })).toBeTruthy();
  });

  it('shows contributed, released and refundable-now totals, in the asset once', async () => {
    renderPage();
    const stats = screen.getByRole('region', { name: 'Your funding' });
    const tile = (label: string) => within(stats).getByText(label).parentElement as HTMLElement;
    await waitFor(() => expect(tile('Contributed').textContent).toContain('3,500USDC'));
    expect(tile('Contributed').textContent).toContain('Across 3 programmes');
    // 220 from SME microgrants + 495 from the cancelled flood programme.
    expect(tile('Refundable now').textContent).toContain('715USDC');
    expect(tile('Refundable now').textContent).toContain('From 2 programmes');
    expect(tile('Released to people')).toBeTruthy();
  });

  it('offers a refund claim only on contributions where it is claimable', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Community resilience grants 2026' });

    expect(within(card('Community resilience grants 2026')).queryByRole('button', { name: 'Claim refund' })).toBeNull();
    expect(within(card('Community resilience grants 2026')).getByText(/Still open/)).toBeTruthy();
    expect(within(card('SME supplier microgrants Q2')).getByRole('button', { name: 'Claim refund' })).toBeTruthy();
    expect(within(card('Flood response cash transfers')).getByRole('button', { name: 'Claim refund' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Claim refund' })).toHaveLength(2);
  });

  it('claims a refund in a sheet, shows its receipt, and removes the claim', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Flood response cash transfers' });
    fireEvent.click(within(card('Flood response cash transfers')).getByRole('button', { name: 'Claim refund' }));

    const sheet = await screen.findByRole('dialog', { name: 'Claim your refund' });
    const signButton = await within(sheet).findByRole('button', { name: 'Sign and claim refund' });
    fireEvent.click(signButton);

    expect(await within(sheet).findAllByText('Refund claimed', {}, { timeout: 3000 })).toBeTruthy();
    expect(within(sheet).getByText(/495 USDC sent back to your wallet, in proportion/)).toBeTruthy();
    expect(within(sheet).getByText('4,853,391')).toBeTruthy();
    expect(mocks.announce).toHaveBeenCalledWith('Refund of 495 USDC sent to your wallet.');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(card('Flood response cash transfers')).getByText('Refunded 495 USDC.')).toBeTruthy();
    expect(within(card('Flood response cash transfers')).queryByRole('button', { name: 'Claim refund' })).toBeNull();
    const stats = screen.getByRole('region', { name: 'Your funding' });
    expect(within(stats).getByText('Refundable now').parentElement?.textContent).toContain('220USDC');
  });

  it('shows each contribution with its programme, phase, share and a status line', async () => {
    renderPage();
    const sme = await screen.findByRole('link', { name: 'SME supplier microgrants Q2' });
    expect(sme.getAttribute('href')).toBe('/programme/CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM');
    const item = card('SME supplier microgrants Q2');
    expect(within(item).getByText('Settled')).toBeTruthy();
    expect(within(item).getByText('You put in').nextElementSibling?.textContent).toBe('2,000');
    expect(within(item).getByText('Your share')).toBeTruthy();
    expect(within(item).getByText('220 USDC')).toBeTruthy();
    expect(within(item).getByText(/your share of what wasn't paid out/)).toBeTruthy();
    expect(within(item).getByRole('img', { name: /Money distribution/ })).toBeTruthy();
  });

  it('opens the contribute sheet from the page action', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Contribute' }));
    expect(screen.getByRole('dialog', { name: 'Fund this programme' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("opens the contribute sheet with the programme chosen when a programme's Contribute brought the reader here", async () => {
    render(
      <MemoryRouter initialEntries={['/funders?programme=CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI']}>
        <FunderDashboard />
      </MemoryRouter>,
    );
    // Opens once the link checks out against the registry.
    const sheet = await screen.findByRole('dialog', { name: 'Fund this programme' });
    expect((within(sheet).getByLabelText('Programme') as HTMLSelectElement).selectedOptions[0].textContent).toBe(
      'Smallholder inputs, long rains',
    );
  });
});

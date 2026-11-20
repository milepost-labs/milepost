import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReceiptLookup } from './ReceiptLookup';
import { ProposeProgramme } from './ProposeProgramme';
import { parseProposalParam } from '../fixtures/adminFixtures';

const PROGRAMME = `CPRG${'A'.repeat(52)}`;
const DONOR = `GDON${'B'.repeat(52)}`;
const HASH = 'ab'.repeat(32);

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), announce: vi.fn(), copied: [] as string[] }));

vi.mock('../lib/txLookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/txLookup')>()),
  lookupTransaction: (...args: unknown[]) => mocks.lookup(...args),
  rpcServer: () => ({}),
}));
vi.mock('../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/indexer')>()),
  fetchProgrammes: vi.fn(async () => [{ id: PROGRAMME, name: 'Community health worker stipend 2026', creator: null, createdLedger: 1 }]),
}));
vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));

function ok<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    rpcUrl: 'https://rpc.test',
    programmeAt: () => ({
      get_config: () => ok({ fee_bps: 250 }),
      contributed_by: async () => ({ result: 1_000_000_000n }),
      total_contributed: async () => ({ result: 4_000_000_000n }),
    }),
  }),
}));

function renderAt(element: React.ReactElement, url = '/') {
  return render(<MemoryRouter initialEntries={[url]}>{element}</MemoryRouter>);
}

describe('ReceiptLookup', () => {
  beforeEach(() => {
    mocks.lookup.mockReset();
    mocks.announce.mockClear();
  });

  it('rebuilds a contribution receipt and reads where the money sits now', async () => {
    mocks.lookup.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 4_697_300,
      createdAt: 1_790_000_000,
      opCount: 1,
      contribution: { programmeId: PROGRAMME, donor: DONOR, amount: 250_000_000n },
      refund: null,
    });
    renderAt(<ReceiptLookup />, `/funders/receipt?hash=${HASH}`);

    expect(await screen.findByRole('heading', { name: 'Contribution · 25 XLM' })).toBeTruthy();
    expect(await screen.findByText('2.5% of contributions')).toBeTruthy();
    expect(await screen.findByText('25%')).toBeTruthy();
    expect(mocks.announce).toHaveBeenCalledWith('Receipt rebuilt from the transaction.');
  });

  it('points to the explorer when the network no longer has the transaction', async () => {
    mocks.lookup.mockResolvedValue({ status: 'NOT_FOUND' });
    renderAt(<ReceiptLookup />);
    fireEvent.change(screen.getByLabelText('Transaction hash'), { target: { value: HASH } });
    fireEvent.click(screen.getByRole('button', { name: 'Find receipt' }));

    expect(await screen.findByText('The network no longer has this transaction.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the explorer' })).toBeTruthy();
  });

  it('refuses something that is not a hash without asking the network', async () => {
    renderAt(<ReceiptLookup />);
    fireEvent.change(screen.getByLabelText('Transaction hash'), { target: { value: 'nope' } });
    expect(screen.getByText(/doesn’t look like a transaction hash/)).toBeTruthy();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it('rebuilds a full refund receipt with the returned amount', async () => {
    mocks.lookup.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 4_700_000,
      createdAt: 1_790_100_000,
      opCount: 1,
      contribution: null,
      refund: { programmeId: PROGRAMME, donor: DONOR, amount: 180_000_000n, partial: false },
    });
    renderAt(<ReceiptLookup />, `/funders/receipt?hash=${HASH}`);

    expect(await screen.findByRole('heading', { name: 'Refund · 18 XLM' })).toBeTruthy();
    // Does NOT show "Partial refund" row for a full refund.
    expect(screen.queryByText('Partial refund')).toBeNull();
    expect(mocks.announce).toHaveBeenCalledWith('Refund receipt rebuilt from the transaction.');
  });

  it('rebuilds a partial refund receipt and labels it as partial', async () => {
    mocks.lookup.mockResolvedValue({
      status: 'SUCCESS',
      ledger: 4_700_001,
      createdAt: 1_790_200_000,
      opCount: 1,
      contribution: null,
      refund: { programmeId: PROGRAMME, donor: DONOR, amount: 50_000_000n, partial: true },
    });
    renderAt(<ReceiptLookup />, `/funders/receipt?hash=${HASH}`);

    expect(await screen.findByRole('heading', { name: 'Partial refund · 5 XLM' })).toBeTruthy();
    expect(await screen.findByText('Partial refund')).toBeTruthy();
  });
});

describe('ProposeProgramme', () => {
  it('builds a summary and a deploy link the wizard can read back', async () => {
    let copied = '';
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async (t: string) => void (copied = t)) } });
    renderAt(<ProposeProgramme />);

    expect(screen.getByText('Name the programme to make a deploy link.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Programme name'), { target: { value: 'Kano clinic stipends' } });
    fireEvent.change(screen.getByLabelText('What has to happen before money moves?'), {
      target: { value: 'Shifts worked this month' },
    });
    fireEvent.change(screen.getByLabelText('Preferred payment mode'), { target: { value: 'Direct' } });

    expect(screen.getByText(/Programme proposal: Kano clinic stipends/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy deploy link' }));
    await waitFor(() => expect(copied).toContain('/admin?proposal='));

    const param = new URL(copied).searchParams.get('proposal');
    const parsed = parseProposalParam(param ? encodeURIComponent(param) : null);
    expect(parsed.ok && parsed.proposal).toMatchObject({
      name: 'Kano clinic stipends',
      mode: 'Direct',
      tranches: 3,
      condition: 'Shifts worked this month',
    });
    expect(screen.getByRole('link', { name: 'Email it' }).getAttribute('href')).toMatch(/^mailto:\?subject=/);
  });
});

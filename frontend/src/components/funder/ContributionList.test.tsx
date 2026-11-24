import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ContributionCard } from '../../lib/funding';
import { ContributionList } from './ContributionList';

const PROGRAMME_ID = 'CBAVXWACVVQIBYAZ2YCSIPWXA24E3NZ3CIRAWJ2UHEQUQP67POYS6GFM';
const SAMPLE_ID = 'CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI';

const mocks = vi.hoisted(() => ({
  address: 'GDONOR' as string | null,
  announce: vi.fn(),
  signTransaction: vi.fn(),
  refund: vi.fn(),
  contributedBy: vi.fn(),
  totalContributed: vi.fn(),
  totalReleased: vi.fn(),
  getConfig: vi.fn(),
  refundedTo: vi.fn(),
}));

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: mocks.address,
    status: mocks.address ? 'connected' : 'disconnected',
    signTransaction: mocks.signTransaction,
  }),
}));
vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));
vi.mock('../../hooks/useBalances', () => ({
  useBalances: () => ({
    xlm: 100_000_000n,
    isUnfunded: false,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../context/useSoroban', () => {
  const client = {
    refund: mocks.refund,
    contributed_by: mocks.contributedBy,
    total_contributed: mocks.totalContributed,
    total_released: mocks.totalReleased,
    get_config: mocks.getConfig,
    refunded_to: mocks.refundedTo,
  };
  const soroban = { programmeAt: vi.fn(() => client) };
  return { useSoroban: () => soroban, useOptionalSoroban: () => soroban };
});

function makeCard(overrides: Partial<ContributionCard> = {}): ContributionCard {
  return {
    programmeId: PROGRAMME_ID,
    name: 'SME supplier microgrants Q2',
    phase: 'Settled',
    asset: 'USDC',
    chain: null,
    sample: false,
    amount: 20_000_000_000n,
    share: 5_000n,
    releasedShare: 15_000_000_000n,
    refundable: 4_950_000_000n,
    estimatedRefund: 0n,
    claimable: true,
    refunded: false,
    note: "Your share of what wasn't paid out.",
    refundedSoFar: 0n,
    ...overrides,
  };
}

function renderList(cards: ContributionCard[], onRefunded = vi.fn()) {
  return render(
    <MemoryRouter>
      <ContributionList cards={cards} onRefunded={onRefunded} sampleDelayMs={0} />
    </MemoryRouter>,
  );
}

describe('ContributionList — refund claims', () => {
  beforeEach(() => {
    mocks.address = 'GDONOR';
    mocks.announce.mockClear();
    mocks.signTransaction.mockReset();
    mocks.refund.mockReset();
    mocks.contributedBy.mockReset().mockResolvedValue({ result: 20_000_000_000n });
    mocks.totalContributed.mockReset().mockResolvedValue({ result: 40_000_000_000n });
    mocks.totalReleased.mockReset().mockResolvedValue({ result: 29_700_000_000n });
    mocks.getConfig.mockReset().mockResolvedValue({ result: { unwrap: () => ({ fee_bps: 100 }) } });
    mocks.refundedTo.mockReset().mockResolvedValue({ result: 0n });
  });

  it('claims an on-chain refund, shows the receipt, and notifies the parent', async () => {
    const onRefunded = vi.fn();
    const signAndSend = vi.fn().mockResolvedValue({
      result: { unwrap: () => 4_950_000_000n },
      getTransactionResponse: { ledger: 4_853_391, txHash: '0xdeadbeef1234567890' },
    });
    mocks.refund.mockResolvedValue({
      simulationResponse: { minResourceFee: '10000' },
      signAndSend,
    });

    renderList([makeCard()], onRefunded);

    fireEvent.click(await screen.findByRole('button', { name: 'Claim refund' }));
    const sheet = await screen.findByRole('dialog', { name: 'Claim your refund' });
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Sign and claim refund' }));

    expect(await within(sheet).findByRole('heading', { name: 'Refund claimed', level: 3 })).toBeTruthy();
    expect(within(sheet).getByText(/495 USDC sent back to your wallet, in proportion/)).toBeTruthy();
    expect(within(sheet).getByText('4,853,391')).toBeTruthy();
    expect(mocks.refund).toHaveBeenCalledWith({ donor: 'GDONOR' });
    expect(onRefunded).toHaveBeenCalledWith(PROGRAMME_ID);
    expect(mocks.announce).toHaveBeenCalledWith('Refund of 495 USDC sent to your wallet.');
  });

  it('shows Nothing was sent when the user declines the signature', async () => {
    const onRefunded = vi.fn();
    mocks.refund.mockResolvedValue({
      simulationResponse: { minResourceFee: '10000' },
      signAndSend: vi.fn().mockRejectedValue(new Error('User declined')),
    });

    renderList([makeCard()], onRefunded);

    fireEvent.click(await screen.findByRole('button', { name: 'Claim refund' }));
    const sheet = await screen.findByRole('dialog', { name: 'Claim your refund' });
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Sign and claim refund' }));

    expect(await within(sheet).findByRole('heading', { name: 'Nothing was sent', level: 3 })).toBeTruthy();
    expect(within(sheet).getByText('You declined the signature.')).toBeTruthy();
    expect(within(sheet).getByText('Nothing was submitted.')).toBeTruthy();
    expect(onRefunded).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalledWith(expect.anything(), 'alert');
  });

  it('treats error 27 (nothing to refund) as information without an alert announcement', async () => {
    const onRefunded = vi.fn();
    mocks.refund.mockRejectedValue(new Error('HostError: Error(Contract, #27)'));

    renderList([makeCard()], onRefunded);

    fireEvent.click(await screen.findByRole('button', { name: 'Claim refund' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nothing was sent' });

    expect(await within(sheet).findByRole('heading', { name: 'Nothing was sent', level: 3 })).toBeTruthy();
    expect(within(sheet).getByText('There is nothing to refund.')).toBeTruthy();
    expect(
      within(sheet).getByText('Either this address never contributed, or everything the programme still held has been paid out.'),
    ).toBeTruthy();
    expect(onRefunded).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalledWith(expect.anything(), 'alert');
  });

  it('announces a failure and lets the user retry the refund', async () => {
    const onRefunded = vi.fn();
    mocks.refund
      .mockRejectedValueOnce(new Error('HostError: Error(Contract, #2)'))
      .mockResolvedValueOnce({
        simulationResponse: { minResourceFee: '10000' },
        signAndSend: vi.fn().mockResolvedValue({
          result: { unwrap: () => 4_950_000_000n },
          getTransactionResponse: { ledger: 4_853_392, txHash: '0xretry' },
        }),
      });

    renderList([makeCard()], onRefunded);

    fireEvent.click(await screen.findByRole('button', { name: 'Claim refund' }));
    const sheet = await screen.findByRole('dialog', { name: "Refund didn't go through" });

    expect(await within(sheet).findByRole('heading', { name: "Refund didn't go through", level: 3 })).toBeTruthy();
    await waitFor(() =>
      expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining("Refund didn't go through."), 'alert'),
    );

    fireEvent.click(within(sheet).getByRole('button', { name: 'Try again' }));
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Sign and claim refund' }));

    expect(await within(sheet).findByRole('heading', { name: 'Refund claimed', level: 3 })).toBeTruthy();
    expect(mocks.refund).toHaveBeenCalledTimes(2);
    expect(onRefunded).toHaveBeenCalledWith(PROGRAMME_ID);
  });

  it('claims a sample card refund without touching the contract and marks it Sample receipt', async () => {
    const onRefunded = vi.fn();
    renderList(
      [
        makeCard({
          programmeId: SAMPLE_ID,
          name: 'Flood response cash transfers',
          phase: 'Cancelled',
          sample: true,
        }),
      ],
      onRefunded,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Claim refund' }));
    const sheet = await screen.findByRole('dialog', { name: 'Claim your refund' });
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Sign and claim refund' }));

    expect(await within(sheet).findByRole('heading', { name: 'Refund claimed', level: 3 })).toBeTruthy();
    expect(within(sheet).getByText('Sample receipt')).toBeTruthy();
    expect(within(sheet).queryByRole('link')).toBeNull();
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.contributedBy).not.toHaveBeenCalled();
    expect(onRefunded).toHaveBeenCalledWith(SAMPLE_ID);
    expect(mocks.announce).toHaveBeenCalledWith('Refund of 495 USDC sent to your wallet.');
  });
});

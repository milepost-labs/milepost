import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AllocatedSpending } from './AllocatedSpending';
import type { RecipientAwardFixture } from '../../fixtures/recipientFixtures';
import { explain, explainCode } from '../../lib/errors';
import { phaseRequirement } from '../../lib/phaseGate';
import { formatAmount } from '../../lib/amount';
import { truncateAddress } from '../../lib/format';

const RECIPIENT = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';
const PAYEE = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const PROGRAMME_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const walletMocks = vi.hoisted(() => ({
  address: 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA' as string | null,
  connect: vi.fn(),
  signTransaction: vi.fn(async () => ({
    signedTxXdr: 'SIGNEDXDR==',
    signerAddress: 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA',
  })),
}));

// The asset read has its own tests (hooks/useProgrammeAsset.test.tsx). Here a
// sample programme is in its stand-in asset and a deployed one pays in XLM.
vi.mock('../../hooks/useProgrammeAsset', async () => {
  const { isSampleProgrammeId } = await import('../../lib/programmeView');
  return {
    useProgrammeAsset: (id: string | null | undefined) => (!id ? null : isSampleProgrammeId(id) ? 'USDC' : 'XLM'),
  };
});

vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: walletMocks.address,
    status: walletMocks.address ? 'connected' : 'disconnected',
    network: 'TESTNET',
    networkError: null,
    expectedNetwork: 'Testnet',
    connect: walletMocks.connect,
    signTransaction: walletMocks.signTransaction,
  }),
}));

const mockAnnounce = vi.fn();
vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => mockAnnounce,
}));

let mockClient: {
  allocation_of: ReturnType<typeof vi.fn>;
  get_phase: ReturnType<typeof vi.fn>;
  is_payee: ReturnType<typeof vi.fn>;
  spend: ReturnType<typeof vi.fn>;
};

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: () => mockClient,
  }),
}));

function makeAward(overrides: Partial<RecipientAwardFixture> = {}): RecipientAwardFixture {
  return {
    programmeId: PROGRAMME_ID,
    programmeName: 'Community Grants 2026',
    recipient: RECIPIENT,
    granted: '20000000000',
    released: '10000000000',
    tranches: 2,
    tranchesReleased: 1,
    mode: 'Allocated',
    payee: null,
    escrow: '10000000000',
    updatedLedger: 4640021,
    attestationReady: false,
    condition: 'Milestone attested',
    ...overrides,
  };
}

describe('AllocatedSpending component failure paths & branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletMocks.address = RECIPIENT;

    mockClient = {
      allocation_of: vi.fn().mockResolvedValue({ result: 10_000_000_000n }), // 1,000 XLM
      get_phase: vi.fn().mockResolvedValue({ result: { unwrap: () => ({ tag: 'Settled' }) } }),
      is_payee: vi.fn().mockResolvedValue({ result: true }),
      spend: vi.fn().mockResolvedValue({
        signAndSend: vi.fn().mockResolvedValue({
          result: { unwrap: () => 0n },
        }),
      }),
    };
  });

  it('renders role-gate when wallet is not connected, and clicking Sign in calls connect()', () => {
    walletMocks.address = null;

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Connect a wallet to direct your escrow to a verified payee.')).toBeDefined();
    const signInBtn = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.click(signInBtn);
    expect(walletMocks.connect).toHaveBeenCalledTimes(1);
  });

  it('renders phase-error panel with retry button when get_phase rejects', async () => {
    mockClient.get_phase.mockRejectedValue(new Error('Network error on phase'));

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it.each(['Open', 'Review'] as const)('renders the phase gate before the spend window opens (%s)', async (phase) => {
    mockClient.get_phase.mockResolvedValue({ result: { unwrap: () => ({ tag: phase }) } });

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(phaseRequirement('Settled', phase))).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Send to payee' })).toBeNull();
  });

  it('renders phase-blocked gate when programme was Cancelled', async () => {
    mockClient.get_phase.mockResolvedValue({ result: { unwrap: () => ({ tag: 'Cancelled' }) } });

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(phaseRequirement('Settled', 'Cancelled'))).toBeDefined();
  });

  it('renders allocation-error panel when allocation_of read fails', async () => {
    mockClient.allocation_of.mockRejectedValue(new Error('Contract allocation read error'));

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('renders empty notice when allocation is 0n', async () => {
    mockClient.allocation_of.mockResolvedValue({ result: 0n });

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Nothing held in escrow right now.')).toBeDefined();
    });
  });

  it('refuses an unverified payee, showing error 30, and prevents spend submission', async () => {
    mockClient.is_payee.mockResolvedValue({ result: false });

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Check payee' });

    // Enter payee address and click Check payee
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));

    const err30 = explainCode('program', 30);
    expect(await screen.findByText(err30.message)).toBeDefined();

    // Send button must remain disabled
    const sendBtn = screen.getByRole('button', { name: 'Send to payee' }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
    expect(mockClient.spend).not.toHaveBeenCalled();
  });

  it('handles contract or network error when checking payee', async () => {
    const failure = new Error('HostError: Error(Contract, #1)');
    mockClient.is_payee.mockRejectedValue(failure);

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Check payee' });
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));

    expect(await screen.findByText(explain(failure, 'program').message)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Send to payee' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enforces exact amount boundaries (equal is allowed, one unit above is rejected)', async () => {
    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Check payee' });
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));
    await screen.findByText('Verified — this payee can receive escrow.');

    // 1 unit above balance: 1,001 XLM (allocation is 1,000 XLM)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1,001' } });
    fireEvent.blur(screen.getByLabelText('Amount'));

    expect(await screen.findByText(/More than your balance of 1,000\.00 XLM/)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Send to payee' }) as HTMLButtonElement).disabled).toBe(true);

    // Exact boundary: 1,000 XLM
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1,000' } });
    fireEvent.blur(screen.getByLabelText('Amount'));

    await waitFor(() => {
      expect(screen.queryByText(/More than your balance/)).toBeNull();
      expect((screen.getByRole('button', { name: 'Send to payee' }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('shows error 35 when the spend window has closed', async () => {
    mockClient.spend.mockResolvedValue({
      signAndSend: vi.fn().mockRejectedValue(new Error('HostError: Error(Contract, #35)')),
    });

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Check payee' });
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));
    await screen.findByText('Verified — this payee can receive escrow.');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '200' } });
    fireEvent.blur(screen.getByLabelText('Amount'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to payee' }));

    const err35 = explainCode('program', 35);
    expect(await screen.findByText(err35.message)).toBeDefined();
    expect(screen.getByText(/program error 35/)).toBeDefined();
  });

  it('handles contract or network error on submit and allows retry', async () => {
    mockClient.spend.mockRejectedValueOnce(new Error('Network timeout during spend submission'));

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Check payee' });
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));
    await screen.findByText('Verified — this payee can receive escrow.');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    fireEvent.blur(screen.getByLabelText('Amount'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to payee' }));

    expect(await screen.findByText('Could not reach the network.')).toBeDefined();

    // Now retry succeeding
    mockClient.spend.mockResolvedValueOnce({
      signAndSend: vi.fn().mockResolvedValue({ result: { unwrap: () => 0n } }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Sent to payee')).toBeDefined();
  });

  it('executes successful spend, calls submission once with right args, and re-reads allocation', async () => {
    let currentBalance = 10_000_000_000n;
    mockClient.allocation_of.mockImplementation(() => Promise.resolve({ result: currentBalance }));

    mockClient.spend.mockResolvedValue({
      signAndSend: vi.fn().mockImplementation(async () => {
        currentBalance = 5_000_000_000n; // 500 XLM remaining
        return { result: { unwrap: () => 5_000_000_000n } };
      }),
    });

    render(
      <MemoryRouter>
        <AllocatedSpending award={makeAward()} />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Check payee' });
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));
    await screen.findByText('Verified — this payee can receive escrow.');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.blur(screen.getByLabelText('Amount'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to payee' }));

    expect(await screen.findByText('Sent to payee')).toBeDefined();
    expect(
      screen.getByText(`${formatAmount(5_000_000_000n, { asset: 'XLM' })} to ${truncateAddress(PAYEE)}`),
    ).toBeDefined();

    // Submission called once with exact arguments
    expect(mockClient.spend).toHaveBeenCalledTimes(1);
    expect(mockClient.spend).toHaveBeenCalledWith({
      recipient: RECIPIENT,
      payee: PAYEE,
      amount: 5_000_000_000n,
    });

    // Re-read occurred
    await waitFor(() => {
      expect(mockClient.allocation_of).toHaveBeenCalledTimes(2);
    });
  });

  it('supports sample programme stand-in fallback', async () => {
    const sampleAward = makeAward({
      programmeId: 'PROG-SAMPLE-ID',
      escrow: '5000000000',
    });

    render(
      <MemoryRouter>
        <AllocatedSpending award={sampleAward} sampleDelayMs={1} />
      </MemoryRouter>,
    );

    // In sample mode, valid address automatically checks as verified
    await screen.findByRole('button', { name: 'Check payee' });
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
    fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));

    expect(await screen.findByText('Verified — this payee can receive escrow.')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    fireEvent.blur(screen.getByLabelText('Amount'));
    fireEvent.click(screen.getByRole('button', { name: 'Send to payee' }));

    expect(await screen.findByText('Sent to payee')).toBeDefined();
  });
});

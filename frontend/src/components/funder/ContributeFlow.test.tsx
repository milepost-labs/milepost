import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { chainFor } from '../../fixtures/programmes';
import { explainCode } from '../../lib/errors';
import { mergeProgrammes, type DirectoryProgramme } from '../../lib/programmeView';
import { ContributeFlow } from './ContributeFlow';

const mocks = vi.hoisted(() => ({
  announce: vi.fn(),
  getPhase: vi.fn(),
  contribute: vi.fn(),
  signTransaction: vi.fn(),
  // The balance the contribute flow is told about. `ready` with the figure is
  // the normal case; tests switch it to fail or to load.
  balance: { value: 52_500_000_000n as bigint | null, status: 'ready' as string, refetch: () => {} },
}));

vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));
vi.mock('../../context/useWallet', () => ({
  useWallet: () => ({
    address: 'GDONOR',
    status: 'connected',
    signTransaction: mocks.signTransaction,
  }),
}));
vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: () => ({ get_phase: mocks.getPhase, contribute: mocks.contribute }),
  }),
}));
// The token-contract read has its own tests; here the flow only needs the result.
vi.mock('../../hooks/useProgrammeBalance', () => ({
  useProgrammeBalance: () => mocks.balance,
}));

const SCHOOL = 'CBJWECZ3EUVNAE73YIMT2KWWNRHRF7NNWVKOLQRVOHSKYRYE32XBRPW7';
const SMALLHOLDER = 'CB7WB66VLFJUD2WHZYHQF7PHM72THVJYMLZ7YPW2XQKUOUUGKVTWVDXI';
const VOCATIONAL = 'CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C';
const REAL = 'CREALPROGRAMMEONTESTNET';

const real: DirectoryProgramme = {
  id: REAL,
  name: 'Real testnet programme',
  creator: null,
  createdLedger: 1,
  sample: false,
  chain: { ...chainFor(SCHOOL), phase: 'Open' },
};

const phaseRead = (tag: string) => ({ result: { unwrap: () => ({ tag }) } });

function renderFlow(options: { linked?: string; withReal?: boolean } = {}) {
  const programmes = [...(options.withReal ? [real] : []), ...mergeProgrammes([])];
  return render(
    <MemoryRouter>
      <ContributeFlow
        programmes={programmes}
        linkedProgrammeId={options.linked ?? null}
        sampleDelayMs={0}
      />
    </MemoryRouter>,
  );
}

// Each test starts from a read balance; a test that needs otherwise sets it itself.
beforeEach(() => {
  mocks.balance.value = 52_500_000_000n;
  mocks.balance.status = 'ready';
});

const amountInput = () => screen.getByLabelText('Amount');

function enterAmount(value: string) {
  fireEvent.change(amountInput(), { target: { value } });
  fireEvent.blur(amountInput());
}

const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
const continueButton = () => screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;

async function toConfirm(programme: string, amount = '100') {
  pick(programme);
  enterAmount(amount);
  fireEvent.click(continueButton());
  await screen.findByText(/the programme is Open\./);
}

describe('ContributeFlow — amount step', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers only Open programmes', () => {
    renderFlow();
    const options = screen.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent);
    expect(options).toEqual(['Community resilience grants 2026', 'Smallholder inputs, long rains']);
  });

  it('refuses an amount above the balance before anything is signed', () => {
    renderFlow();
    enterAmount('6,000');
    expect(screen.getByRole('alert').textContent).toMatch(/More than your balance of 5,250/);
    expect(continueButton().disabled).toBe(true);
    expect(mocks.signTransaction).not.toHaveBeenCalled();
  });

  it('shows the balance read from the programme asset', () => {
    renderFlow();
    expect(screen.getByText('Balance 5,250.00 USDC')).toBeTruthy();
  });

  it('says the balance is unavailable and does not cap an amount when the read fails', () => {
    mocks.balance.value = null;
    mocks.balance.status = 'unavailable';
    renderFlow();
    enterAmount('6,000');
    expect(screen.getByText('Balance unavailable')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(continueButton().disabled).toBe(false);
  });

  it('shows the fee as deducted from the contribution, not added to it', () => {
    renderFlow();
    enterAmount('1,000');
    expect(screen.getByText(/Protocol fee \(1%\), taken from your contribution/)).toBeTruthy();
    expect(screen.getByText('− 10 USDC')).toBeTruthy();
    expect(screen.getByText('990 USDC')).toBeTruthy();
    expect(screen.queryByText('1,010 USDC')).toBeNull();
  });

  it('disables contributing to a linked programme outside Open and names the phase', () => {
    renderFlow({ linked: VOCATIONAL });
    enterAmount('100');
    expect(screen.getByRole('note').textContent).toContain(
      'Available only while the programme is Open. This programme is Review.',
    );
    expect(continueButton().disabled).toBe(true);
  });

  it('preselects a linked Open programme', () => {
    renderFlow({ linked: SMALLHOLDER });
    expect((screen.getByRole('radio', { name: 'Smallholder inputs, long rains' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });
});

describe('ContributeFlow — confirm, receipt and failure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('confirms a contribution and shows the receipt, announced politely', async () => {
    renderFlow();
    await toConfirm('Community resilience grants 2026');
    expect(screen.getByText('Sample chain read: the programme is Open.')).toBeTruthy();
    expect(screen.getByText('100 USDC')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(await screen.findByText('Contribution confirmed')).toBeTruthy();
    expect(screen.getByText('4,853,391')).toBeTruthy();
    expect(screen.getByText(/Your money stays locked in the programme/)).toBeTruthy();
    await waitFor(() =>
      expect(mocks.announce).toHaveBeenCalledWith(
        'Contribution of 100 USDC to Community resilience grants 2026 confirmed.',
      ),
    );
  });

  it('shows a contract refusal through the error panel, says nothing moved, and announces it', async () => {
    renderFlow();
    await toConfirm('Smallholder inputs, long rains');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(await screen.findByText("Contribution didn't go through")).toBeTruthy();
    expect(screen.getByText(explainCode('program', 2).message)).toBeTruthy();
    expect(screen.getByText('Nothing was transferred · program error 2')).toBeTruthy();
    await waitFor(() =>
      expect(mocks.announce).toHaveBeenCalledWith(expect.stringMatching(/Nothing was transferred\.$/), 'alert'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Confirm and sign' })).toBeTruthy();
  });

  it('re-reads the phase on-chain right before signing and refuses if it has left Open', async () => {
    mocks.getPhase.mockResolvedValueOnce(phaseRead('Open')).mockResolvedValueOnce(phaseRead('Review'));
    renderFlow({ withReal: true });
    await toConfirm('Real testnet programme');
    expect(screen.getByText('Checked on-chain just now: the programme is Open.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(await screen.findByText('Nothing was transferred · program error 2')).toBeTruthy();
    expect(mocks.getPhase).toHaveBeenCalledTimes(2);
    expect(mocks.contribute).not.toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringMatching(/Nothing was transferred\.$/), 'alert');
  });

  it('signs a real contribution and reads the receipt from the sent transaction', async () => {
    mocks.getPhase.mockResolvedValue(phaseRead('Open'));
    const signAndSend = vi.fn(async () => ({
      result: { unwrap: () => undefined },
      sendTransactionResponse: { hash: 'ab'.repeat(32) },
      getTransactionResponse: { ledger: 5_000_123 },
    }));
    mocks.contribute.mockResolvedValue({ signAndSend });
    renderFlow({ withReal: true });
    await toConfirm('Real testnet programme', '250');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(await screen.findByText('Contribution confirmed')).toBeTruthy();
    expect(mocks.contribute).toHaveBeenCalledWith({ donor: 'GDONOR', amount: 2_500_000_000n });
    expect(signAndSend).toHaveBeenCalledWith({ signTransaction: mocks.signTransaction });
    expect(screen.getByText('5,000,123')).toBeTruthy();
    expect(screen.queryByText('Sample receipt for the design phase.')).toBeNull();
  });

  it('does not claim nothing moved when the failure is not a contract refusal', async () => {
    mocks.getPhase.mockResolvedValue(phaseRead('Open'));
    mocks.contribute.mockResolvedValue({
      signAndSend: vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    });
    renderFlow({ withReal: true });
    await toConfirm('Real testnet programme');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(await screen.findByText('Could not reach the network.')).toBeTruthy();
    expect(screen.queryByText(/Nothing was transferred/)).toBeNull();
    await waitFor(() =>
      expect(mocks.announce).toHaveBeenCalledWith(
        "Contribution didn't go through. Could not reach the network.",
        'alert',
      ),
    );
  });

  it('returns to Confirm when the signature is declined, without an error', async () => {
    mocks.getPhase.mockResolvedValue(phaseRead('Open'));
    mocks.contribute.mockResolvedValue({
      signAndSend: vi.fn(async () => {
        throw new Error('User declined access');
      }),
    });
    renderFlow({ withReal: true });
    await toConfirm('Real testnet programme');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(await screen.findByText(/You declined the signature/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm and sign' })).toBeTruthy();
    expect(screen.queryByText("Contribution didn't go through")).toBeNull();
  });
});

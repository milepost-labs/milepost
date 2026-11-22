import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { chainFor } from '../../fixtures/programmes';
import { explainCode } from '../../lib/errors';
import { mergeProgrammes, type DirectoryProgramme } from '../../lib/programmeView';
import { ContributeSheet } from './ContributeSheet';

const mocks = vi.hoisted(() => ({
  announce: vi.fn(),
  getPhase: vi.fn(),
  contribute: vi.fn(),
  getConfig: vi.fn(),
  totalContributed: vi.fn(),
  signTransaction: vi.fn(),
  // The balance the contribute flow is told about. `ready` with the figure is
  // the normal case; tests switch it to fail or to load.
  balance: { balance: 52_500_000_000n as bigint | null, status: 'ready' as string, refetch: () => {} },
}));

vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => mocks.announce }));

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
    address: 'GDONOR',
    status: 'connected',
    signTransaction: mocks.signTransaction,
  }),
}));
vi.mock('../../context/useSoroban', () => {
  // Built once: reads key on the clients, and the real context is memoized.
  const client = {
    get_phase: mocks.getPhase,
    contribute: mocks.contribute,
    get_config: mocks.getConfig,
    total_contributed: mocks.totalContributed,
  };
  const soroban = {
    programmeAt: () => client,
  };
  return { useSoroban: () => soroban, useOptionalSoroban: () => soroban };
});
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
      <ContributeSheet
        open
        onClose={() => {}}
        programmes={programmes}
        linkedProgrammeId={options.linked ?? null}
        sampleDelayMs={0}
      />
    </MemoryRouter>,
  );
}

// Each test starts from a read balance; a test that needs otherwise sets it itself.
beforeEach(() => {
  mocks.balance.balance = 52_500_000_000n;
  mocks.balance.status = 'ready';
  // A deployed programme's terms are read from its contract: a 2.5% fee, and
  // 3,000 already contributed.
  mocks.getConfig.mockResolvedValue({ result: { unwrap: () => ({ fee_bps: 250 }) } });
  mocks.totalContributed.mockResolvedValue({ result: 30_000_000_000n });
});

const amountInput = () => screen.getByLabelText('Amount');

function enterAmount(value: string) {
  fireEvent.change(amountInput(), { target: { value } });
  fireEvent.blur(amountInput());
}

const programmeSelect = () => screen.getByLabelText('Programme') as HTMLSelectElement;
const pick = (name: string) => {
  const option = Array.from(programmeSelect().options).find((o) => o.textContent === name);
  fireEvent.change(programmeSelect(), { target: { value: option!.value } });
};
const continueButton = () => screen.getByRole('button', { name: 'Review contribution' }) as HTMLButtonElement;
const signButton = () => screen.getByRole('button', { name: 'Confirm in Freighter' });

async function toConfirm(programme: string, amount = '100') {
  pick(programme);
  enterAmount(amount);
  fireEvent.click(continueButton());
  await screen.findByText(/the programme is Open\./);
}

describe('ContributeSheet — amount step', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers only Open programmes', () => {
    renderFlow();
    const options = Array.from(programmeSelect().options).map((option) => option.textContent);
    expect(options).toEqual(['Community resilience grants 2026', 'Smallholder inputs, long rains']);
    expect(screen.getByRole('dialog', { name: 'Fund this programme' })).toBeTruthy();
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
    mocks.balance.balance = null;
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

  it('works out a deployed programme from its own contract, not the stand-in figures', async () => {
    renderFlow({ withReal: true });
    pick('Real testnet programme');
    enterAmount('1,000');
    // 2.5% from get_config, in the programme's own asset.
    expect(await screen.findByText(/Protocol fee \(2.5%\)/)).toBeTruthy();
    expect(screen.getByText('− 25 XLM')).toBeTruthy();
    expect(screen.getByText('975 XLM')).toBeTruthy();
    // 1,000 of 3,000 + 1,000 contributed.
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('offers the whole balance as Max', () => {
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect((amountInput() as HTMLInputElement).value).toBe('5250');
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
    expect(programmeSelect().selectedOptions[0].textContent).toBe('Smallholder inputs, long rains');
  });
});

describe('ContributeSheet — confirm, receipt and failure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('confirms a contribution and shows the receipt, announced politely', async () => {
    renderFlow();
    await toConfirm('Community resilience grants 2026');
    expect(screen.getByText('Sample chain read: the programme is Open.')).toBeTruthy();
    expect(screen.getByText('100 USDC')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeTruthy();

    fireEvent.click(signButton());

    expect(await screen.findByText('Contribution confirmed')).toBeTruthy();
    expect(screen.getByText('4,853,391')).toBeTruthy();
    expect(screen.getByText(/Your money stays locked in the programme/)).toBeTruthy();
    expect(screen.getByText('Sample receipt')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Receipt' })).toBeTruthy();
    // A sample hash is a fixture, so it must not point at the explorer.
    expect(screen.queryByRole('link', { name: /view on explorer/i })).toBeNull();
    await waitFor(() =>
      expect(mocks.announce).toHaveBeenCalledWith(
        'Contribution of 100 USDC to Community resilience grants 2026 confirmed.',
      ),
    );
  });

  it('shows a contract refusal through the error panel, says nothing moved, and announces it', async () => {
    renderFlow();
    await toConfirm('Smallholder inputs, long rains');
    fireEvent.click(signButton());

    expect(await screen.findByText("Contribution didn't go through")).toBeTruthy();
    expect(screen.getByText(explainCode('program', 2).message)).toBeTruthy();
    expect(screen.getByText('Nothing was transferred · program error 2')).toBeTruthy();
    await waitFor(() =>
      expect(mocks.announce).toHaveBeenCalledWith(expect.stringMatching(/Nothing was transferred\.$/), 'alert'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Confirm in Freighter' })).toBeTruthy();
  });

  it('re-reads the phase on-chain right before signing and refuses if it has left Open', async () => {
    mocks.getPhase.mockResolvedValueOnce(phaseRead('Open')).mockResolvedValueOnce(phaseRead('Review'));
    renderFlow({ withReal: true });
    await toConfirm('Real testnet programme');
    expect(screen.getByText('Checked on-chain just now: the programme is Open.')).toBeTruthy();

    fireEvent.click(signButton());

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

    fireEvent.click(signButton());

    expect(await screen.findByText('Contribution confirmed')).toBeTruthy();
    expect(mocks.contribute).toHaveBeenCalledWith({ donor: 'GDONOR', amount: 2_500_000_000n });
    expect(signAndSend).toHaveBeenCalledWith({ signTransaction: mocks.signTransaction });
    expect(screen.getByText('5,000,123')).toBeTruthy();
    expect(screen.queryByText('Sample receipt')).toBeNull();
    expect(screen.getByRole('link', { name: 'Receipt lookup' }).getAttribute('href')).toBe(`/funders/receipt?hash=${'ab'.repeat(32)}`);

    const explorer = screen.getByRole('link', { name: /view on explorer.*new tab/i });
    expect(explorer.getAttribute('href')).toBe(`https://stellar.expert/explorer/testnet/tx/${'ab'.repeat(32)}`);
    expect(explorer.getAttribute('target')).toBe('_blank');
    expect(explorer.getAttribute('rel')).toContain('noopener');
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
    fireEvent.click(signButton());

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
    fireEvent.click(signButton());

    expect(await screen.findByText(/You declined the signature/)).toBeTruthy();
    expect(signButton()).toBeTruthy();
    expect(screen.queryByText("Contribution didn't go through")).toBeNull();
  });
});

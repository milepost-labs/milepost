import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AwardCard } from './AwardCard';
import { ApplyForm } from './ApplyForm';
import { ApplicationTimelineList } from './ApplicationTimelineList';
import type { RecipientAwardFixture, RecipientApplicationFixture } from '../../fixtures/recipientFixtures';
import { explain, explainCode } from '../../lib/errors';

// Mock useAnnouncer so we can assert on announcements
const mockAnnounce = vi.fn();
vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => mockAnnounce,
}));

// --- Wallet + Soroban mocks for the Allocated spend flow --------------------
// AwardCard renders AllocatedSpending for Allocated awards, which reads
// allocation_of / is_payee / get_phase and sends spend. Only Allocated awards
// invoke these; the other mode and tranche tests are unaffected.

const RECIPIENT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PAYEE = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const REAL_PROGRAMME = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const walletMocks = vi.hoisted(() => ({
  address: RECIPIENT as string | null,
  connect: vi.fn(),
  signTransaction: vi.fn(),
}));

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

function makeProgramme(opts: {
  allocation?: bigint;
  phase?: string;
  isPayee?: (addr: string) => boolean;
  finalized?: boolean;
  withdrawn?: boolean;
} = {}) {
  const allocation = opts.allocation ?? 10_000_000_000n; // 1,000 USDC
  const application = { finalized: opts.finalized ?? false, withdrawn: opts.withdrawn ?? false };
  return {
    allocation_of: vi.fn(async () => ({ result: allocation })),
    is_payee: vi.fn(async ({ payee }: { payee: string }) => ({
      result: opts.isPayee ? opts.isPayee(payee) : true,
    })),
    get_phase: vi.fn(async () => ({
      result: { unwrap: () => ({ tag: opts.phase ?? 'Settled' }) },
    })),
    spend: vi.fn(),
    get_application: vi.fn(async () => ({
      result: { unwrap: () => application },
    })),
    withdraw: vi.fn(),
  };
}

let programme = makeProgramme();

vi.mock('../../context/useSoroban', () => ({
  useSoroban: () => ({ programmeAt: () => programme }),
}));

describe('Recipient Issues Suite (#272, #273, #274, #275)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletMocks.address = RECIPIENT;
    programme = makeProgramme();
  });

  describe('Issue #272 — Recipient: awards and tranche release', () => {
    const baseAward: RecipientAwardFixture = {
      programmeId: 'PROG-TEST-272',
      programmeName: 'Secondary School Bursaries 2026',
      recipient: 'GD4KQ2…2QXW',
      granted: '30000000000', // 3,000 USDC
      released: '10000000000', // 1,000 USDC
      tranches: 3,
      tranchesReleased: 1,
      payee: null,
      mode: 'Restricted',
      updatedLedger: 4851002,
      attestationReady: true,
      condition: 'Milestone 2 completed and verified',
    };

    it('renders tranche tiles distinguishing released, proof-received, and locked', () => {
      render(
        <MemoryRouter>
          <AwardCard award={baseAward} />
        </MemoryRouter>
      );

      // Tranche 1 should be released
      expect(screen.getByText('Tranche 1')).toBeDefined();
      expect(screen.getByText('Released')).toBeDefined();

      // Tranche 2 should be proof received (attestationReady: true)
      expect(screen.getByText('Tranche 2')).toBeDefined();
      expect(screen.getByText('Proof received')).toBeDefined();

      // Tranche 3 should be locked
      expect(screen.getByText('Tranche 3')).toBeDefined();
      expect(screen.getByText('Locked')).toBeDefined();
    });

    it('distinguishes waiting-on-verifier from locked when proof is not ready', () => {
      const waitingAward: RecipientAwardFixture = {
        ...baseAward,
        attestationReady: false,
      };

      render(
        <MemoryRouter>
          <AwardCard award={waitingAward} />
        </MemoryRouter>
      );

      expect(screen.getByText('Waiting on verifier')).toBeDefined();
      expect(screen.getByText(/Waiting on your verifier/i)).toBeDefined();
      expect(screen.getByText('Locked')).toBeDefined();
    });

    it('announces successful tranche release', async () => {
      vi.useFakeTimers();

      render(
        <MemoryRouter>
          <AwardCard award={baseAward} />
        </MemoryRouter>
      );

      const releaseBtn = screen.getByRole('button', { name: /release tranche/i });
      fireEvent.click(releaseBtn);

      expect(screen.getByText(/releasing… waiting for the network/i)).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1300);
      });

      expect(mockAnnounce).toHaveBeenCalledWith('Tranche 2 released.');
      vi.useRealTimers();
    });

    it('handles already-used error (error 22) through explain() and announces failure', () => {
      vi.useFakeTimers();

      render(
        <MemoryRouter>
          <AwardCard award={baseAward} simulateAlreadyUsedError={true} />
        </MemoryRouter>
      );

      const releaseBtn = screen.getByRole('button', { name: /release tranche/i });
      fireEvent.click(releaseBtn);

      act(() => {
        vi.advanceTimersByTime(1300);
      });

      const errExplain = explain(22, 'program');
      expect(screen.getByText(errExplain.message)).toBeDefined();
      expect(screen.getByText(/program error 22/i)).toBeDefined();
      expect(mockAnnounce).toHaveBeenCalledWith(
        'Tranche not released: proof already used.',
        'alert'
      );

      vi.useRealTimers();
    });
  });

  describe('Issue #273 — Recipient: mode-specific spending', () => {
    const realAllocatedAward: RecipientAwardFixture = {
      programmeId: REAL_PROGRAMME,
      programmeName: 'Vocational Grants',
      recipient: RECIPIENT,
      granted: '30000000000',
      released: '10000000000',
      tranches: 3,
      tranchesReleased: 1,
      payee: null,
      mode: 'Allocated',
      updatedLedger: 4851002,
      attestationReady: false,
      condition: 'Monthly training verified',
      escrow: '10000000000',
    };

    const sampleAllocatedAward: RecipientAwardFixture = {
      ...realAllocatedAward,
      programmeId: 'PROG-ALLOCATED-SAMPLE',
    };

    it('Allocated sample shows the escrow, a Sample data tag, and a stand-in form', async () => {
      render(
        <MemoryRouter>
          <AwardCard award={sampleAllocatedAward} />
        </MemoryRouter>
      );

      expect(await screen.findByText('Sample data')).toBeDefined();
      expect(screen.getByText(/Held for you in escrow/i)).toBeDefined();
      expect(screen.getByLabelText('Payee address')).toBeDefined();
    });

    it('Allocated real: sends escrow to a verified payee, re-reads the allocation, and names the payee and amount', async () => {
      programme = makeProgramme({ allocation: 10_000_000_000n, isPayee: (a) => a === PAYEE });
      programme.spend.mockResolvedValue({
        signAndSend: vi.fn(async () => ({ result: { unwrap: () => 0n } })),
      });

      render(
        <MemoryRouter>
          <AwardCard award={realAllocatedAward} />
        </MemoryRouter>
      );

      await screen.findByRole('button', { name: 'Check payee' });

      fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
      fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));
      expect(await screen.findByText(/Verified — this payee can receive escrow/)).toBeDefined();

      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
      fireEvent.blur(screen.getByLabelText('Amount'));
      fireEvent.click(screen.getByRole('button', { name: 'Send to payee' }));

      expect(await screen.findByText('Sent to payee')).toBeDefined();
      expect(screen.getByText(/100\.00 USDC to GBBBBB/)).toBeDefined();
      await waitFor(() => expect(programme.allocation_of).toHaveBeenCalledTimes(2));
      expect(programme.spend).toHaveBeenCalledWith({
        recipient: RECIPIENT,
        payee: PAYEE,
        amount: 1_000_000_000n,
      });
    });

    it('Allocated real: refuses an unverified payee inline before signing', async () => {
      programme = makeProgramme({ isPayee: () => false });

      render(
        <MemoryRouter>
          <AwardCard award={realAllocatedAward} />
        </MemoryRouter>
      );

      await screen.findByRole('button', { name: 'Check payee' });
      fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
      fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));

      const err30 = explainCode('program', 30);
      expect(await screen.findByText(err30.message)).toBeDefined();
      expect(screen.getByText(/program error 30/)).toBeDefined();
      expect((screen.getByRole('button', { name: 'Send to payee' }) as HTMLButtonElement).disabled).toBe(true);
      expect(programme.spend).not.toHaveBeenCalled();
    });

    it('Allocated real: refuses an amount above the allocation inline', async () => {
      programme = makeProgramme({ allocation: 10_000_000_000n, isPayee: () => true });

      render(
        <MemoryRouter>
          <AwardCard award={realAllocatedAward} />
        </MemoryRouter>
      );

      await screen.findByRole('button', { name: 'Check payee' });
      fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
      fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));
      await screen.findByText(/Verified — this payee can receive escrow/);

      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2,000' } });
      fireEvent.blur(screen.getByLabelText('Amount'));

      expect(await screen.findByText(/More than your balance of 1,000\.00 USDC/)).toBeDefined();
      expect((screen.getByRole('button', { name: 'Send to payee' }) as HTMLButtonElement).disabled).toBe(true);
      expect(programme.spend).not.toHaveBeenCalled();
    });

    it('Allocated real: shows the sweep-window error (35) through explain()', async () => {
      programme = makeProgramme({ isPayee: () => true });
      programme.spend.mockResolvedValue({
        signAndSend: vi.fn(async () => {
          throw new Error('Error(Contract, #35)');
        }),
      });

      render(
        <MemoryRouter>
          <AwardCard award={realAllocatedAward} />
        </MemoryRouter>
      );

      await screen.findByRole('button', { name: 'Check payee' });
      fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: PAYEE } });
      fireEvent.click(screen.getByRole('button', { name: 'Check payee' }));
      await screen.findByText(/Verified — this payee can receive escrow/);

      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
      fireEvent.blur(screen.getByLabelText('Amount'));
      fireEvent.click(screen.getByRole('button', { name: 'Send to payee' }));

      const err35 = explainCode('program', 35);
      expect(await screen.findByText(err35.message)).toBeDefined();
      expect(screen.getByText(/program error 35/)).toBeDefined();
      expect(programme.spend).toHaveBeenCalled();
    });

    it('Restricted mode explains that the policy constrains one signer, not the wallet', () => {
      const restrictedAward: RecipientAwardFixture = {
        programmeId: 'PROG-RESTRICTED',
        programmeName: 'SME Microgrants',
        recipient: 'GD4KQ2…2QXW',
        granted: '40000000000',
        released: '13300000000',
        tranches: 3,
        tranchesReleased: 1,
        payee: null,
        mode: 'Restricted',
        updatedLedger: 4640021,
        attestationReady: false,
        condition: 'Milestone 2 approved',
      };

      render(
        <MemoryRouter>
          <AwardCard award={restrictedAward} />
        </MemoryRouter>
      );

      expect(screen.getByText(/constrains one signer, not the wallet/i)).toBeDefined();
      const policyLink = screen.getByRole('link', { name: /check your spend policy/i });
      expect(policyLink.getAttribute('href')).toBe('/policy');
    });

    it('Direct and Open modes do not ask recipient to choose payees', () => {
      const directAward: RecipientAwardFixture = {
        programmeId: 'PROG-DIRECT',
        programmeName: 'Direct Training Stipends',
        recipient: 'GD4KQ2…2QXW',
        granted: '20000000000',
        released: '20000000000',
        tranches: 2,
        tranchesReleased: 2,
        payee: 'GCPAY1…Q2LM',
        mode: 'Direct',
        updatedLedger: 4712000,
        attestationReady: false,
        condition: 'Graduation certificate verified',
      };

      const { rerender } = render(
        <MemoryRouter>
          <AwardCard award={directAward} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Paid directly to payee/i)).toBeDefined();
      expect(screen.queryByRole('button', { name: /send to payee/i })).toBeNull();

      const openAward: RecipientAwardFixture = {
        ...directAward,
        mode: 'Open',
      };

      rerender(
        <MemoryRouter>
          <AwardCard award={openAward} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Paid directly to your wallet/i)).toBeDefined();
      expect(screen.queryByRole('button', { name: /send to payee/i })).toBeNull();
    });
  });

  describe('Issue #274 — Recipient: apply for funding', () => {
    it('offers only Open programmes and pre-selects via prop or search param', () => {
      render(
        <MemoryRouter initialEntries={['/recipients?programme=CBMICRO2026']}>
          <ApplyForm />
        </MemoryRouter>
      );

      // Should show the title
      expect(screen.getByText('Apply for an award')).toBeDefined();

      // Only Open programmes should be listed in the radio group
      expect(screen.getByText(/Community resilience grants 2026/i)).toBeDefined();
      expect(screen.getByText(/Smallholder inputs, long rains/i)).toBeDefined();
      // SME supplier microgrants Q2 is in Settled phase, and Vocational bursaries is in Review, so neither should be listed
      expect(screen.queryByText(/Workforce skills grants, cohort 3/i)).toBeNull();
    });

    it('explains the median rule before submitting', () => {
      render(
        <MemoryRouter>
          <ApplyForm />
        </MemoryRouter>
      );

      expect(
        screen.getByText(
          /Reviewers can approve up to this amount, not more\. Your award is the middle of their votes\./i
        )
      ).toBeDefined();
    });

    it('validates amount input and enables submit when valid', async () => {
      vi.useFakeTimers();

      render(
        <MemoryRouter>
          <ApplyForm />
        </MemoryRouter>
      );

      const input = screen.getByPlaceholderText('0');
      const submitBtn = screen.getByRole('button', { name: /submit application/i }) as HTMLButtonElement;

      expect(submitBtn.disabled).toBe(true);

      // Type an invalid amount (0)
      fireEvent.change(input, { target: { value: '0' } });
      const err3 = explain(3, 'program');
      expect(screen.getByText(err3.message)).toBeDefined();
      expect(submitBtn.disabled).toBe(true);

      // Type a valid amount
      fireEvent.change(input, { target: { value: '1500' } });
      expect(submitBtn.disabled).toBe(false);

      fireEvent.click(submitBtn);

      expect(screen.getByText(/Submitting your application…/i)).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(1300);
      });

      expect(screen.getByText(/✓ Application submitted/i)).toBeDefined();
      expect(mockAnnounce).toHaveBeenCalledWith('Application submitted.');

      vi.useRealTimers();
    });
  });

  describe('Issue #275 — Recipient: application timeline', () => {
    it('renders timeline stages and caps quorum at 16', () => {
      const mockApplications: RecipientApplicationFixture[] = [
        {
          programmeId: 'PROG-TIMELINE-1',
          programmeName: 'Vocational Training Stipends Q3',
          phase: 'Review',
          requested: '12000000000', // 1,200 USDC
          submittedAt: 1774000000,
          votes: ['12000000000', '9000000000'],
          quorum: 20, // Greater than 16 to test quorum cap!
        },
      ];

      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={mockApplications} />
        </MemoryRouter>
      );

      // Quorum capped at 16: "2 of 16 reviewer votes in"
      expect(screen.getByText('2 of 16 reviewer votes in.')).toBeDefined();

      // Stages
      expect(screen.getByText('Applied')).toBeDefined();
      expect(screen.getAllByText('Review').length).toBeGreaterThan(0);
      expect(screen.getByText('Award set')).toBeDefined();
      expect(screen.getByText('Tranches')).toBeDefined();
    });

    it('emphasizes current Review stage with Now and explains median rule on Award set', () => {
      const mockApplications: RecipientApplicationFixture[] = [
        {
          programmeId: 'PROG-TIMELINE-2',
          programmeName: 'School Bursaries',
          phase: 'Review',
          requested: '5000000000',
          submittedAt: 1778000000,
          votes: ['5000000000'],
          quorum: 3,
        },
      ];

      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={mockApplications} />
        </MemoryRouter>
      );

      // Emphasized tag "Now" for Review phase
      expect(screen.getByText('· Now')).toBeDefined();

      // Median rule explanation
      expect(
        screen.getByText(/The award will be the median, not the lowest or the average\./i)
      ).toBeDefined();
    });

    it('says a finalised application carries the median award', () => {
      const mockApplications: RecipientApplicationFixture[] = [
        {
          programmeId: 'PROG-TIMELINE-3',
          programmeName: 'Vocational Training Stipends Q3',
          phase: 'Settled',
          requested: '12000000000',
          submittedAt: 1774000000,
          votes: ['9000000000', '12000000000'],
          quorum: 3,
          finalized: true,
        },
      ];

      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={mockApplications} />
        </MemoryRouter>
      );

      expect(
        screen.getByText(
          'Finalised — your award is 1,050.00 USDC, the median of 2 reviewer votes.'
        )
      ).toBeDefined();
      expect(screen.getByText('Median of the votes: 1,050.00 USDC')).toBeDefined();
    });

    it('says a withdrawn application will not be reviewed or finalised', () => {
      const mockApplications: RecipientApplicationFixture[] = [
        {
          programmeId: 'PROG-TIMELINE-4',
          programmeName: 'School Bursaries',
          phase: 'Review',
          requested: '5000000000',
          submittedAt: 1778000000,
          votes: ['5000000000'],
          quorum: 3,
          withdrawn: true,
        },
      ];

      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={mockApplications} />
        </MemoryRouter>
      );

      expect(
        screen.getByText(
          'Withdrawn — you cancelled this application, so it will not be reviewed or finalised.'
        )
      ).toBeDefined();
      expect(screen.getByText('No award will be set.')).toBeDefined();
    });

    it('shows an empty state — not a failure — when there are no applications', () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[]} />
        </MemoryRouter>
      );

      expect(screen.getByText('No applications submitted yet.')).toBeDefined();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('tags a sample application as sample data', () => {
      const mockApplications: RecipientApplicationFixture[] = [
        {
          programmeId: 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC',
          programmeName: 'Vocational Training Stipends Q3',
          phase: 'Review',
          requested: '12000000000',
          submittedAt: 1774000000,
          votes: ['12000000000'],
          quorum: 5,
          sample: true,
        },
      ];

      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={mockApplications} />
        </MemoryRouter>
      );

      expect(screen.getByText('Sample data')).toBeDefined();
    });
  });
});

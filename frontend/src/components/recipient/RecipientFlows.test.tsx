import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AwardCard } from './AwardCard';
import { ApplyForm } from './ApplyForm';
import { ApplicationTimelineList } from './ApplicationTimelineList';
import type { RecipientAwardFixture, RecipientApplicationFixture } from '../../fixtures/recipientFixtures';
import { explain } from '../../lib/errors';

// Mock useAnnouncer so we can assert on announcements
const mockAnnounce = vi.fn();
vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => mockAnnounce,
}));

describe('Recipient Issues Suite (#272, #273, #274, #275)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it('Allocated mode displays escrow and limits payee selection to verified payees', () => {
      const allocatedAward: RecipientAwardFixture = {
        programmeId: 'PROG-ALLOCATED',
        programmeName: 'Vocational Grants',
        recipient: 'GD4KQ2…2QXW',
        granted: '30000000000',
        released: '10000000000',
        tranches: 3,
        tranchesReleased: 1,
        payee: null,
        mode: 'Allocated',
        updatedLedger: 4851002,
        attestationReady: false,
        condition: 'Monthly training verified',
        escrow: '10000000000', // 1,000 USDC in escrow
      };

      const customPayees = [
        { address: 'GCPAY_PHARMACY_111', label: 'Verified payee · Pharmacy' },
        { address: 'GCPAY_TRANSPORT_222', label: 'Verified payee · Transport co-op' },
      ];

      render(
        <MemoryRouter>
          <AwardCard award={allocatedAward} payees={customPayees} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Held for you in escrow/i)).toBeDefined();
      expect(screen.getByText('Verified payee · Pharmacy')).toBeDefined();
      expect(screen.getByText('Verified payee · Transport co-op')).toBeDefined();

      const sendBtn = screen.getByRole('button', { name: /send to payee/i });
      fireEvent.click(sendBtn);

      expect(screen.getByText(/Sent to Pharmacy/i)).toBeDefined();
      expect(mockAnnounce).toHaveBeenCalledWith('Payment sent from escrow to the verified payee.');
    });

    it('Allocated mode handles unverified payee error (error 30) through explain()', () => {
      const allocatedAward: RecipientAwardFixture = {
        programmeId: 'PROG-ALLOCATED-ERR',
        programmeName: 'Vocational Grants',
        recipient: 'GD4KQ2…2QXW',
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

      render(
        <MemoryRouter>
          <AwardCard award={allocatedAward} simulateUnverifiedPayeeError={true} />
        </MemoryRouter>
      );

      const sendBtn = screen.getByRole('button', { name: /send to payee/i });
      fireEvent.click(sendBtn);

      const err30 = explain(30, 'program');
      expect(screen.getByText(err30.message)).toBeDefined();
      expect(screen.getByText(/program error 30/i)).toBeDefined();
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
          submittedLedger: 4704410,
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
      expect(screen.getByText('2 of 16 reviewer votes in')).toBeDefined();

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
          submittedLedger: 4818330,
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
  });
});

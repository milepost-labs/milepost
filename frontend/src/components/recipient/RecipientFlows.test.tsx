import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
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
    // A fixture (non-contract) award id — uses the sample stand-in path.
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

    // A real (contract-address) award for on-chain release tests.
    const realAward: RecipientAwardFixture = {
      ...baseAward,
      programmeId: REAL_PROGRAMME,
      recipient: RECIPIENT,
    };

    const ATTEST_HEX = 'a'.repeat(64); // valid 64-char hex
    const ATTESTER = 'G' + 'B'.repeat(55);

    it('renders tranche tiles distinguishing released, proof-received, and locked', () => {
      render(
        <MemoryRouter>
          <AwardCard award={baseAward} />
        </MemoryRouter>
      );

      expect(screen.getByText('Tranche 1')).toBeDefined();
      expect(screen.getByText('Released')).toBeDefined();
      expect(screen.getByText('Tranche 2')).toBeDefined();
      expect(screen.getByText('Proof received')).toBeDefined();
      expect(screen.getByText('Tranche 3')).toBeDefined();
      expect(screen.getByText('Locked')).toBeDefined();
    });

    it('distinguishes waiting-on-verifier from locked when proof is not ready', () => {
      const waitingAward: RecipientAwardFixture = { ...baseAward, attestationReady: false };
      render(
        <MemoryRouter>
          <AwardCard award={waitingAward} />
        </MemoryRouter>
      );
      expect(screen.getByText('Waiting on verifier')).toBeDefined();
      expect(screen.getByText(/Waiting on your verifier/i)).toBeDefined();
      expect(screen.getByText('Locked')).toBeDefined();
    });

    it('sample: announces successful tranche release', async () => {
      render(
        <MemoryRouter>
          <AwardCard award={baseAward} sampleDelayMs={0} />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /release tranche/i }));
      expect(await screen.findByText(/Tranche 2 released/i)).toBeDefined();
      expect(mockAnnounce).toHaveBeenCalledWith('Tranche 2 released.');
    });

    it('real: sends program.release with attestation Buffer and attester address', async () => {
      programme = makeProgramme({ releaseResult: 'ok' });

      render(
        <MemoryRouter>
          <AwardCard award={realAward} sampleDelayMs={0} />
        </MemoryRouter>
      );

      // Open the release form.
      fireEvent.click(screen.getByRole('button', { name: /release tranche/i }));

      // Fill in attestation UID and attester.
      fireEvent.change(screen.getByLabelText(/attestation uid/i), {
        target: { value: ATTEST_HEX },
      });
      fireEvent.change(screen.getByLabelText(/attester address/i), {
        target: { value: ATTESTER },
      });

      // "Where this goes" confirmation is shown before signing.
      expect(screen.getByText(/Where this goes:/i)).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: /sign and release/i }));

      expect(await screen.findByText(/Tranche 2 released/i)).toBeDefined();
      expect(programme.release).toHaveBeenCalledWith({
        recipient: RECIPIENT,
        attestation: expect.any(Buffer),
        attester: ATTESTER,
      });
      const { attestation } = programme.release.mock.calls[0][0] as { attestation: Buffer };
      expect(attestation).toHaveLength(32);
      expect(mockAnnounce).toHaveBeenCalledWith('Tranche 2 released.');
    });

    it('real error 22 (AttestationAlreadyUsed): shows the specific explanation', async () => {
      programme = makeProgramme({ releaseResult: 'alreadyUsed' });

      render(
        <MemoryRouter>
          <AwardCard award={realAward} sampleDelayMs={0} />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /release tranche/i }));
      fireEvent.change(screen.getByLabelText(/attestation uid/i), {
        target: { value: ATTEST_HEX },
      });
      fireEvent.change(screen.getByLabelText(/attester address/i), {
        target: { value: ATTESTER },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign and release/i }));

      const err22 = explainCode('program', 22);
      expect(await screen.findByText(err22.message)).toBeDefined();
      expect(screen.queryByText(/something went wrong that we do not have/i)).toBeNull();
    });

    it('real error 21 (AttestationInvalid / non-verifier): shows the specific explanation', async () => {
      programme = makeProgramme({ releaseResult: 'invalidAttestation' });

      render(
        <MemoryRouter>
          <AwardCard award={realAward} sampleDelayMs={0} />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /release tranche/i }));
      fireEvent.change(screen.getByLabelText(/attestation uid/i), {
        target: { value: ATTEST_HEX },
      });
      fireEvent.change(screen.getByLabelText(/attester address/i), {
        target: { value: ATTESTER },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign and release/i }));

      const err21 = explainCode('program', 21);
      expect(await screen.findByText(err21.message)).toBeDefined();
    });

    it('real error 34 (PolicyNotInstalled): shows the specific explanation for Restricted', async () => {
      programme = makeProgramme({ releaseResult: 'policyNotInstalled' });
      const restrictedAward: RecipientAwardFixture = {
        ...realAward,
        mode: 'Restricted',
      };

      render(
        <MemoryRouter>
          <AwardCard award={restrictedAward} sampleDelayMs={0} />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: /release tranche/i }));
      fireEvent.change(screen.getByLabelText(/attestation uid/i), {
        target: { value: ATTEST_HEX },
      });
      fireEvent.change(screen.getByLabelText(/attester address/i), {
        target: { value: ATTESTER },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign and release/i }));

      const err34 = explainCode('program', 34);
      expect(await screen.findByText(err34.message)).toBeDefined();
    });

    it('shows where the money goes before signing for each mode', () => {
      const modes: Array<RecipientAwardFixture['mode']> = ['Direct', 'Allocated', 'Restricted', 'Open'];
      for (const mode of modes) {
        const { unmount } = render(
          <MemoryRouter>
            <AwardCard award={{ ...realAward, mode }} sampleDelayMs={0} />
          </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('button', { name: /release tranche/i }));
        expect(screen.getByText(/Where this goes:/i)).toBeDefined();
        unmount();
      }
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
    it('offers only Open programmes and pre-selects via prop or search param', async () => {
      render(
        <MemoryRouter initialEntries={['/recipients?programme=CBMICRO2026']}>
          <ApplyForm />
        </MemoryRouter>
      );

      // Should show the title
      expect(screen.getByText('Apply for an award')).toBeDefined();

      // Wait for the programme list to load (async phase reads complete)
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
      // Use a sample programme (no real contract call) so the submit path is
      // the sampleSendable stand-in — no wallet signing needed.
      render(
        <MemoryRouter>
          <ApplyForm sampleDelayMs={0} />
        </MemoryRouter>
      );

      // Wait for programme list to load.
      const amountInput = await screen.findByPlaceholderText('0');
      const notesInput = screen.getByRole('textbox', { name: /application notes/i });
      // Wait for programme list to load so a selection exists and submit can be enabled.
      const input = await screen.findByPlaceholderText('0');
      const submitBtn = screen.getByRole('button', { name: /submit application/i }) as HTMLButtonElement;

      // Initially disabled (no amount, no notes).
      expect(submitBtn.disabled).toBe(true);

      // Invalid amount (zero).
      fireEvent.change(amountInput, { target: { value: '0' } });
      const err3 = explain(3, 'program');
      expect(screen.getByText(err3.message)).toBeDefined();
      expect(submitBtn.disabled).toBe(true);

      // Valid amount but still no notes — stays disabled.
      fireEvent.change(amountInput, { target: { value: '1500' } });
      expect(submitBtn.disabled).toBe(true);

      // Fill notes — now enabled.
      fireEvent.change(notesInput, { target: { value: 'Exam fees for term 3.' } });
      expect(submitBtn.disabled).toBe(false);

      fireEvent.click(submitBtn);

      // Receipt appears once the stand-in resolves.
      expect(await screen.findByText(/✓ Application submitted/i)).toBeDefined();
      expect(mockAnnounce).toHaveBeenCalledWith('Application submitted.');
    });

    it('sample submission: uses the stand-in path and shows "Sample ·" in the receipt', async () => {
      render(
        <MemoryRouter>
          <ApplyForm sampleDelayMs={0} />
        </MemoryRouter>
      );

      // Wait for the sample programme list.
      await screen.findByText(/Secondary school bursaries 2026/i);

      fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '500' } });
      fireEvent.change(screen.getByRole('textbox', { name: /application notes/i }), {
        target: { value: 'Bursary for term 1 fees.' },
      });

      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

      // Receipt shows "Sample ·" prefix.
      expect(await screen.findByText(/Sample · ✓ Application submitted/i)).toBeDefined();

      // programme.apply was never called — the sample path goes through sampleSendable.
      expect(programme.apply).not.toHaveBeenCalled();

      // The receipt shows a metadata hash (hex chars).
      expect(screen.getByText(/Application hash/i)).toBeDefined();
    });

    it('real submission: calls programme.apply with stroops and a 32-byte hash, shows receipt', async () => {
      // Inject a real (non-sample) programme id into the index so it appears
      // in the "real" group above the sample group.
      const { fetchProgrammes } = await import('../../lib/indexer');
      (fetchProgrammes as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: REAL_PROGRAMME, name: 'Live Grant Round', creator: null, createdLedger: null },
      ]);

      programme = makeProgramme({ applyResult: 'ok' });

      render(
        <MemoryRouter>
          <ApplyForm sampleDelayMs={0} />
        </MemoryRouter>
      );

      // Wait for the real programme to appear.
      expect(await screen.findByText('Live Grant Round')).toBeDefined();

      // Select it.
      fireEvent.click(screen.getByRole('radio', { name: 'Live Grant Round' }));

      fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1000' } });
      fireEvent.change(screen.getByRole('textbox', { name: /application notes/i }), {
        target: { value: 'Equipment purchase for the workshop.' },
      });

      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

      expect(await screen.findByText(/✓ Application submitted/i)).toBeDefined();

      // programme.apply was called with the wallet address, the correct stroops,
      // and a 32-byte Buffer.
      expect(programme.apply).toHaveBeenCalledWith({
        applicant: RECIPIENT,
        requested: 10_000_000_000n, // 1000 USDC in stroops
        metadata_hash: expect.any(Buffer),
      });

      const callArgs = programme.apply.mock.calls[0][0] as { metadata_hash: Buffer };
      expect(callArgs.metadata_hash).toHaveLength(32);

      // Receipt shows the tx hash and the metadata hash.
      expect(screen.getByText(/Application hash/i)).toBeDefined();
      expect(screen.getByText(/TESTHASH/i)).toBeDefined();
    });

    it('AlreadyApplied (error 9): shows the human explanation, not a generic error', async () => {
      const { fetchProgrammes } = await import('../../lib/indexer');
      (fetchProgrammes as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: REAL_PROGRAMME, name: 'Live Grant Round', creator: null, createdLedger: null },
      ]);

      programme = makeProgramme({ applyResult: 'alreadyApplied' });

      render(
        <MemoryRouter>
          <ApplyForm sampleDelayMs={0} />
        </MemoryRouter>
      );

      await screen.findByText('Live Grant Round');
      fireEvent.click(screen.getByRole('radio', { name: 'Live Grant Round' }));
      fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '500' } });
      fireEvent.change(screen.getByRole('textbox', { name: /application notes/i }), {
        target: { value: 'Second attempt notes.' },
      });

      fireEvent.click(screen.getByRole('button', { name: /submit application/i }));

      // AlreadyApplied = error 9 — explain() should produce the specific message.
      const err9 = explainCode('program', 9);
      expect(await screen.findByText(err9.message)).toBeDefined();

      // Must NOT show the generic fallback message.
      expect(screen.queryByText(/something went wrong that we do not have/i)).toBeNull();

      // The form stays on screen so the recipient can see the error — no receipt shown.
      expect(screen.queryByText(/✓ Application submitted/i)).toBeNull();
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

  describe('Issue #276 — Recipient: withdraw an application', () => {
    // A real (56-char C-prefixed) programme id — uses on-chain path.
    const openApplication: RecipientApplicationFixture = {
      programmeId: REAL_PROGRAMME,
      programmeName: 'Vocational Training Stipends Q3',
      phase: 'Review',
      requested: '12000000000',
      submittedLedger: 4704410,
      votes: ['9000000000'],
      quorum: 3,
    };

    // A sample (non-contract) programme id — stand-in path.
    const sampleApplication: RecipientApplicationFixture = {
      ...openApplication,
      programmeId: 'CDV7VOCATIONALCOHORT3PL5QZ2WM8RT4HX6KJ9A3FC',
      sample: true,
    };

    it('shows the withdraw button on a non-finalised, non-withdrawn application', () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[openApplication]} />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /withdraw application/i })).toBeDefined();
    });

    it('does not show the withdraw button on a finalised application', () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[{ ...openApplication, finalized: true }]} />
        </MemoryRouter>
      );
      expect(screen.queryByRole('button', { name: /withdraw application/i })).toBeNull();
    });

    it('does not show the withdraw button on an already-withdrawn application', () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[{ ...openApplication, withdrawn: true }]} />
        </MemoryRouter>
      );
      expect(screen.queryByRole('button', { name: /withdraw application/i })).toBeNull();
    });

    it('asks for confirmation before withdrawing', () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[openApplication]} />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
      expect(screen.getByText(/This cannot be undone/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /yes, withdraw/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    });

    it('cancel hides the confirmation step without withdrawing', () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[openApplication]} />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText(/This cannot be undone/i)).toBeNull();
      expect(screen.getByRole('button', { name: /withdraw application/i })).toBeDefined();
      expect(programme.withdraw).not.toHaveBeenCalled();
    });

    it('real: calls programme.withdraw, shows success, and hides the action', async () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[openApplication]} />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
      fireEvent.click(screen.getByRole('button', { name: /yes, withdraw/i }));

      expect(await screen.findByText(/Application withdrawn/i)).toBeDefined();
      expect(programme.withdraw).toHaveBeenCalledWith({ applicant: RECIPIENT });
      expect(mockAnnounce).toHaveBeenCalledWith('Application withdrawn.');

      // Withdraw button is gone once confirmed.
      expect(screen.queryByRole('button', { name: /withdraw application/i })).toBeNull();
    });

    it('sample: uses the stand-in path and shows success without calling the contract', async () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList
            applications={[sampleApplication]}
          />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
      fireEvent.click(screen.getByRole('button', { name: /yes, withdraw/i }));

      expect(await screen.findByText(/Application withdrawn/i)).toBeDefined();
      expect(programme.withdraw).not.toHaveBeenCalled();
    });

    it('surfaces AlreadyFinalized (error 13) through explain() when the application was settled concurrently', async () => {
      programme = makeProgramme({ withdrawError: 'Error(Contract, #13)' });

      render(
        <MemoryRouter>
          <ApplicationTimelineList applications={[openApplication]} />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByRole('button', { name: /withdraw application/i }));
      fireEvent.click(screen.getByRole('button', { name: /yes, withdraw/i }));

      const err13 = explainCode('program', 13);
      expect(await screen.findByText(err13.message)).toBeDefined();
    });

    it('shows withdrawn state in the timeline steps when already withdrawn', () => {
      render(
        <MemoryRouter>
          <ApplicationTimelineList
            applications={[{ ...openApplication, withdrawn: true }]}
          />
        </MemoryRouter>
      );
      expect(
        screen.getByText(/Withdrawn — you cancelled this application/i)
      ).toBeDefined();
      expect(screen.getByText('No award will be set.')).toBeDefined();
    });
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { FinalizeSheet, type FinalizeTarget } from '../components/finalize/FinalizeSheet';
import { PartialRefundSheet } from '../components/funder/PartialRefundSheet';
import { ReleaseBatchSheet } from '../components/recipient/ReleaseBatchSheet';
import type { RecipientAwardFixture } from '../fixtures/recipientFixtures';
import type { ContributionCard } from '../lib/funding';
import {
  expectFocusInSheet,
  expectFocusReturnedTo,
  expectSheetAccessible,
  focusAndClick,
  SHEET_TEST_TIMEOUT,
} from './sheetAccessibility';

/**
 * #696 — the write sheets with no test file of their own, opened and walked
 * through every step with axe and focus checks. The other sheets are checked
 * beside their existing tests: ContributeSheet.test.tsx, the release sheet in
 * RecipientFlows.test.tsx, the vote and attest sheets in
 * VerifierDashboard.test.tsx and the deploy sheet in DeployProgramme.test.tsx.
 *
 * PartialRefundSheet and ReleaseBatchSheet run their transaction in TxSheet,
 * the sheet every other single write (cancel, pause, extend, sweep, verifiers,
 * payees, schemas, spend policy, standing) also uses, so its confirm, pending,
 * done and failed steps are checked here.
 *
 * Run locally: `npx vitest run src/test/sheets.accessibility.test.tsx`.
 */

const ADDRESS = `GDON${'A'.repeat(52)}`;
const PROGRAMME = `CPRG${'B'.repeat(52)}`;
const APPLICANT = `GAPP${'C'.repeat(52)}`;
const ATTESTER = `GATT${'D'.repeat(52)}`;

const mocks = vi.hoisted(() => ({
  client: {} as Record<string, unknown>,
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: ADDRESS,
    status: 'connected',
    network: 'TESTNET',
    networkError: null,
    expectedNetwork: 'Testnet',
    connect: vi.fn(),
    signTransaction: vi.fn(),
  }),
}));
vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => vi.fn() }));
vi.mock('../hooks/useBalances', () => ({
  useBalances: () => ({ xlm: 100_000_000_000n, isUnfunded: false, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../context/useSoroban', () => {
  // Reads nobody awaits in these flows never settle, as in the route suite.
  const pending = () => new Promise<never>(() => {});
  const programme = new Proxy({}, { get: (_, key: string) => mocks.client[key] ?? pending });
  const soroban = {
    programmeAt: () => programme,
    policy: { options: { contractId: 'CPOLICY' }, is_installed: pending },
    attest: { verify: pending },
    rpcUrl: 'http://localhost/rpc',
  };
  return { useSoroban: () => soroban, useOptionalSoroban: () => soroban };
});

/** A write that waits until the test settles it, so the pending step can be checked. */
function heldWrite() {
  let settle: (value: unknown) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const assembled = {
    simulationResponse: { minResourceFee: '100000' },
    signAndSend: vi.fn(
      () =>
        new Promise((resolve, reject) => {
          settle = resolve;
          fail = reject;
        }),
    ),
  };
  return {
    method: vi.fn(async () => assembled),
    settle: (value: unknown) => settle(value),
    fail: (error: Error) => fail(error),
  };
}

const refused = () => new Error('HostError: Error(Contract, #2)');

/** Opens `sheet` from a button, as the pages do, so focus has an opener to return to. */
function withOpener(label: string, sheet: (open: boolean, close: () => void) => React.ReactNode) {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <MemoryRouter>
        <button type="button" onClick={() => setOpen(true)}>
          {label}
        </button>
        {sheet(open, () => setOpen(false))}
      </MemoryRouter>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole('button', { name: label });
  focusAndClick(opener, fireEvent.click);
  return opener;
}

function closeWithEscape(opener: HTMLElement) {
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expectFocusReturnedTo(opener);
}

beforeEach(() => {
  mocks.client = {};
});

describe('FinalizeSheet', () => {
  const target: FinalizeTarget = {
    programmeId: PROGRAMME,
    applicant: APPLICANT,
    award: 12_000_000_000n,
    asset: 'XLM',
    left: 50_000_000_000n,
    sample: false,
    policy: null,
  };
  const open = () =>
    withOpener('Finalize', (isOpen, close) =>
      isOpen ? <FinalizeSheet target={target} onClose={close} onFinalized={() => {}} /> : null,
    );

  // Finalize has no separate confirm step: the form states the award and the
  // consequence of each payment mode beside the button that sends it.
  it('form, pending and done, with focus in and back to the opener', async () => {
    const write = heldWrite();
    mocks.client.finalize = write.method;
    const opener = open();
    expectFocusInSheet('form');
    await expectSheetAccessible('form');

    fireEvent.click(screen.getByRole('button', { name: 'Finalize award' }));
    await screen.findByText(/^Finalizing /);
    expectFocusInSheet('pending');
    await expectSheetAccessible('pending');

    write.settle({
      result: {
        unwrap: () => ({
          recipient: APPLICANT,
          granted: target.award,
          payee: APPLICANT,
          mode: { tag: 'Allocated' },
        }),
      },
    });
    expect(await screen.findByRole('heading', { name: 'Award finalized', level: 3 })).toBeTruthy();
    await expectSheetAccessible('done');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectFocusReturnedTo(opener);
  }, SHEET_TEST_TIMEOUT);

  it('failed', async () => {
    const write = heldWrite();
    mocks.client.finalize = write.method;
    const opener = open();
    fireEvent.click(screen.getByRole('button', { name: 'Finalize award' }));
    await screen.findByText(/^Finalizing /);
    write.fail(refused());
    await screen.findByRole('button', { name: 'Try again' });
    expectFocusInSheet('failed');
    await expectSheetAccessible('failed');
    closeWithEscape(opener);
  }, SHEET_TEST_TIMEOUT);
});

describe('PartialRefundSheet', () => {
  const card = {
    programmeId: PROGRAMME,
    name: 'Flood response cash transfers',
    phase: 'Cancelled',
    asset: 'XLM',
    chain: null,
    sample: false,
    amount: 10_000_000_000n,
  } as ContributionCard;
  const open = () =>
    withOpener('Claim part', (isOpen, close) => (
      <PartialRefundSheet
        card={card}
        open={isOpen}
        onClose={close}
        remaining={8_000_000_000n}
        claimedSoFar={0n}
        onClaimed={() => {}}
        sampleDelayMs={0}
      />
    ));
  const toConfirm = async () => {
    fireEvent.change(screen.getByLabelText('Amount to claim'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Sign and claim' });
  };

  it('form, confirm, pending and done, with focus in and back to the opener', async () => {
    const write = heldWrite();
    mocks.client.refund_partial = write.method;
    const opener = open();
    expectFocusInSheet('form');
    await expectSheetAccessible('form');

    await toConfirm();
    expectFocusInSheet('confirm');
    await expectSheetAccessible('confirm');

    fireEvent.click(screen.getByRole('button', { name: 'Sign and claim' }));
    await screen.findAllByText('Claiming part of your refund');
    expectFocusInSheet('pending');
    await expectSheetAccessible('pending');

    write.settle({ result: { unwrap: () => 1_000_000_000n }, sendTransactionResponse: { hash: 'ab'.repeat(32) } });
    expect(await screen.findByRole('heading', { name: 'Part of your refund claimed', level: 3 })).toBeTruthy();
    await expectSheetAccessible('done');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectFocusReturnedTo(opener);
  }, SHEET_TEST_TIMEOUT);

  it('failed', async () => {
    const write = heldWrite();
    mocks.client.refund_partial = write.method;
    const opener = open();
    await toConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Sign and claim' }));
    await screen.findAllByText('Claiming part of your refund');
    write.fail(refused());
    await screen.findByRole('button', { name: 'Try again' });
    expectFocusInSheet('failed');
    await expectSheetAccessible('failed');
    closeWithEscape(opener);
  }, SHEET_TEST_TIMEOUT);
});

describe('ReleaseBatchSheet', () => {
  const award: RecipientAwardFixture = {
    programmeId: PROGRAMME,
    programmeName: 'Secondary School Bursaries 2026',
    recipient: ADDRESS,
    granted: '30000000000',
    released: '0',
    tranches: 3,
    tranchesReleased: 0,
    payee: null,
    mode: 'Restricted',
    updatedLedger: 4851002,
    attestationReady: true,
    condition: 'Milestone completed and verified',
  };
  const open = () =>
    withOpener('Release several', (isOpen, close) => (
      <ReleaseBatchSheet
        open={isOpen}
        onClose={close}
        award={award}
        asset="XLM"
        tranchesLeft={3}
        reply={null}
        onReleased={() => {}}
      />
    ));
  const toConfirm = async () => {
    fireEvent.change(screen.getByLabelText(/Attestation ids/), {
      target: { value: `${'a'.repeat(64)}\n${'b'.repeat(64)}` },
    });
    fireEvent.change(screen.getByLabelText('Attester address'), { target: { value: ATTESTER } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Sign and release 2' });
  };

  it('form, confirm, pending and done, with focus in and back to the opener', async () => {
    const write = heldWrite();
    mocks.client.release_batch = write.method;
    // The sheet re-reads the award after a release; without it the receipt still shows.
    mocks.client.get_award = vi.fn(async () => {
      throw new Error('not read in this test');
    });
    const opener = open();
    expectFocusInSheet('form');
    await expectSheetAccessible('form');

    await toConfirm();
    expectFocusInSheet('confirm');
    await expectSheetAccessible('confirm');

    fireEvent.click(screen.getByRole('button', { name: 'Sign and release 2' }));
    await screen.findAllByText('Releasing 2 tranches');
    expectFocusInSheet('pending');
    await expectSheetAccessible('pending');

    write.settle({ result: { unwrap: () => 20_000_000_000n }, sendTransactionResponse: { hash: 'cd'.repeat(32) } });
    expect(await screen.findByRole('heading', { name: '2 tranches released', level: 3 })).toBeTruthy();
    await expectSheetAccessible('done');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectFocusReturnedTo(opener);
  }, SHEET_TEST_TIMEOUT);

  it('failed', async () => {
    const write = heldWrite();
    mocks.client.release_batch = write.method;
    const opener = open();
    await toConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Sign and release 2' }));
    await screen.findAllByText('Releasing 2 tranches');
    write.fail(refused());
    await screen.findByRole('button', { name: 'Try again' });
    expectFocusInSheet('failed');
    await expectSheetAccessible('failed');
    closeWithEscape(opener);
  }, SHEET_TEST_TIMEOUT);
});

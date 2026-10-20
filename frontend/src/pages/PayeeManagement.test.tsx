import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  bulkBatchDone,
  bulkBatchFailed,
  bulkBatchStart,
  bulkCheckSummary,
  chunkAddresses,
  classifyBulkAddresses,
  countBulkAddresses,
  parseAndDedupe,
  parseBulkAddresses,
} from './payeeBulk';
import { PayeeManagement } from './PayeeManagement';

// Issue #340 — bulk verify/remove. Pure-function tests cover the parsing,
// classification and batching logic directly; the component test covers the
// end-to-end paste -> check -> send flow through the real UI.
// Issue #482 — the same flow, asserting that every batch is announced once
// through the shared announcer and that a failure is announced as an alert
// carrying how much of the run landed.

const VALID_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const VALID_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const VALID_C = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

describe('parseBulkAddresses', () => {
  it('splits on newlines, trims, and drops blank lines', () => {
    expect(parseBulkAddresses(`  ${VALID_A}  \n\n${VALID_B}\r\n\n`)).toEqual([VALID_A, VALID_B]);
  });

  it('returns an empty array for blank input', () => {
    expect(parseBulkAddresses('   \n  \n')).toEqual([]);
  });
});

describe('parseAndDedupe', () => {
  it('marks a malformed address invalid', () => {
    expect(parseAndDedupe('not-an-address')).toEqual([{ address: 'not-an-address', status: 'invalid' }]);
  });

  it('marks a repeated valid address duplicate on its second occurrence', () => {
    const result = parseAndDedupe(`${VALID_A}\n${VALID_A}`);
    expect(result).toEqual([
      { address: VALID_A, status: 'eligible' },
      { address: VALID_A, status: 'duplicate' },
    ]);
  });

  it('leaves a syntactically valid, non-duplicate address eligible pending the on-chain check', () => {
    expect(parseAndDedupe(VALID_A)).toEqual([{ address: VALID_A, status: 'eligible' }]);
  });
});

describe('classifyBulkAddresses', () => {
  it('skips an address already verified, in verify mode', async () => {
    const isPayee = vi.fn(async (address: string) => address === VALID_A);
    const result = await classifyBulkAddresses(`${VALID_A}\n${VALID_B}`, 'verify', isPayee);
    expect(result).toEqual([
      { address: VALID_A, status: 'already-verified' },
      { address: VALID_B, status: 'eligible' },
    ]);
  });

  it('skips an address not currently verified, in remove mode', async () => {
    const isPayee = vi.fn(async (address: string) => address === VALID_A);
    const result = await classifyBulkAddresses(`${VALID_A}\n${VALID_B}`, 'remove', isPayee);
    expect(result).toEqual([
      { address: VALID_A, status: 'eligible' },
      { address: VALID_B, status: 'not-verified' },
    ]);
  });

  it('never calls the on-chain check for invalid or duplicate addresses', async () => {
    const isPayee = vi.fn(async () => false);
    await classifyBulkAddresses(`bad-address\n${VALID_A}\n${VALID_A}`, 'verify', isPayee);
    expect(isPayee).toHaveBeenCalledTimes(1);
    expect(isPayee).toHaveBeenCalledWith(VALID_A);
  });

  it('treats a failed on-chain read as not-yet-verified rather than dropping the address', async () => {
    const isPayee = vi.fn(async () => {
      throw new Error('rpc down');
    });
    const result = await classifyBulkAddresses(VALID_A, 'verify', isPayee);
    expect(result).toEqual([{ address: VALID_A, status: 'eligible' }]);
  });
});

describe('chunkAddresses', () => {
  it('does not split a batch at or under the limit', () => {
    expect(chunkAddresses([VALID_A, VALID_B], 50)).toEqual([[VALID_A, VALID_B]]);
  });

  it('splits a batch larger than the limit, in order, with nothing dropped', () => {
    const addresses = Array.from({ length: 5 }, (_, i) => `addr-${i}`);
    expect(chunkAddresses(addresses, 2)).toEqual([
      ['addr-0', 'addr-1'],
      ['addr-2', 'addr-3'],
      ['addr-4'],
    ]);
  });

  it('returns an empty array for no addresses', () => {
    expect(chunkAddresses([], 50)).toEqual([]);
  });
});

// --- Issue #482: the sentences a run announces -----------------------------

describe('countBulkAddresses', () => {
  it('tallies each status, treating both skip reasons as skipped', () => {
    const results = [
      { address: VALID_A, status: 'eligible' as const },
      { address: VALID_B, status: 'invalid' as const },
      { address: VALID_C, status: 'duplicate' as const },
      { address: 'GSKIP', status: 'already-verified' as const },
      { address: 'GSKIP2', status: 'not-verified' as const },
    ];
    expect(countBulkAddresses(results)).toEqual({ eligible: 1, invalid: 1, duplicate: 1, skipped: 2 });
  });

  it('returns zeroes for nothing yet', () => {
    expect(countBulkAddresses(null)).toEqual({ eligible: 0, invalid: 0, duplicate: 0, skipped: 0 });
  });
});

describe('bulkCheckSummary', () => {
  const counts = { eligible: 60, invalid: 1, duplicate: 2, skipped: 3 };

  it('lists what was found and how it will be sent', () => {
    expect(bulkCheckSummary(counts, 'verify', 2)).toBe(
      '60 to verify, 1 invalid, 2 duplicate, 3 already verified — sent as 2 batches of up to 50.',
    );
  });

  it('mentions batches only when there is more than one', () => {
    expect(bulkCheckSummary({ ...counts, invalid: 0, duplicate: 0, skipped: 0 }, 'remove', 1)).toBe(
      '60 to remove.',
    );
  });

  it('says "already unverified" when removing', () => {
    expect(bulkCheckSummary(counts, 'remove', 1)).toBe('60 to remove, 1 invalid, 2 duplicate, 3 already unverified.');
  });
});

describe('bulk batch announcements', () => {
  it('names the batch, its position and its size when it starts', () => {
    expect(bulkBatchStart(1, 2, 50, 'verify')).toBe('Sending batch 1 of 2: 50 payees to verify…');
    expect(bulkBatchStart(2, 3, 10, 'remove')).toBe('Sending batch 2 of 3: 10 payees to remove…');
  });

  it('reports what a confirmed batch moved', () => {
    expect(bulkBatchDone(1, 2, 50, 'verify')).toBe('Batch 1 of 2 confirmed: 50 payees verified.');
    expect(bulkBatchDone(3, 3, 7, 'remove')).toBe('Batch 3 of 3 confirmed: 7 payees removed.');
  });

  it('carries how many succeeded into the failure message', () => {
    expect(bulkBatchFailed(2, 3, 50, 110, 'verify')).toBe(
      'Batch 2 of 3 failed. 50 of 110 payees verified before it failed; the rest were not sent.',
    );
  });

  it('appends the explained reason when there is one', () => {
    expect(bulkBatchFailed(1, 1, 0, 10, 'remove', 'Could not reach the network.')).toContain(
      '0 of 10 payees removed before it failed',
    );
    expect(bulkBatchFailed(1, 1, 0, 10, 'remove', 'Could not reach the network.')).toMatch(
      /Could not reach the network\.$/,
    );
  });
});

// --- Component: the end-to-end bulk flow ----------------------------------

const CREATOR = 'GCREATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPX';
const PROGRAMME_ID = `C${'A'.repeat(55)}`;

const mocks = vi.hoisted(() => ({
  address: null as string | null,
  announce: vi.fn(),
}));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: mocks.address,
    status: mocks.address ? 'connected' : 'disconnected',
    connect: vi.fn(),
    signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: '', signerAddress: mocks.address }),
  }),
}));

// The shared announcer is how batch progress reaches a screen reader (#482),
// so the component tests assert on what it was told rather than on a live
// region rendered per page (which the brief forbids).
vi.mock('../context/useAnnouncer', () => ({
  useAnnouncer: () => mocks.announce,
}));

function unwrap<T>(value: T) {
  return Promise.resolve({ result: { unwrap: () => value } });
}

function sendable<T>(result: T) {
  return Promise.resolve({ signAndSend: vi.fn().mockResolvedValue({ result }) });
}

function makeProgramme() {
  return {
    get_config: vi.fn(() => unwrap({ creator: CREATOR })),
    is_payee: vi.fn(async ({ payee }: { payee: string }) => ({ result: payee === VALID_C })),
    allow_payees: vi.fn<(args: { payees: string[] }) => ReturnType<typeof sendable>>(() => sendable(undefined)),
    deny_payees: vi.fn<(args: { payees: string[] }) => ReturnType<typeof sendable>>(() => sendable(undefined)),
    allow_payee: vi.fn(() => sendable(undefined)),
    deny_payee: vi.fn(() => sendable(undefined)),
  };
}

let programme = makeProgramme();

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    programmeAt: () => programme,
    registry: { is_programme: vi.fn(async () => ({ result: true })) },
  }),
}));

vi.mock('../fixtures/payeeFixtures', () => ({
  FIXTURE_PAYEES: {
    CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY: [
      { address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', label: 'Sample Payee Clinic' },
    ],
    CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6: [
      { address: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', label: 'Real Programme Fixture' },
    ],
  },
}));

async function renderPage() {
  const view = render(
    <MemoryRouter initialEntries={[`/admin/payees?programme=${PROGRAMME_ID}`]}>
      <PayeeManagement />
    </MemoryRouter>,
  );
  await screen.findByLabelText('Payee addresses');
  return view;
}

describe('PayeeManagement bulk verify/remove', () => {
  beforeEach(() => {
    mocks.address = CREATOR;
    programme = makeProgramme();
    mocks.announce.mockClear();
    window.localStorage.clear();
  });

  it('starts empty when the URL does not name a programme', () => {
    mocks.address = CREATOR;
    render(
      <MemoryRouter initialEntries={['/admin/payees']}>
        <PayeeManagement />
      </MemoryRouter>,
    );
    expect((screen.getByLabelText('Programme address') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Choose a programme')).toBeTruthy();
    expect(programme.get_config).not.toHaveBeenCalled();
  });

  it('takes the programme from the URL', async () => {
    await renderPage();
    expect((screen.getByLabelText('Programme address') as HTMLInputElement).value).toBe(
      PROGRAMME_ID,
    );
  });

  it('checks pasted addresses and shows one classified per line', async () => {
    await renderPage();
    const textarea = screen.getByLabelText('Payee addresses');
    fireEvent.change(textarea, { target: { value: `${VALID_A}\n${VALID_C}\nnot-valid` } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));

    await screen.findByText('Will be verified');
    expect(screen.getByText('Already verified — skipped')).toBeTruthy();
    expect(screen.getByText('Not a valid address')).toBeTruthy();
    expect(screen.getByText(/1 to verify, 1 invalid, 1 already verified/)).toBeTruthy();
  });

  it('sends only the eligible addresses via allow_payees, then clears the form', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Payee addresses'), {
      target: { value: `${VALID_A}\n${VALID_C}` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText('Will be verified');

    fireEvent.click(screen.getByRole('button', { name: 'Verify 1 payee' }));

    await waitFor(() => expect(programme.allow_payees).toHaveBeenCalledWith({ payees: [VALID_A] }));
    await waitFor(() => expect((screen.getByLabelText('Payee addresses') as HTMLTextAreaElement).value).toBe(''));
  }, 15000);

  it('switches to remove mode and calls deny_payees', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /Remove/ }));
    fireEvent.change(screen.getByLabelText('Payee addresses'), { target: { value: VALID_C } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText('Will be removed');

    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 payee' }));
    await waitFor(() => expect(programme.deny_payees).toHaveBeenCalledWith({ payees: [VALID_C] }));
  });

  it('splits more than the batch limit into multiple calls', async () => {
    programme.is_payee.mockResolvedValue({ result: false });
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const many = Array.from({ length: 60 }, (_, i) =>
      ('G' + alphabet[i % 32] + alphabet[Math.floor(i / 32) % 32] + 'A'.repeat(53)).slice(0, 56),
    );
    await renderPage();
    fireEvent.change(screen.getByLabelText('Payee addresses'), { target: { value: many.join('\n') } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText(/sent as 2 batches/);

    fireEvent.click(screen.getByRole('button', { name: 'Verify 60 payees' }));
    await waitFor(() => expect(programme.allow_payees).toHaveBeenCalledTimes(2));
    expect(programme.allow_payees.mock.calls[0][0].payees).toHaveLength(50);
    expect(programme.allow_payees.mock.calls[1][0].payees).toHaveLength(10);
  }, 15000);

  it('disables the send button when nothing is eligible', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Payee addresses'), { target: { value: 'not-valid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText('Not a valid address');
    expect(screen.getByRole('button', { name: 'Verify 0 payees' }).hasAttribute('disabled')).toBe(true);
  });

  it('hides bulk controls behind the creator gate for a non-creator wallet', async () => {
    mocks.address = 'GNOTCREATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXA';
    await renderPage();
    await screen.findByText(/Only the programme.s creator can verify or remove payees/);
    fireEvent.change(screen.getByLabelText('Payee addresses'), { target: { value: VALID_A } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText('Will be verified');
    expect(screen.getByRole('button', { name: 'Verify 1 payee' }).hasAttribute('disabled')).toBe(true);
  });

  // --- Issue #482: every batch is announced ---------------------------------

  /** 60 syntactically valid, distinct addresses — two batches of 50 + 10. */
  const manyAddresses = (count: number) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    return Array.from({ length: count }, (_, i) =>
      ('G' + alphabet[i % 32] + alphabet[Math.floor(i / 32) % 32] + 'A'.repeat(53)).slice(0, 56),
    );
  };

  async function pasteAndCheck(count: number) {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Payee addresses'), {
      target: { value: manyAddresses(count).join('\n') },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText(/sent as 2 batches/);
  }

  it('announces each batch start and result exactly once', async () => {
    programme.is_payee.mockResolvedValue({ result: false });
    await pasteAndCheck(60);

    // The pasted list is not a live region, so nothing is read back twice.
    expect(document.querySelector('.payee-mgmt__bulk-results[aria-live]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Verify 60 payees' }));
    await waitFor(
      () => expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('Batch 2 of 2 confirmed')),
      { timeout: 15000 },
    );

    const said = mocks.announce.mock.calls.map((call) => String(call[0]));
    for (const once of [
      'Sending batch 1 of 2',
      'Batch 1 of 2 confirmed',
      'Sending batch 2 of 2',
      'Batch 2 of 2 confirmed',
    ]) {
      expect(said.filter((text) => text.includes(once))).toHaveLength(1);
    }
    // A run that lands is polite throughout — alerts are for failures only.
    expect(mocks.announce.mock.calls.filter((call) => call[1] === 'alert')).toHaveLength(0);
  }, 15000);

  it('announces a failed batch as an alert, with how many succeeded', async () => {
    programme.is_payee.mockResolvedValue({ result: false });
    programme.allow_payees
      .mockImplementationOnce(() => sendable(undefined))
      .mockImplementationOnce(() => Promise.reject(new Error('network timeout')));
    await pasteAndCheck(60);

    fireEvent.click(screen.getByRole('button', { name: 'Verify 60 payees' }));

    await waitFor(
      () =>
        expect(mocks.announce).toHaveBeenCalledWith(
          expect.stringContaining('Batch 2 of 2 failed'),
          'alert',
        ),
      { timeout: 15000 },
    );

    const failure = mocks.announce.mock.calls.find((call) =>
      String(call[0]).includes('Batch 2 of 2 failed'),
    )!;
    expect(failure[1]).toBe('alert');
    expect(failure[0]).toContain('50 of 60 payees verified');
    // Exactly one assertive announcement for the whole run.
    expect(mocks.announce.mock.calls.filter((call) => call[1] === 'alert')).toHaveLength(1);

    // The failure is still shown on screen — through explain(), visually only.
    expect(await screen.findByText('Could not reach the network.')).toBeTruthy();
    expect(document.querySelector('.payee-mgmt__bulk-progress')).not.toBeNull();
    expect(document.querySelector('.payee-mgmt__bulk-progress[role="status"]')).toBeNull();
    expect(document.querySelector('.payee-mgmt__bulk-results[aria-live]')).toBeNull();
  }, 15000);
});

describe('Issue #439 - Real vs Sample programmes payee management', () => {
  beforeEach(() => {
    mocks.address = CREATOR;
    programme = makeProgramme();
    window.localStorage.clear();
  });

  it('shows no fixture payees on real programmes and checks any address with is_payee', async () => {
    renderPage();

    // Must not show invented fixture payees
    expect(screen.queryByText('Real Programme Fixture')).toBeNull();
    expect(screen.getByText('No payees changed this session')).toBeDefined();

    // Check single address
    const checkInput = screen.getByLabelText('Check payee address');
    fireEvent.change(checkInput, { target: { value: VALID_C } });
    fireEvent.click(screen.getByRole('button', { name: 'Check address' }));

    await waitFor(() => {
      expect(programme.is_payee).toHaveBeenCalledWith({ payee: VALID_C });
    });
    expect(screen.getByText('Verified on-chain')).toBeDefined();
  });

  it('labels addresses added or removed this session as session-only', async () => {
    renderPage();

    // Add address in this session
    fireEvent.change(screen.getByLabelText('Payee address'), { target: { value: VALID_A } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Session Clinic' } });
    const verifyButton = screen.getByRole('button', { name: 'Verify payee' });
    fireEvent.submit(verifyButton.closest('form')!);

    await waitFor(() => {
      expect(programme.allow_payee).toHaveBeenCalledWith({ payee: VALID_A });
    });

    await waitFor(() => {
      expect(screen.getByText('Session Clinic')).toBeDefined();
      expect(screen.getByText('Session-only')).toBeDefined();
    });
  });

  it('shows fixture payees with sample data tag on a sample programme', async () => {
    renderPage();

    const progInput = screen.getByLabelText('Programme address');
    fireEvent.change(progInput, { target: { value: 'CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => {
      expect(screen.getByText('Sample Payee Clinic')).toBeDefined();
      expect(screen.getByText('Sample data')).toBeDefined();
    });
  });
});

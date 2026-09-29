import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { chunkAddresses, classifyBulkAddresses, parseAndDedupe, parseBulkAddresses } from './payeeBulk';
import { PayeeManagement } from './PayeeManagement';

// Issue #340 — bulk verify/remove. Pure-function tests cover the parsing,
// classification and batching logic directly; the component test covers the
// end-to-end paste -> check -> send flow through the real UI.

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

// --- Component: the end-to-end bulk flow ----------------------------------

const CREATOR = 'GCREATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPX';

const mocks = vi.hoisted(() => ({ address: null as string | null }));

vi.mock('../context/useWallet', () => ({
  useWallet: () => ({ address: mocks.address, status: mocks.address ? 'connected' : 'disconnected', connect: vi.fn() }),
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
  useSoroban: () => ({ programmeAt: () => programme }),
}));

vi.mock('../fixtures/payeeFixtures', () => ({ FIXTURE_PAYEES: {} }));

function renderPage() {
  return render(<PayeeManagement />);
}

describe('PayeeManagement bulk verify/remove', () => {
  beforeEach(() => {
    mocks.address = CREATOR;
    programme = makeProgramme();
    window.localStorage.clear();
  });

  it('checks pasted addresses and shows one classified per line', async () => {
    renderPage();
    const textarea = screen.getByLabelText('Payee addresses');
    fireEvent.change(textarea, { target: { value: `${VALID_A}\n${VALID_C}\nnot-valid` } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));

    await screen.findByText('Will be verified');
    expect(screen.getByText('Already verified — skipped')).toBeTruthy();
    expect(screen.getByText('Not a valid address')).toBeTruthy();
    expect(screen.getByText(/1 to verify, 1 invalid, 1 already verified/)).toBeTruthy();
  });

  it('sends only the eligible addresses via allow_payees, then clears the form', async () => {
    renderPage();
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
    renderPage();
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
    renderPage();
    fireEvent.change(screen.getByLabelText('Payee addresses'), { target: { value: many.join('\n') } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText(/sent as 2 batches/);

    fireEvent.click(screen.getByRole('button', { name: 'Verify 60 payees' }));
    await waitFor(() => expect(programme.allow_payees).toHaveBeenCalledTimes(2));
    expect(programme.allow_payees.mock.calls[0][0].payees).toHaveLength(50);
    expect(programme.allow_payees.mock.calls[1][0].payees).toHaveLength(10);
  }, 15000);

  it('disables the send button when nothing is eligible', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Payee addresses'), { target: { value: 'not-valid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText('Not a valid address');
    expect(screen.getByRole('button', { name: 'Verify 0 payees' }).hasAttribute('disabled')).toBe(true);
  });

  it('hides bulk controls behind the creator gate for a non-creator wallet', async () => {
    mocks.address = 'GNOTCREATOREXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXA';
    renderPage();
    await screen.findByText(/Only the programme.s creator can verify or remove payees/);
    fireEvent.change(screen.getByLabelText('Payee addresses'), { target: { value: VALID_A } });
    fireEvent.click(screen.getByRole('button', { name: 'Check addresses' }));
    await screen.findByText('Will be verified');
    expect(screen.getByRole('button', { name: 'Verify 1 payee' }).hasAttribute('disabled')).toBe(true);
  });
});

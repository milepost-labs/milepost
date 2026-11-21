import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Buffer } from 'buffer';

import { Standing, StandingPanel, StandingStats } from './Standing';
import { isTtlLow, standingStats } from '../lib/standing';
import {
  parseStandingHistory,
  verifyStandingHistory,
  type NextRoot,
  type StandingHistoryEntry,
} from '../lib/standingHistory';

const SUBJECT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const LOOKED_UP_SUBJECT = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const STANDING_FIXTURE = {
  programmes: 3,
  tranchesReleased: 5,
  tranchesAwarded: 9,
  totalReceived: 46_300_000_000n,
  liveForDays: 23,
};

// The panel reads through `record.get`; only that call and the wallet it needs
// for the keepalive row matter here.
const chain = vi.hoisted(() => ({
  get: vi.fn(),
  keepalive: vi.fn(),
  next_root: vi.fn(),
}));
const wallet = vi.hoisted(() => ({
  address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as string | null,
  signTransaction: vi.fn(),
}));
const announcer = vi.hoisted(() => ({ announce: vi.fn() }));

vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({
    record: {
      get: chain.get,
      keepalive: chain.keepalive,
      next_root: chain.next_root,
    },
  }),
}));
vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: wallet.address,
    status: wallet.address ? 'connected' : 'disconnected',
    signTransaction: wallet.signTransaction,
  }),
}));
vi.mock('../context/useAnnouncer', () => ({
  useAnnouncer: () => announcer.announce,
}));
vi.mock('../components/layout/SignInSheet', () => ({
  SignInSheet: () => null,
}));

/** The aggregates `record.get` returns, as `unwrap()` hands them back. */
const standing = {
  programmes: 3,
  total_received: 46_300_000_000n,
  tranches: 5,
};
const read = (value: unknown) => ({ result: { unwrap: () => value } });

const renderPanel = (subject: string = SUBJECT) =>
  render(
    <MemoryRouter>
      <StandingPanel subject={subject} />
    </MemoryRouter>,
  );
const renderPage = () =>
  render(
    <MemoryRouter>
      <Standing />
    </MemoryRouter>,
  );

describe('standing aggregates', () => {
  it('presents counts and totals only, never a list', () => {
    const stats = standingStats(STANDING_FIXTURE);

    expect(stats.map((stat) => stat.label)).toEqual([
      'Programmes that funded you',
      'Total received',
      'Tranches delivered',
    ]);
    expect(stats[1].value).toBe('4,630.00 XLM');
    expect(stats[2].value).toBe('5 of 9');
  });

  it('renders every aggregate figure', () => {
    render(<StandingStats standing={STANDING_FIXTURE} />);

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4,630.00 XLM')).toBeTruthy();
    expect(screen.getByText('5 of 9')).toBeTruthy();
  });

  it('shows the count alone when the chain supplies no denominator', () => {
    render(<StandingStats standing={{ programmes: 3, tranchesReleased: 5, totalReceived: 46_300_000_000n }} />);

    // `record.get` has no awarded-tranche total, so nothing is invented for it.
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.queryByText('5 of 9')).toBeNull();
  });
});

describe('standing panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = SUBJECT;
  });

  it('shows what the chain says for the subject', async () => {
    chain.get.mockResolvedValue(read(standing));

    renderPanel();

    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());
    expect(chain.get).toHaveBeenCalledWith({ subject: SUBJECT });
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    // No TTL read, so the row offers the extension without promising a number.
    expect(screen.getByText('Kept alive by anyone who extends it')).toBeTruthy();
  });

  it('shows the empty state, with its explanation, when there is no standing', async () => {
    chain.get.mockRejectedValue(new Error('Error(Contract, #2)'));

    renderPanel();

    await waitFor(() => expect(screen.getByText('No standing yet.')).toBeTruthy());
    expect(
      screen.getByText(/Standing is written the first time a programme releases a tranche/),
    ).toBeTruthy();
  });

  it('shows a failed read as a failure, not as emptiness', async () => {
    chain.get.mockRejectedValue(new Error('Error(Contract, #1)'));

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('This account is not allowed to write standing.')).toBeTruthy(),
    );
    expect(screen.queryByText('No standing yet.')).toBeNull();
  });

  it('says it is reading before the answer arrives', () => {
    // A read that never settles keeps the panel in its loading state.
    chain.get.mockReturnValue(new Promise(() => {}));

    renderPanel();

    expect(screen.getByText('Reading standing')).toBeTruthy();
  });
});

describe('standing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = SUBJECT;
  });

  it('reads the signed-in address first, then a looked-up address', async () => {
    chain.get.mockImplementation(async ({ subject }: { subject: string }) => {
      if (subject === SUBJECT) return read(standing);
      if (subject === LOOKED_UP_SUBJECT) {
        return read({
          programmes: 6,
          total_received: 90_000_000_000n,
          tranches: 8,
        });
      }
      throw new Error(`Unexpected subject ${subject}`);
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());
    expect(chain.get).toHaveBeenCalledWith({ subject: SUBJECT });

    fireEvent.change(screen.getByLabelText('Recipient address'), {
      target: { value: LOOKED_UP_SUBJECT },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(chain.get).toHaveBeenCalledWith({ subject: LOOKED_UP_SUBJECT }));
    await waitFor(() => expect(screen.getByText('9,000.00 XLM')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Show my standing' })).toBeTruthy();
  });

  it('lets a signed-out visitor look up standing without connecting a wallet', async () => {
    wallet.address = null;
    chain.get.mockResolvedValue(
      read({
        programmes: 2,
        total_received: 12_300_000_000n,
        tranches: 4,
      }),
    );

    renderPage();

    expect(screen.getByText('Track your awards and release your money')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Recipient address'), {
      target: { value: LOOKED_UP_SUBJECT },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(chain.get).toHaveBeenCalledWith({ subject: LOOKED_UP_SUBJECT }));
    await waitFor(() => expect(screen.getByText('1,230.00 XLM')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Clear lookup' })).toBeTruthy();
  });

  it('disables the lookup button for invalid address input', () => {
    renderPage();
    const input = screen.getByLabelText('Recipient address');
    const button = screen.getByRole('button', { name: 'Look up' }) as HTMLButtonElement;

    // Initially empty -> button disabled
    expect(button.disabled).toBe(true);

    // Typing a malformed address (not starting with G or wrong length) -> stays disabled
    fireEvent.change(input, { target: { value: 'invalid-address' } });
    expect(button.disabled).toBe(true);

    // Typing current subject -> disabled because it is already showing
    fireEvent.change(input, { target: { value: SUBJECT } });
    expect(button.disabled).toBe(true);

    // Typing a valid 56-character G-prefixed address different from current -> enabled
    fireEvent.change(input, { target: { value: LOOKED_UP_SUBJECT } });
    expect(button.disabled).toBe(false);
  });

  it('switches back to user standing when clicking "Show my standing"', async () => {
    chain.get.mockImplementation(async ({ subject }: { subject: string }) => {
      if (subject === SUBJECT) return read(standing);
      if (subject === LOOKED_UP_SUBJECT) {
        return read({
          programmes: 6,
          total_received: 90_000_000_000n,
          tranches: 8,
        });
      }
      throw new Error(`Unexpected subject ${subject}`);
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());

    // Look up another address
    fireEvent.change(screen.getByLabelText('Recipient address'), {
      target: { value: LOOKED_UP_SUBJECT },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('9,000.00 XLM')).toBeTruthy());

    // Click "Show my standing"
    const revertBtn = screen.getByRole('button', { name: 'Show my standing' });
    fireEvent.click(revertBtn);

    // Back to user standing
    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Show my standing' })).toBeNull();
  });
});

describe('TTL warning', () => {
  it('warns under 30 days and not at or above', () => {
    expect(isTtlLow(23, false)).toBe(true);
    expect(isTtlLow(30, false)).toBe(false);
    expect(isTtlLow(31, false)).toBe(false);
  });

  it('stops warning once the entry has been extended', () => {
    expect(isTtlLow(23, true)).toBe(false);
  });
});

describe('signed-out recipient explainer', () => {
  it('explains what signing in shows and offers a way in, with the lookup still there', () => {
    wallet.address = null;
    render(
      <MemoryRouter>
        <Standing />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Your standing' })).toBeTruthy();
    expect(screen.getByText('Track your awards and release your money')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Recipient sections' })).toBeNull();
    expect(screen.getByLabelText('Recipient address')).toBeTruthy();

    // The sheet itself is mocked out in this file; the way in is the button.
    expect(screen.getByRole('button', { name: 'Sign in with Freighter' })).toBeTruthy();
  });
});

describe('StandingTtlRow keepalive extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = SUBJECT;
  });

  it('calls keepalive and announces extension when "Extend now" is clicked', async () => {
    chain.get.mockResolvedValue(read(standing));
    const signAndSend = vi.fn(async () => ({ result: { unwrap: () => ({}) } }));
    chain.keepalive.mockResolvedValue({ signAndSend });

    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Extend now' })).toBeTruthy());

    const extendBtn = screen.getByRole('button', { name: 'Extend now' });
    await act(async () => {
      fireEvent.click(extendBtn);
    });

    await waitFor(() => {
      expect(chain.keepalive).toHaveBeenCalledWith({ subject: SUBJECT });
      expect(screen.getByRole('button', { name: 'Extended' })).toBeTruthy();
    });
    expect(announcer.announce).toHaveBeenCalledWith('Standing extended for about 90 days.');
  });

  it('disables "Extend now" when signed out', async () => {
    wallet.address = null;
    chain.get.mockResolvedValue(read(standing));

    renderPanel();
    await waitFor(() => expect(screen.getByText('Kept alive by anyone who extends it')).toBeTruthy());

    const extendBtn = screen.getByRole('button', { name: 'Extend now' }) as HTMLButtonElement;
    expect(extendBtn.disabled).toBe(true);
    expect(screen.getByText(/Sign in to extend it\./)).toBeTruthy();
  });
});

describe('HistoryVerifier component', () => {
  const GENESIS_ROOT = Buffer.alloc(32, 0);
  const KNOWN_ROOT = Buffer.alloc(32, 0x5a);

  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = SUBJECT;
  });

  it('renders verify card with on-chain root when historyRoot is provided', async () => {
    chain.get.mockResolvedValue(read({
      ...standing,
      history_root: KNOWN_ROOT,
    }));

    renderPanel();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Verify a shared history' })).toBeTruthy());

    expect(screen.getByText(KNOWN_ROOT.toString('hex'))).toBeTruthy();
    expect(screen.getByLabelText(/Credit history/)).toBeTruthy();
    const verifyBtn = screen.getByRole('button', { name: 'Verify history chain' }) as HTMLButtonElement;
    expect(verifyBtn.disabled).toBe(true);
  });

  it('shows error for malformed JSON', async () => {
    chain.get.mockResolvedValue(read({
      ...standing,
      history_root: GENESIS_ROOT,
    }));

    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/Credit history/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Credit history/), {
      target: { value: '{ not json }' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify history chain' }));

    expect(screen.getByText(/That is not valid JSON/)).toBeTruthy();
  });

  it('shows error for non-array JSON', async () => {
    chain.get.mockResolvedValue(read({
      ...standing,
      history_root: GENESIS_ROOT,
    }));

    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/Credit history/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Credit history/), {
      target: { value: '{"programme":"C123"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify history chain' }));

    expect(screen.getByText('Expected a JSON array of credit entries.')).toBeTruthy();
  });

  it('shows "Genesis confirmed" when empty array matches all-zero on-chain root', async () => {
    chain.get.mockResolvedValue(read({
      ...standing,
      history_root: GENESIS_ROOT,
    }));

    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/Credit history/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Credit history/), {
      target: { value: '[]' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify history chain' }));

    await waitFor(() => expect(screen.getByText('Genesis confirmed')).toBeTruthy());
    expect(screen.getByText(/There are no claimed credits and the on-chain root is all zeroes/)).toBeTruthy();
  });

  it('shows "History verified" on matching folded chain', async () => {
    const PROG = `C${'A'.repeat(55)}`;
    const ATT = '12'.repeat(32);
    const computedRoot = Buffer.alloc(32, 0x77);

    chain.get.mockResolvedValue(read({
      ...standing,
      history_root: computedRoot,
    }));
    chain.next_root.mockResolvedValue({ result: computedRoot });

    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/Credit history/)).toBeTruthy());

    const validHistory: StandingHistoryEntry[] = [
      {
        programme: PROG,
        amount: '10000000',
        attestation: ATT,
        timestamp: '1700000000',
        root: computedRoot.toString('hex'),
      },
    ];

    fireEvent.change(screen.getByLabelText(/Credit history/), {
      target: { value: JSON.stringify(validHistory) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify history chain' }));

    await waitFor(() => expect(screen.getByText('History verified')).toBeTruthy());
    expect(screen.getByText(/Folding these credits from the zero root reproduces the on-chain root exactly\./)).toBeTruthy();
  });

  it('shows "Mismatch" when chain does not reproduce expected root', async () => {
    const PROG = `C${'A'.repeat(55)}`;
    const ATT = '12'.repeat(32);
    const targetRoot = Buffer.alloc(32, 0x99);
    const returnedRoot = Buffer.alloc(32, 0x11);

    chain.get.mockResolvedValue(read({
      ...standing,
      history_root: targetRoot,
    }));
    chain.next_root.mockResolvedValue({ result: returnedRoot });

    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/Credit history/)).toBeTruthy());

    const historyWithWrongRoot: StandingHistoryEntry[] = [
      {
        programme: PROG,
        amount: '10000000',
        attestation: ATT,
        timestamp: '1700000000',
        root: targetRoot.toString('hex'),
      },
    ];

    fireEvent.change(screen.getByLabelText(/Credit history/), {
      target: { value: JSON.stringify(historyWithWrongRoot) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify history chain' }));

    await waitFor(() => expect(screen.getByText('Mismatch')).toBeTruthy());
    expect(screen.getByText(/Entry 1 is where the history first diverges\./)).toBeTruthy();
  });

  it('shows error when record.next_root throws an exception during verification', async () => {
    const PROG = `C${'A'.repeat(55)}`;
    const ATT = '12'.repeat(32);

    chain.get.mockResolvedValue(read({
      ...standing,
      history_root: KNOWN_ROOT,
    }));
    chain.next_root.mockRejectedValue(new Error('RPC node connection failed'));

    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/Credit history/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Credit history/), {
      target: {
        value: JSON.stringify([
          {
            programme: PROG,
            amount: '5000000',
            attestation: ATT,
            timestamp: '1700000000',
          },
        ]),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify history chain' }));

    await waitFor(() =>
      expect(screen.getByText('Could not complete verification: RPC node connection failed')).toBeTruthy(),
    );
  });
});

describe('verifyStandingHistory pure function vectors', () => {
  const PROGRAMME = `C${'B'.repeat(55)}`;
  const ATTESTATION = 'aa'.repeat(32);

  // Hand-built nextRoot simulation for unit test vectors
  const testNextRoot: NextRoot = async ({ root, amount }) => {
    const out = Buffer.alloc(32);
    out.fill(Number(amount % 256n));
    out[0] = (root[0] + 1) % 256;
    return out;
  };

  it('verifies a matching vector constructed from the derivation function', async () => {
    let r = Buffer.alloc(32, 0);
    r = await testNextRoot({
      root: r,
      programme: PROGRAMME,
      amount: 100n,
      attestation: Buffer.from(ATTESTATION, 'hex'),
      timestamp: 1700000000n,
    });
    const expectedRootHex = r.toString('hex');

    const history: StandingHistoryEntry[] = [
      {
        programme: PROGRAMME,
        amount: '100',
        attestation: ATTESTATION,
        timestamp: '1700000000',
        root: expectedRootHex,
      },
    ];

    const verdict = await verifyStandingHistory(history, r, testNextRoot);
    expect(verdict).toEqual({ kind: 'match' });
  });

  it('detects a non-matching vector where the entry root is tampered', async () => {
    let r = Buffer.alloc(32, 0);
    r = await testNextRoot({
      root: r,
      programme: PROGRAMME,
      amount: 100n,
      attestation: Buffer.from(ATTESTATION, 'hex'),
      timestamp: 1700000000n,
    });

    const tamperedHistory: StandingHistoryEntry[] = [
      {
        programme: PROGRAMME,
        amount: '100',
        attestation: ATTESTATION,
        timestamp: '1700000000',
        root: 'ff'.repeat(32), // tampered claimed root
      },
    ];

    const verdict = await verifyStandingHistory(tamperedHistory, r, testNextRoot);
    expect(verdict.kind).toBe('mismatch');
    if (verdict.kind === 'mismatch') {
      expect(verdict.firstBadIndex).toBe(0);
      expect(verdict.claimedRoot).toBe('ff'.repeat(32));
    }
  });

  it('returns mismatch for empty history against non-zero on-chain root (negative case)', async () => {
    const nonZeroRoot = Buffer.alloc(32, 1);
    const verdict = await verifyStandingHistory([], nonZeroRoot, testNextRoot);
    expect(verdict.kind).toBe('mismatch');
    if (verdict.kind === 'mismatch') {
      expect(verdict.message).toBe('The history is empty but the on-chain root is not the zero root.');
    }
  });
});

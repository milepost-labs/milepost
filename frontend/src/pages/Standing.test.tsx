import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RecipientSignedOut, Standing, StandingPanel, StandingStats } from './Standing';
import { isTtlLow, standingStats } from '../lib/standing';

const SUBJECT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const LOOKED_UP_SUBJECT = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const STANDING_FIXTURE = {
  programmes: 3,
  tranchesReleased: 5,
  tranchesAwarded: 9,
  totalReceived: 46_300_000_000n,
  liveForDays: 23,
};

// The panel reads through `record.get`; only that call and the wallet it needs
// for the keepalive row matter here.
const chain = vi.hoisted(() => ({ get: vi.fn(), keepalive: vi.fn() }));
const wallet = vi.hoisted(() => ({
  address: SUBJECT as string | null,
  signTransaction: vi.fn(),
}));
vi.mock('../context/useSoroban', () => ({
  useSoroban: () => ({ record: { get: chain.get, keepalive: chain.keepalive } }),
}));
vi.mock('../context/useWallet', () => ({
  useWallet: () => ({
    address: wallet.address,
    status: wallet.address ? 'connected' : 'disconnected',
    signTransaction: wallet.signTransaction,
  }),
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

const renderPanel = () =>
  render(
    <MemoryRouter>
      <StandingPanel subject={SUBJECT} />
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

    expect(screen.getByRole('heading', { name: 'Sign in to see your standing' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Recipient address'), {
      target: { value: LOOKED_UP_SUBJECT },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(chain.get).toHaveBeenCalledWith({ subject: LOOKED_UP_SUBJECT }));
    await waitFor(() => expect(screen.getByText('1,230.00 XLM')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Clear lookup' })).toBeTruthy();
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
  it('explains what signing in shows and offers a way in', () => {
    const onSignIn = vi.fn();
    render(
      <MemoryRouter>
        <RecipientSignedOut onSignIn={onSignIn} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Sign in to see your standing' })).toBeTruthy();
    expect(screen.getByText('Your standing')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});

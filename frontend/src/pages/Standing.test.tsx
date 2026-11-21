import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { Standing, StandingPanel, StandingStats } from './Standing';
import { isTtlLow, standingStats } from '../lib/standing';

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
const chain = vi.hoisted(() => ({ get: vi.fn(), keepalive: vi.fn() }));
const wallet = vi.hoisted(() => ({
  address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as string | null,
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

    expect(screen.getByText('Track your awards and release your money')).toBeTruthy();

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

/** Shows the router's current path and query, so a test can read the URL. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Standing />
      <LocationProbe />
    </MemoryRouter>,
  );

const lookedUpStanding = read({
  programmes: 6,
  total_received: 90_000_000_000n,
  tranches: 8,
});

describe('standing links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = SUBJECT;
    chain.get.mockImplementation(async ({ subject }: { subject: string }) =>
      subject === LOOKED_UP_SUBJECT ? lookedUpStanding : read(standing),
    );
  });

  it('opens straight on the address in the link', async () => {
    renderAt(`/recipients/standing?address=${LOOKED_UP_SUBJECT}`);

    await waitFor(() => expect(screen.getByText('9,000.00 XLM')).toBeTruthy());
    expect(chain.get).toHaveBeenCalledWith({ subject: LOOKED_UP_SUBJECT });
    expect(chain.get).not.toHaveBeenCalledWith({ subject: SUBJECT });
    expect(screen.getByText('Viewing')).toBeTruthy();
  });

  it('opens a linked standing for a signed-out visitor', async () => {
    wallet.address = null;

    renderAt(`/recipients/standing?address=${LOOKED_UP_SUBJECT}`);

    await waitFor(() => expect(screen.getByText('9,000.00 XLM')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Clear lookup' })).toBeTruthy();
  });

  it('keeps an invalid address in the lookup with its validation, and reads nothing for it', async () => {
    renderAt('/recipients/standing?address=not-an-address');

    expect(screen.getByLabelText('Recipient address')).toHaveProperty('value', 'not-an-address');
    expect(screen.getByRole('alert').textContent).toMatch(/does not hold a Stellar address/);
    expect(screen.getByRole('button', { name: 'Look up' })).toHaveProperty('disabled', true);
    // The signed-in address's own standing still shows.
    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());
    expect(chain.get).toHaveBeenCalledWith({ subject: SUBJECT });
    expect(chain.get).not.toHaveBeenCalledWith({ subject: 'not-an-address' });

    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: LOOKED_UP_SUBJECT } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Look up' })).toHaveProperty('disabled', false);
  });

  it('shows the signed-in standing when the link has no address', async () => {
    renderAt('/recipients/standing');

    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());
    expect(screen.queryByText('Viewing')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/recipients/standing');
  });

  it('puts a looked-up address in the URL and takes it out again on clear', async () => {
    renderAt('/recipients/standing');
    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: LOOKED_UP_SUBJECT } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        `/recipients/standing?address=${LOOKED_UP_SUBJECT}`,
      ),
    );
    await waitFor(() => expect(screen.getByText('9,000.00 XLM')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Show my standing' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/recipients/standing'));
    await waitFor(() => expect(screen.getByText('4,630.00 XLM')).toBeTruthy());
  });

  it('copies a link that opens the standing being viewed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderAt(`/recipients/standing?address=${LOOKED_UP_SUBJECT}`);
    await waitFor(() => expect(screen.getByText('9,000.00 XLM')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this standing' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/recipients/standing?address=${LOOKED_UP_SUBJECT}`,
      ),
    );
  });
});

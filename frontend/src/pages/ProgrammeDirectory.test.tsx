import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { WalletProvider } from '../context/WalletContext';
import { ProgrammeDirectory } from './ProgrammeDirectory';

// Issue #485: filter, search and sort changes announce the new count through
// the shared announcer, and the card list itself is no longer a live region —
// so the tests assert on what the announcer was told.
const mockAnnounce = vi.hoisted(() => vi.fn());
vi.mock('../context/useAnnouncer', () => ({
  useAnnouncer: () => mockAnnounce,
}));

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: false }),
  isAllowed: vi.fn().mockResolvedValue({ isAllowed: false }),
  getAddress: vi.fn().mockResolvedValue({ address: '' }),
  getNetwork: vi.fn().mockResolvedValue({ network: 'TESTNET', networkPassphrase: '' }),
  requestAccess: vi.fn().mockResolvedValue({ address: '' }),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: '', signerAddress: '' }),
}));

const meta = (indexedAt: string) => ({
  network: 'testnet',
  registry: 'CREGISTRY',
  fromLedger: 1,
  indexedToLedger: 2,
  indexedAt,
  complete: true,
  gap: false,
  unhandledEvents: {},
});

function mockIndex(options: {
  programmes?: unknown[];
  indexedAt?: string;
  fail?: boolean;
} = {}) {
  const { programmes = [], indexedAt = new Date().toISOString(), fail = false } = options;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      if (fail) throw new Error('network down');
      const url = String(input);
      if (url.endsWith('meta.json')) {
        return { ok: true, status: 200, json: async () => meta(indexedAt) };
      }
      if (url.endsWith('programmes.json')) {
        return { ok: true, status: 200, json: async () => programmes };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current location">{location.pathname + location.search}</output>;
}

function renderDirectory(path = '/directory') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WalletProvider>
        <ProgrammeDirectory />
        <LocationProbe />
      </WalletProvider>
    </MemoryRouter>,
  );
}

async function cardCount() {
  const links = await screen.findAllByRole('link');
  return links.length;
}

describe('ProgrammeDirectory', () => {
  beforeEach(() => {
    mockIndex();
    mockAnnounce.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a card for every programme once the index resolves', async () => {
    renderDirectory();
    // The index fetch and the directory's merge can take over a second under a
    // full parallel run, past waitFor's default.
    await waitFor(async () => {
      expect(await cardCount()).toBe(FIXTURE_PROGRAMMES.length);
    }, { timeout: 5000 });
  });

  it('filters cards by search text', async () => {
    renderDirectory();
    await screen.findAllByRole('link');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'flood' } });

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });
    expect(screen.getByText(/Flood response cash transfers/i)).toBeTruthy();
  });

  it('filters cards by phase pill', async () => {
    renderDirectory();
    await screen.findAllByRole('link');

    fireEvent.click(screen.getByRole('button', { name: /Cancelled/ }));

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });
  });

  it('restores filters from the URL', async () => {
    renderDirectory('/directory?phase=Review');
    await screen.findAllByRole('link');

    expect(screen.getByRole('button', { name: /Review/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('carries the current filters into the programme links', async () => {
    renderDirectory('/directory?q=flood&phase=Cancelled&sort=newest');
    const name = await screen.findByText(/Flood response cash transfers/i);

    expect(name.closest('a')?.getAttribute('href')).toBe(
      '/programme/CBF9FLOODRESPONSETANA6QW2XM4RP7KZ3HT8LN5DVA?q=flood&phase=Cancelled&sort=newest',
    );
  });

  it('restores sort from the URL', async () => {
    renderDirectory('/directory?sort=largest-budget');
    const links = await screen.findAllByRole('link');

    expect((screen.getByLabelText(/sort/i) as HTMLSelectElement).value).toBe('largest-budget');
    expect(links[0].textContent).toContain('SME supplier microgrants Q2');
  });

  it('updates the URL while preserving search and phase filters', async () => {
    renderDirectory('/directory?phase=Open&q=community');
    await screen.findAllByRole('link');

    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: 'largest-budget' } });

    await waitFor(() => {
      expect(screen.getByLabelText(/current location/i).textContent).toBe(
        '/directory?phase=Open&q=community&sort=largest-budget',
      );
    });
  });

  it('shows a stale warning when the index is older than the threshold', async () => {
    mockIndex({ indexedAt: new Date(Date.now() - 48 * 3_600_000).toISOString() });
    renderDirectory();

    expect(await screen.findByText(/was last updated/i)).toBeTruthy();
  });

  it('shows an error banner but keeps the sample cards when the index fails', async () => {
    mockIndex({ fail: true });
    renderDirectory();

    expect(await screen.findByRole('alert')).toBeTruthy();
    // The index fetch and the directory's merge can take over a second under a
    // full parallel run, past waitFor's default.
    await waitFor(async () => {
      expect(await cardCount()).toBe(FIXTURE_PROGRAMMES.length);
    }, { timeout: 5000 });
  });

  it('shows an empty state with a way out when nothing matches', async () => {
    renderDirectory();
    await screen.findAllByRole('link');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'no-such-programme' } });

    expect(await screen.findByText(/clear filters/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(FIXTURE_PROGRAMMES.length);
    });
  });

  it('does not make the card list a live region', async () => {
    const { container } = renderDirectory();
    await screen.findAllByRole('link');

    // Issue #485: replacing the cards must not be read aloud — the count is
    // announced through the shared announcer instead.
    const body = container.querySelector('.directory-body');
    expect(body).toBeTruthy();
    expect(body!.getAttribute('aria-live')).toBeNull();
    expect(container.querySelectorAll('[aria-live]').length).toBe(0);
  });

  it('announces nothing on the first load', async () => {
    renderDirectory();
    await screen.findAllByRole('link');

    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it('announces the count once per search change', async () => {
    renderDirectory();
    await screen.findAllByRole('link');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'flood' } });

    await waitFor(() => {
      expect(mockAnnounce).toHaveBeenCalledWith('1 programme matches');
    });
    expect(mockAnnounce).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'no-such-programme' } });

    await waitFor(() => {
      expect(mockAnnounce).toHaveBeenCalledWith('0 programmes match');
    });
    expect(mockAnnounce).toHaveBeenCalledTimes(2);
  });

  it('announces the count once per phase pill change', async () => {
    renderDirectory();
    await screen.findAllByRole('link');

    fireEvent.click(screen.getByRole('button', { name: /Open/ }));

    await waitFor(() => {
      expect(mockAnnounce).toHaveBeenCalledWith('2 programmes match');
    });
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
  });

  it('announces the count once per sort change', async () => {
    renderDirectory();
    await screen.findAllByRole('link');

    fireEvent.change(screen.getByLabelText(/sort/i), { target: { value: 'largest-budget' } });

    await waitFor(() => {
      expect(mockAnnounce).toHaveBeenCalledWith(`${FIXTURE_PROGRAMMES.length} programmes match`);
    });
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
  });

  it('shows each card\'s planned mode, worded as a default', async () => {
    mockIndex();
    renderDirectory();
    await waitFor(() => {
      expect(screen.getAllByText('Planned default')).toHaveLength(FIXTURE_PROGRAMMES.length);
    });
    expect(screen.getAllByText(/ mode$/)).toHaveLength(FIXTURE_PROGRAMMES.length);
  it('shows an explanation note when no real programmes exist in the index', async () => {
    mockIndex({ programmes: [] });
    renderDirectory();

    expect(await screen.findByText(/Showing sample programmes/i)).toBeTruthy();
    expect(await screen.findByText(/No real programmes have been published to the index yet/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show sample programmes/i })).toBeNull();
  });

  it('hides sample programmes by default when real programmes exist, and toggles via URL', async () => {
    const realProgramme = {
      id: 'CREALGRANTPROGRAMME1234567890ABCDEF',
      name: 'Stellar Real Community Grant',
      creator: 'GCREATOR123',
      createdLedger: 5000000,
    };
    mockIndex({ programmes: [realProgramme] });

    renderDirectory();

    // With real programmes present, samples are hidden by default: only 1 card
    await waitFor(() => {
      expect(screen.getByText('Stellar Real Community Grant')).toBeTruthy();
      expect(screen.queryByText(/Showing sample programmes/i)).toBeNull();
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });

    const toggleButton = screen.getByRole('button', { name: 'Show sample programmes' });
    expect(toggleButton.getAttribute('aria-pressed')).toBe('false');

    // Click toggle to show samples
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/current location/i).textContent).toContain('samples=1');
      expect(screen.getByRole('button', { name: 'Hide sample programmes' })).toBeTruthy();
      expect(screen.getAllByRole('link')).toHaveLength(FIXTURE_PROGRAMMES.length + 1);
    });
  });

  it('restores sample toggle state from the URL when real programmes exist', async () => {
    const realProgramme = {
      id: 'CREALGRANTPROGRAMME1234567890ABCDEF',
      name: 'Stellar Real Community Grant',
      creator: 'GCREATOR123',
      createdLedger: 5000000,
    };
    mockIndex({ programmes: [realProgramme] });

    renderDirectory('/directory?samples=1');

    await waitFor(() => {
      expect(screen.getByText('Stellar Real Community Grant')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Hide sample programmes' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getAllByRole('link')).toHaveLength(FIXTURE_PROGRAMMES.length + 1);
    });
  });
});

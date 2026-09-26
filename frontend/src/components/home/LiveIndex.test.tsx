import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LiveIndex } from './LiveIndex';
import {
  fetchMeta,
  fetchProgrammes,
  STALE_AFTER_MS,
  type IndexedProgramme,
  type IndexerMeta,
} from '../../lib/indexer';

// Only the network reads are replaced; isStale and STALE_AFTER_MS stay real,
// so these tests exercise the same boundary the app uses.
vi.mock('../../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/indexer')>()),
  fetchMeta: vi.fn(),
  fetchProgrammes: vi.fn(),
}));

const PROGRAMME: IndexedProgramme = {
  id: 'CD6X33SKABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJXT67C6',
  name: 'Community health worker stipend 2026',
  creator: null,
  createdLedger: 4_800_000,
};

function meta(ageMs: number): IndexerMeta {
  return {
    network: 'testnet',
    registry: 'CREGISTRY',
    fromLedger: 4_700_000,
    indexedToLedger: 4_853_148,
    indexedAt: new Date(Date.now() - ageMs).toISOString(),
    complete: true,
    gap: false,
    unhandledEvents: { 'program:Paused': 1, 'program:Unpaused': 1, 'attest:Revoked': 2 },
  };
}

function renderSection() {
  return render(
    <MemoryRouter>
      <LiveIndex />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchProgrammes).mockResolvedValue([PROGRAMME]);
});

describe('LiveIndex', () => {
  it('shows the figures the index returned', async () => {
    vi.mocked(fetchMeta).mockResolvedValue(meta(60 * 60 * 1000));
    renderSection();

    expect(screen.getByText(/Reading meta.json and programmes.json/)).toBeTruthy();
    expect(await screen.findByText((4_853_148).toLocaleString())).toBeTruthy();
    // Three distinct keys in unhandledEvents, not the sum of their counts.
    expect(screen.getByText('Event types not yet indexed').nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('Programmes indexed').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText(PROGRAMME.name!)).toBeTruthy();
  });

  it('does not warn when the index is just inside the stale threshold', async () => {
    vi.mocked(fetchMeta).mockResolvedValue(meta(STALE_AFTER_MS - 60_000));
    renderSection();

    await screen.findByText('Programmes indexed');
    expect(screen.queryByText(/Figures may be behind the chain/)).toBeNull();
  });

  it('warns, and announces it, once the index is past the stale threshold', async () => {
    vi.mocked(fetchMeta).mockResolvedValue(meta(STALE_AFTER_MS + 60_000));
    renderSection();

    const warning = await screen.findByText(/Figures may be behind the chain/);
    expect(warning.getAttribute('role')).toBe('status');
    // Still shows the figures: stale is a warning, not a failure.
    expect(screen.getByText('Programmes indexed')).toBeTruthy();
  });

  it('shows no figures when the index cannot be read', async () => {
    vi.mocked(fetchMeta).mockRejectedValue(new Error('The index returned 503 for meta.json.'));
    renderSection();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't reach the index");
    expect(alert.textContent).toContain('The index returned 503 for meta.json.');
    expect(alert.textContent).toContain('No figures are shown rather than guessed.');
    expect(screen.queryByText('Programmes indexed')).toBeNull();
  });

  it('drops earlier figures when a refresh fails rather than keep showing them', async () => {
    vi.mocked(fetchMeta).mockResolvedValueOnce(meta(60_000));
    renderSection();
    await screen.findByText('Programmes indexed');

    vi.mocked(fetchMeta).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await screen.findByRole('alert');
    expect(screen.queryByText('Programmes indexed')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { ProgrammeDirectory } from './ProgrammeDirectory';

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

function renderDirectory(path = '/directory') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProgrammeDirectory />
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a card for every programme once the index resolves', async () => {
    renderDirectory();
    await waitFor(async () => {
      expect(await cardCount()).toBe(FIXTURE_PROGRAMMES.length);
    });
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

  it('shows a stale warning when the index is older than the threshold', async () => {
    mockIndex({ indexedAt: new Date(Date.now() - 48 * 3_600_000).toISOString() });
    renderDirectory();

    expect(await screen.findByText(/was last updated/i)).toBeTruthy();
  });

  it('shows an error banner but keeps the sample cards when the index fails', async () => {
    mockIndex({ fail: true });
    renderDirectory();

    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(async () => {
      expect(await cardCount()).toBe(FIXTURE_PROGRAMMES.length);
    });
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
});

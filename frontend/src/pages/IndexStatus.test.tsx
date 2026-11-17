import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IndexStatus } from './IndexStatus';

// Issue #480: the freshness change reaches the shared announcer once, instead
// of a per-page live region or a repeated announcement on every refetch.
const announce = vi.hoisted(() => vi.fn());
vi.mock('../context/useAnnouncer', () => ({ useAnnouncer: () => announce }));

function stubFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }),
  );
}

// Relative to now, so "fresh" stays fresh whenever the suite runs.
const HOUR = 3_600_000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

function meta(overrides: Record<string, unknown> = {}) {
  return {
    network: 'testnet',
    registry: 'CCBQHBNIG5FIJEM6SQZQGTQRO3XXHV2BGVGGUY5JXXZ3Y55ZJSV3HMVF',
    fromLedger: 4697201,
    indexedToLedger: 4698280,
    indexedAt: hoursAgo(1),
    complete: true,
    gap: false,
    unhandledEvents: {},
    ...overrides,
  };
}

describe('IndexStatus', () => {
  beforeEach(() => {
    announce.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading state', () => {
    stubFetch(new Promise(() => {}));
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading index status/)).toBeTruthy();
  });

  it('renders fresh meta data', async () => {
    stubFetch(meta());
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Fresh.')).toBeTruthy();
    });
    expect(screen.getByText('4,698,280')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('renders stale state', async () => {
    stubFetch(meta({ indexedAt: hoursAgo(24 * 8) }));
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Stale.')).toBeTruthy();
    });
  });

  it('labels every figure', async () => {
    stubFetch(meta());
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Fresh.')).toBeTruthy();
    });
    for (const label of ['Last rebuilt', 'Indexed to ledger', 'Completeness', 'Unhandled event types']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('announces a change of freshness once, not on every render', async () => {
    stubFetch(meta());
    const view = render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(announce).toHaveBeenCalledTimes(1);
    });
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('fresh'));

    view.rerender(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('announces a stale index', async () => {
    stubFetch(meta({ indexedAt: hoursAgo(24 * 8) }));
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Stale.')).toBeTruthy();
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('stale'));
    });
  });

  it('renders unreachable state', async () => {
    stubFetch(null, false);
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Index unreachable.')).toBeTruthy();
    });
  });

  it('lists unhandled event types', async () => {
    stubFetch(meta({ unhandledEvents: { 'program:Created': 5, 'program:Contributed': 3 } }));
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Event types not handled yet')).toBeTruthy();
    });
    expect(screen.getByText('program:Created')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IndexStatus } from './IndexStatus';

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

function meta(overrides: Record<string, unknown> = {}) {
  return {
    network: 'testnet',
    registry: 'CCBQHBNIG5FIJEM6SQZQGTQRO3XXHV2BGVGGUY5JXXZ3Y55ZJSV3HMVF',
    fromLedger: 4697201,
    indexedToLedger: 4698280,
    indexedAt: new Date(Date.now() - 3_600_000).toISOString(),
    complete: true,
    gap: false,
    unhandledEvents: {},
    ...overrides,
  };
}

describe('IndexStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
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
      expect(screen.getByText('Fresh')).toBeTruthy();
    });
    expect(screen.getByText('4698280')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('renders stale state', async () => {
    stubFetch(meta({ indexedAt: '2026-09-20T12:00:00Z' }));
    render(
      <MemoryRouter>
        <IndexStatus />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Stale')).toBeTruthy();
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
      expect(screen.getByText('Unhandled event types')).toBeTruthy();
    });
    expect(screen.getByText('program:Created')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });
});

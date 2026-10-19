import { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { lazyWithRetry } from './lazyWithRetry';

describe('lazyWithRetry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('reloads the page once when a chunk fails to load', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    const Lazy = lazyWithRetry(() => Promise.reject(new Error('Loading chunk 123 failed')));

    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Suspense fallback={<div>Loading…</div>}>
            <Lazy />
          </Suspense>
        </ErrorBoundary>
      </MemoryRouter>,
    );

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem('milepost:chunk-reload-attempted')).toBe('1');
  });

  it('shows the stale-chunk fallback after the single reload has already been used', async () => {
    sessionStorage.setItem('milepost:chunk-reload-attempted', '1');
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    const Lazy = lazyWithRetry(() => Promise.reject(new Error('Loading chunk 123 failed')));

    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Suspense fallback={<div>Loading…</div>}>
            <Lazy />
          </Suspense>
        </ErrorBoundary>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'A newer version is available' })).toBeTruthy(),
    );
    expect(reload).not.toHaveBeenCalled();
  });
});

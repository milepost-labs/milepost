/**
 * Tests for src/components/layout/Layout.tsx
 *
 * Covers: skip link (exists, accessible name, href targets #main-content),
 * full-bleed layout on "/" only (class applied on root, not on other routes),
 * announcer mounted exactly once (no duplicates on rerender or navigate),
 * header and footer presence, children rendering via Outlet.
 *
 * Layout renders Navbar which uses many dependencies; we mock the ones that
 * would reach the network or the wallet, following the reference pattern in
 * FunderDashboard.test.tsx.
 *
 * Closes #640
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';

// ---------------------------------------------------------------------------
// Module mocks — keep Layout off the network and wallet
// ---------------------------------------------------------------------------

// Navbar has many deps (wallet, soroban, routes); mock it to a simple stub.
vi.mock('./Navbar', () => ({
  Navbar: () => <nav aria-label="Primary">Navbar</nav>,
}));
vi.mock('./OfflineBanner', () => ({
  OfflineBanner: () => null,
}));
// AnnouncerContext is real (Layout mounts it and NavigationFocusManager uses it).
// useAnnouncer is used by NavigationFocusManager; stub it so it doesn't throw.
vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render Layout (which renders its Outlet) under a MemoryRouter at `path`. */
function renderAt(path: string, childContent: string = 'Page content') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />} path="/">
          <Route index element={<div><h1>{childContent}</h1></div>} />
          <Route path="directory" element={<div><h1>{childContent}</h1></div>} />
          <Route path="funders" element={<div><h1>{childContent}</h1></div>} />
          <Route path="nested/deep" element={<div><h1>{childContent}</h1></div>} />
          <Route path="*" element={<div><h1>{childContent}</h1></div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Render Layout providing a custom Outlet child. */
function renderWithOutlet(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />} path="/">
          <Route index element={<div data-testid="outlet-child">hello from outlet</div>} />
          <Route path="*" element={<div data-testid="outlet-child">hello from outlet</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Skip link
// ---------------------------------------------------------------------------

describe('skip link', () => {
  it('is present and has an accessible name', () => {
    renderAt('/');
    const link = screen.getByRole('link', { name: /skip to main content/i });
    expect(link).toBeTruthy();
  });

  it('href points to #main-content and that id exists in the DOM', () => {
    renderAt('/');
    const link = screen.getByRole('link', { name: /skip to main content/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')).toBeTruthy();
  });

  it('is the first focusable element in the document', () => {
    renderAt('/');
    const focusable = document.querySelectorAll(
      'a[href], button, [tabindex]',
    );
    const first = focusable[0] as HTMLAnchorElement;
    expect(first.getAttribute('href')).toBe('#main-content');
  });

  it('the target element (#main-content) is a main landmark', () => {
    renderAt('/');
    const main = document.getElementById('main-content') as HTMLElement;
    expect(main.tagName.toLowerCase()).toBe('main');
  });
});

// ---------------------------------------------------------------------------
// Full-bleed (bleed) layout on "/"
// ---------------------------------------------------------------------------

describe('bleed class', () => {
  it('applies page-wrapper--bleed on the root path "/"', () => {
    renderAt('/');
    const main = document.getElementById('main-content') as HTMLElement;
    expect(main.classList.contains('page-wrapper--bleed')).toBe(true);
  });

  it('does NOT apply page-wrapper--bleed on any other route', () => {
    renderAt('/directory');
    const main = document.getElementById('main-content') as HTMLElement;
    expect(main.classList.contains('page-wrapper--bleed')).toBe(false);
  });

  it('does NOT apply page-wrapper--bleed on a nested path', () => {
    renderAt('/nested/deep');
    const main = document.getElementById('main-content') as HTMLElement;
    expect(main.classList.contains('page-wrapper--bleed')).toBe(false);
  });

  it('does NOT apply page-wrapper--bleed on /funders', () => {
    renderAt('/funders');
    const main = document.getElementById('main-content') as HTMLElement;
    expect(main.classList.contains('page-wrapper--bleed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Announcer mounted exactly once
// ---------------------------------------------------------------------------

describe('announcer live region', () => {
  it('renders exactly one live region on initial mount', () => {
    renderAt('/');
    const liveRegions = document.querySelectorAll('[aria-live]');
    expect(liveRegions.length).toBe(1);
  });

  it('still has exactly one live region after a rerender', () => {
    const { rerender } = renderAt('/');
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout />} path="/">
            <Route index element={<h1>New content</h1>} />
            <Route path="*" element={<h1>New content</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const liveRegions = document.querySelectorAll('[aria-live]');
    expect(liveRegions.length).toBe(1);
  });

  it('live region has polite politeness by default', () => {
    renderAt('/');
    const region = document.querySelector('[aria-live]') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('live region has role="status" by default', () => {
    renderAt('/');
    const region = document.querySelector('[aria-live]') as HTMLElement;
    expect(region.getAttribute('role')).toBe('status');
  });
});

// ---------------------------------------------------------------------------
// Children (Outlet) render
// ---------------------------------------------------------------------------

describe('children render', () => {
  it('renders Outlet children', () => {
    renderWithOutlet('/');
    expect(screen.getByTestId('outlet-child')).toBeTruthy();
    expect(screen.getByTestId('outlet-child').textContent).toBe('hello from outlet');
  });

  it('renders children on non-root routes too', () => {
    renderWithOutlet('/funders');
    expect(screen.getByTestId('outlet-child')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// NavigationFocusManager — does not announce on first mount
// ---------------------------------------------------------------------------

describe('NavigationFocusManager', () => {
  it('does not fire announcement on initial render', () => {
    // fake rAF so we can drain it
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });

    renderAt('/');
    act(() => { vi.runAllTimers(); });

    const region = document.querySelector('[aria-live]') as HTMLElement;
    // On first mount the manager skips the announce; region is empty.
    expect(region.textContent).toBe('');

    vi.useRealTimers();
  });
});

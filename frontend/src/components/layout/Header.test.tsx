import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';
import { THEME_STORAGE_KEY } from '../../context/themeStore';
import { WalletContext, type WalletState } from '../../context/walletStore';
import { AnnouncerProvider } from '../../context/AnnouncerContext';
import { TransactionOutcome } from '../state/AsyncStates';
import { AccountMenu } from './AccountMenu';
import { SignInSheet } from './SignInSheet';
import { ThemeToggle } from './ThemeToggle';
import { Navbar } from './Navbar';

const ADDRESS = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

function wallet(overrides: Partial<WalletState> = {}): WalletState {
  return {
    status: 'disconnected',
    address: null,
    network: null,
    networkError: null,
    expectedNetwork: 'Testnet',
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    recheckNetwork: vi.fn(async () => {}),
    signTransaction: vi.fn(),
    ...overrides,
  } as WalletState;
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme toggle', () => {
  it('switches the theme and keeps it across a reload', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { unmount } = render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    unmount();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
  });
});

describe('sign-in sheet', () => {
  it('offers Freighter only and promises nothing about fees or passkeys', () => {
    render(
      <WalletContext.Provider value={wallet()}>
        <SignInSheet open onClose={() => {}} />
      </WalletContext.Provider>,
    );
    expect(screen.getByRole('button', { name: /Freighter/ })).toBeTruthy();
    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).not.toMatch(/passkey/i);
    expect(text).not.toMatch(/fees? (are|is) covered/i);
  });

  it('connects and closes', async () => {
    const connect = vi.fn(async () => {});
    const onClose = vi.fn();
    render(
      <WalletContext.Provider value={wallet({ connect })}>
        <SignInSheet open onClose={onClose} />
      </WalletContext.Provider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Freighter/ }));
    });
    expect(connect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('explains when Freighter is not installed', () => {
    render(
      <WalletContext.Provider value={wallet({ status: 'unavailable' })}>
        <SignInSheet open onClose={() => {}} />
      </WalletContext.Provider>,
    );
    expect((screen.getByRole('button', { name: /Freighter/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Get Freighter' })).toBeTruthy();
  });
});

describe('account menu', () => {
  it('shows the short address, closes on Escape and signs out', () => {
    const disconnect = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <WalletContext.Provider value={wallet({ status: 'connected', address: ADDRESS, disconnect })}>
          <AccountMenu address={ADDRESS} />
        </WalletContext.Provider>
      </MemoryRouter>,
    );
    const details = container.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(details.open).toBe(false);

    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe('transaction announcements', () => {
  it('announces pending, then success, through the one shared region', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    const view = (phase: string) => (
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route
            path="/x"
            element={
              <AnnouncerProvider>
                <TransactionOutcome phase={phase} error={null} successTitle="Contribution confirmed" />
              </AnnouncerProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    const { rerender, container } = render(view('submitting'));
    act(() => vi.runAllTimers());
    const region = container.querySelector('.announcer') as HTMLElement;
    expect(region.textContent).toBe('Waiting for the network…');

    rerender(view('success'));
    act(() => vi.runAllTimers());
    expect(region.textContent).toBe('Contribution confirmed');
    expect(container.querySelectorAll('[aria-live]').length).toBe(1);
    vi.useRealTimers();
  });
});

function renderNavbar(path: string, state: Partial<WalletState> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <WalletContext.Provider value={wallet(state)}>
          <Navbar />
        </WalletContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('navbar section navigation', () => {
  it('gives the landing page its own links and one way in, not the app sections', () => {
    renderNavbar('/');

    expect(screen.getByRole('link', { name: 'Launch app' }).getAttribute('href')).toBe('/directory');
    expect(screen.getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#how');
    expect(screen.queryByRole('link', { name: 'Programmes' })).toBeNull();
    // Browsing needs no wallet, so the landing page does not ask for one.
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.getByText('Testnet · pre-audit')).toBeTruthy();
  });

  it('renders the five sections with the current one marked', () => {
    const { unmount } = renderNavbar('/directory');
    const primary = within(screen.getAllByRole('navigation', { name: 'Primary' })[0]);

    expect(primary.getByRole('link', { name: 'Programmes' }).getAttribute('aria-current')).toBe('page');
    expect(primary.getByRole('link', { name: 'Fund' }).getAttribute('aria-current')).toBeNull();
    expect(primary.getByRole('link', { name: 'Get funded' })).toBeTruthy();
    expect(primary.getByRole('link', { name: 'Verify' })).toBeTruthy();
    expect(primary.getByRole('link', { name: 'Admin' })).toBeTruthy();

    unmount();

    // A route nested under Get funded.
    renderNavbar('/recipients/standing');
    const nested = within(screen.getAllByRole('navigation', { name: 'Primary' })[0]);
    expect(nested.getByRole('link', { name: 'Get funded' }).getAttribute('aria-current')).toBe('page');
  });

  it('repeats the sections as a bottom bar for phones', () => {
    renderNavbar('/funders');
    const bars = screen.getAllByRole('navigation', { name: 'Primary' });
    expect(bars.length).toBe(2);
    expect(bars[1].className).toBe('tabbar');
    expect(within(bars[1]).getByRole('link', { name: 'Fund' }).getAttribute('aria-current')).toBe('page');
  });

  it('lists the pages inside the current section and marks the current one', () => {
    const { unmount } = renderNavbar('/admin/payees');
    const sub = within(screen.getByRole('navigation', { name: 'Admin pages' }));
    expect(sub.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Finalize awards',
      'Deploy programme',
      'Register schema',
      'Payees',
      'Standing',
      'Keepalive',
    ]);
    expect(sub.getByRole('link', { name: 'Payees' }).getAttribute('aria-current')).toBe('page');
    expect(sub.getByRole('link', { name: 'Deploy programme' }).getAttribute('aria-current')).toBeNull();
    unmount();

    // A programme's own page sits under Directory.
    renderNavbar('/programme/CD6X33SKLUEMANS67ID3LJL572FFGERMMJCIFRW7P7EKZQLH35XT67C6');
    const programmes = within(screen.getByRole('navigation', { name: 'Programmes pages' }));
    expect(programmes.getByRole('link', { name: 'Directory' }).getAttribute('aria-current')).toBe('page');
  });

  it('offers sign-in when signed out and the account when signed in', () => {
    const { unmount } = renderNavbar('/directory');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    unmount();

    renderNavbar('/directory', { status: 'connected', address: ADDRESS });
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.getAllByText('GAH3D4…KXCA').length).toBeGreaterThan(0);
  });
});

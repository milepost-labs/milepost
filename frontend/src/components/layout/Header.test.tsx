import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';
import { THEME_STORAGE_KEY } from '../../context/themeStore';
import { WalletContext, type WalletState } from '../../context/walletStore';
import { AnnouncerProvider } from '../../context/AnnouncerContext';
import { TransactionOutcome } from '../state/AsyncStates';
import { AccountMenu } from './AccountMenu';
import { SignInSheet } from './SignInSheet';
import { ThemeToggle } from './ThemeToggle';

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

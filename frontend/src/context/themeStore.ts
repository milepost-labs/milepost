import { createContext } from 'react';

/** Context object and types, kept apart from the provider so Fast Refresh works. */

export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_STORAGE_KEY = 'milepost-theme';

/**
 * The saved choice if there is one, otherwise the system preference.
 *
 * Storage can throw (private windows, blocked site data), and a theme is not
 * worth failing to render over, so any error falls back to the system.
 */
export function readInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Fall through to the system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

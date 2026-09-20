import { createContext } from 'react';

/** Context object and types, kept apart from the provider so Fast Refresh works. */

export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

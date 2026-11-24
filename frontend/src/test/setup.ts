import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import {
  installConsoleErrorGuard,
  resetConsoleErrorGuard,
  takeUnexpectedConsoleErrors,
} from './consoleErrors';

function createStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(String(key));
    },
    setItem(key: string, value: string) {
      entries.set(String(key), String(value));
    },
  };
}

const storage = window.localStorage;
if (typeof storage?.setItem !== 'function' || typeof storage.clear !== 'function') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorage(),
  });
}

// Records console.error for the checks below. See src/test/consoleErrors.ts (#690).
installConsoleErrorGuard();

beforeEach(() => {
  resetConsoleErrorGuard();
});

// Unmount anything a test rendered so the next test starts from a clean DOM.
// Then fail the test if it logged a console.error nobody expected (#690).
afterEach(() => {
  cleanup();
  const unexpected = takeUnexpectedConsoleErrors();
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected console.error (${unexpected.length}):\n` +
        unexpected.map((message) => `  - ${message}`).join('\n') +
        '\nFix the cause, or if the error is intended, call expectConsoleError(/pattern/, reason) in the test.',
    );
  }
});

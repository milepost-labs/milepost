import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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

// Unmount anything a test rendered so the next test starts from a clean DOM.
afterEach(() => {
  cleanup();
});

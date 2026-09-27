import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

function installMemoryLocalStorage() {
  const items = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(String(key));
    },
    setItem(key: string, value: string) {
      items.set(String(key), String(value));
    },
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

function hasUsableLocalStorage() {
  try {
    return typeof window.localStorage?.setItem === 'function';
  } catch {
    return false;
  }
}

if (!hasUsableLocalStorage()) {
  installMemoryLocalStorage();
}

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

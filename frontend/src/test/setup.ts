import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount anything a test rendered so the next test starts from a clean DOM.
afterEach(() => {
  cleanup();
});

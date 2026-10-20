import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

const mocks = vi.hoisted(() => ({
  announce: vi.fn(),
}));

vi.mock('../../context/useAnnouncer', () => ({
  useAnnouncer: () => mocks.announce,
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('OfflineBanner', () => {
  beforeEach(() => {
    mocks.announce.mockClear();
  });

  it('shows the offline banner and announces the transition when the browser goes offline', () => {
    setOnline(false);
    render(<OfflineBanner />);

    expect(screen.getByText(/You’re offline/i)).toBeTruthy();
    expect(mocks.announce).toHaveBeenCalledWith(
      'You are offline. Reads and writes will fail until the connection returns.',
      'alert',
    );

    setOnline(true);
    fireEvent(window, new Event('online'));

    expect(screen.queryByText(/You’re offline/i)).toBeNull();
    expect(mocks.announce).toHaveBeenCalledWith('Back online.', 'status');
  });
});

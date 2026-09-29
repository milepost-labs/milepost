import { useEffect, useState } from 'react';

/**
 * Tracks connectivity via `navigator.onLine`, kept in sync with the `online`
 * and `offline` events.
 *
 * `navigator.onLine` only tells you the OS thinks it has a network interface
 * up — it is not a guarantee any request will succeed — but it is the signal
 * the platform gives us, and it is what makes "you look offline" honest
 * rather than inferring it from failed reads.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}

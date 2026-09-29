import { useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useAnnouncer } from '../../context/useAnnouncer';
import './OfflineBanner.css';

/**
 * A small banner that appears while the browser is offline and clears the
 * moment the connection returns.
 *
 * Every read fails with an opaque network error while offline, and nothing
 * on screen says why. This does not replace that error handling — it adds
 * the one fact none of those error panels can know on their own: it isn't
 * this request, it's the connection.
 *
 * Announced once per transition through the shared announcer, not on every
 * render, so it does not talk over itself while offline.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const announce = useAnnouncer();
  // Skips the "back online" announcement on first mount when the page
  // simply loaded online — there is nothing to report yet — but still
  // announces once if the page loads while already offline.
  const mounted = useRef(false);

  useEffect(() => {
    const firstRun = !mounted.current;
    mounted.current = true;
    if (firstRun && online) return;

    announce(
      online ? 'Back online.' : 'You are offline. Reads and writes will fail until the connection returns.',
      online ? 'status' : 'alert',
    );
  }, [online, announce]);

  if (online) return null;

  return (
    // Visual only — the announcement above already reaches the shared live
    // region, so this is not itself `aria-live` and would otherwise be read
    // twice.
    <div className="offline-banner">
      <WifiOff size={16} aria-hidden="true" />
      <span>You&rsquo;re offline. Reads and writes will fail until the connection returns.</span>
    </div>
  );
}

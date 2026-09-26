import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AnnouncerContext, announcementAria, type Announcement, type AnnouncementKind } from './announcerStore';

/**
 * One shared live region for every async result, mounted once by `Layout` —
 * not reinvented per page, which is how per-page regions drift apart.
 *
 * Design reference: frontend/docs/design/README.md — "a line at the bottom
 * of the screen" that every write's pending/success/error passes through.
 */

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [latest, setLatest] = useState<Announcement | null>(null);
  const frame = useRef<number | null>(null);
  const path = useRef(location.pathname);
  useEffect(() => {
    path.current = location.pathname;
  }, [location.pathname]);

  const announce = useCallback((text: string, kind: AnnouncementKind = 'status') => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    // Clear first, then set on the next frame. A screen reader only notices
    // a live region when its content actually changes — announcing the same
    // text twice in a row (two identical "Confirmed.") would otherwise be
    // silently swallowed the second time.
    setLatest(null);
    frame.current = requestAnimationFrame(() => setLatest({ text, kind, path: path.current }));
  }, []);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  // A stale "Contribution confirmed" should not sit on a screen it no longer
  // describes once someone has navigated away from it. Derived rather than
  // cleared in an effect, so there is no extra render with the stale text.
  const visible = latest && latest.path === location.pathname ? latest : null;

  const { role, ariaLive } = announcementAria(visible?.kind ?? 'status');

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <p className="announcer" role={role} aria-live={ariaLive}>
        {visible?.text ?? ''}
      </p>
    </AnnouncerContext.Provider>
  );
}

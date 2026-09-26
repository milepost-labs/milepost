import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AnnouncerContext, type Announcement, type AnnouncementKind } from './announcerStore';

/**
 * One shared live region for every async result, mounted once by `Layout` —
 * not reinvented per page, which is how per-page regions drift apart.
 *
 * Design reference: frontend/docs/design/README.md — "a line at the bottom
 * of the screen" that every write's pending/success/error passes through.
 */

/** The ARIA pairing for a kind — kept as a pure mapping so it can be tested
 * without rendering anything. `alert` is inherently assertive; `status` is
 * inherently polite. Setting both `role` and `aria-live` is belt and braces
 * across screen readers that key off one or the other. */
export function announcementAria(kind: AnnouncementKind): { role: 'status' | 'alert'; ariaLive: 'polite' | 'assertive' } {
  return kind === 'alert' ? { role: 'alert', ariaLive: 'assertive' } : { role: 'status', ariaLive: 'polite' };
}

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [visible, setVisible] = useState<Announcement | null>(null);
  const frame = useRef<number | null>(null);

  const announce = useCallback((text: string, kind: AnnouncementKind = 'status') => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    // Clear first, then set on the next frame. A screen reader only notices
    // a live region when its content actually changes — announcing the same
    // text twice in a row (two identical "Confirmed.") would otherwise be
    // silently swallowed the second time.
    setVisible(null);
    frame.current = requestAnimationFrame(() => setVisible({ text, kind }));
  }, []);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  // A stale "Contribution confirmed" should not sit on a screen it no longer
  // describes once someone has navigated away from it.
  useEffect(() => {
    setVisible(null);
  }, [location.pathname]);

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

import { createContext } from 'react';

/** Context object and types, kept apart from the provider so Fast Refresh works. */

/**
 * `status` is polite — it waits for a screen reader to finish whatever it is
 * already saying. `alert` is assertive — it interrupts, which is right for a
 * failure but wrong for "pending" or "done".
 */
export type AnnouncementKind = 'status' | 'alert';

export interface Announcement {
  text: string;
  kind: AnnouncementKind;
  /** The route it was made on, so it is not shown on another screen. */
  path: string;
}

export interface AnnouncerContextType {
  /** Tell the shared live region something happened. Defaults to `'status'`. */
  announce: (text: string, kind?: AnnouncementKind) => void;
}

export const AnnouncerContext = createContext<AnnouncerContextType | undefined>(undefined);

/** The ARIA pairing for a kind, kept as a pure mapping so it can be tested
 * without rendering anything. `alert` is inherently assertive; `status` is
 * inherently polite. Setting both `role` and `aria-live` is belt and braces
 * across screen readers that key off one or the other. */
export function announcementAria(kind: AnnouncementKind): { role: 'status' | 'alert'; ariaLive: 'polite' | 'assertive' } {
  return kind === 'alert' ? { role: 'alert', ariaLive: 'assertive' } : { role: 'status', ariaLive: 'polite' };
}

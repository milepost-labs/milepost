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
}

export interface AnnouncerContextType {
  /** Tell the shared live region something happened. Defaults to `'status'`. */
  announce: (text: string, kind?: AnnouncementKind) => void;
}

export const AnnouncerContext = createContext<AnnouncerContextType | undefined>(undefined);

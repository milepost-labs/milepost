import type { AnnouncementKind } from '../context/announcerStore';

/**
 * Stand-in announcements covering the three moments every write passes
 * through, shaped like what `useAnnouncer()` actually takes: text plus an
 * optional kind.
 */

export const FIXTURE_PENDING_ANNOUNCEMENT: { text: string; kind: AnnouncementKind } = {
  text: 'Submitting…',
  kind: 'status',
};

export const FIXTURE_SUCCESS_ANNOUNCEMENT: { text: string; kind: AnnouncementKind } = {
  text: 'Contribution confirmed.',
  kind: 'status',
};

export const FIXTURE_FAILURE_ANNOUNCEMENT: { text: string; kind: AnnouncementKind } = {
  text: 'Contribution failed. Nothing was transferred.',
  kind: 'alert',
};

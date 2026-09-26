import { describe, it, expect } from 'vitest';
import { announcementAria } from './AnnouncerContext';
import {
  FIXTURE_PENDING_ANNOUNCEMENT,
  FIXTURE_SUCCESS_ANNOUNCEMENT,
  FIXTURE_FAILURE_ANNOUNCEMENT,
} from '../fixtures/announcer';

describe('announcementAria', () => {
  it('pending and success are polite — role="status", so they wait their turn', () => {
    expect(announcementAria(FIXTURE_PENDING_ANNOUNCEMENT.kind)).toEqual({ role: 'status', ariaLive: 'polite' });
    expect(announcementAria(FIXTURE_SUCCESS_ANNOUNCEMENT.kind)).toEqual({ role: 'status', ariaLive: 'polite' });
  });

  it('failure is assertive — role="alert", so it interrupts', () => {
    expect(announcementAria(FIXTURE_FAILURE_ANNOUNCEMENT.kind)).toEqual({ role: 'alert', ariaLive: 'assertive' });
  });
});

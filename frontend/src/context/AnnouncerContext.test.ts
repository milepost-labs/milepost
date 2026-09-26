import { describe, it, expect } from 'vitest';
import { announcementAria } from './announcerStore';

describe('announcementAria', () => {
  it('pending and success are polite — role="status", so they wait their turn', () => {
    expect(announcementAria('status')).toEqual({ role: 'status', ariaLive: 'polite' });
    expect(announcementAria('status')).toEqual({ role: 'status', ariaLive: 'polite' });
  });

  it('failure is assertive — role="alert", so it interrupts', () => {
    expect(announcementAria('alert')).toEqual({ role: 'alert', ariaLive: 'assertive' });
  });
});

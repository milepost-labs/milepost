import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AddToCalendar } from './AddToCalendar';

const NOW = Date.UTC(2026, 0, 1);
const s = (ms: number) => BigInt(Math.floor(ms / 1000));
const deadlines = [
  { key: 'apply_deadline', label: 'Applications close', unixSeconds: s(NOW - 60_000) },
  { key: 'review_deadline', label: 'Reviews close', unixSeconds: s(NOW + 3_600_000) },
  { key: 'release_deadline', label: 'Releases close', unixSeconds: s(NOW + 7_200_000) },
];
const props = {
  programmeName: 'Rural clinics: phase 2',
  programmeUrl: 'https://milepost.example/programme/CABC',
  deadlines,
  nowMs: NOW,
};

describe('AddToCalendar', () => {
  let blobs: Blob[];
  let downloads: string[];

  beforeEach(() => {
    blobs = [];
    downloads = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:calendar';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a labelled button that counts the remaining deadlines', () => {
    render(<AddToCalendar {...props} />);
    const button = screen.getByRole('button', { name: 'Add the 2 remaining deadlines to your calendar' });
    expect(button.textContent).toContain('Add to calendar');
  });

  it('downloads a calendar of only the deadlines still ahead', async () => {
    render(<AddToCalendar {...props} />);
    fireEvent.click(screen.getByRole('button'));

    expect(downloads).toEqual(['rural-clinics-phase-2-deadlines.ics']);
    expect(blobs[0].type).toBe('text/calendar;charset=utf-8');
    const ics = await blobs[0].text();
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('Reviews close');
    expect(ics).not.toContain('Applications close');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:calendar');
  });

  it('renders nothing once every deadline has passed', () => {
    const { container } = render(<AddToCalendar {...props} nowMs={NOW + 8_000_000} />);
    expect(container.innerHTML).toBe('');
  });

  it('names the file sensibly for any programme name', () => {
    render(<AddToCalendar {...props} programmeName="!!!" />);
    fireEvent.click(screen.getByRole('button'));
    expect(downloads).toEqual(['programme-deadlines.ics']);
  });
});

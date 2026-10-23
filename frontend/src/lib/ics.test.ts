import { describe, expect, it } from 'vitest';
import { escapeIcsText, foldIcsLine, formatIcsTimestamp, generateIcs } from './ics';

const NOW = new Date(Date.UTC(2026, 0, 1));
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const URL_BACK = 'https://milepost.example/programme/CABC';

/** Undo RFC 5545 folding, so assertions read whole content lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeIcsText('a, b; c\\d\ne\r\nf')).toBe(String.raw`a\, b\; c\\d\ne\nf`);
  });

  it('escapes the backslash first, so added backslashes are not doubled', () => {
    expect(escapeIcsText('\\,')).toBe(String.raw`\\\,`);
  });
});

describe('formatIcsTimestamp', () => {
  it('formats a Unix time as a UTC date-time', () => {
    expect(formatIcsTimestamp(seconds(new Date(Date.UTC(2026, 5, 15, 12, 30, 5))))).toBe('20260615T123005Z');
  });

  it('accepts the bigint seconds the contract returns', () => {
    expect(formatIcsTimestamp(BigInt(seconds(NOW)))).toBe('20260101T000000Z');
  });
});

describe('foldIcsLine', () => {
  it('leaves a line of 75 octets alone', () => {
    expect(foldIcsLine('x'.repeat(75))).toBe('x'.repeat(75));
  });

  it('folds longer lines to 75 octets, continuing with a space', () => {
    const folded = foldIcsLine('x'.repeat(200));
    const lines = folded.split('\r\n');
    expect(lines[0]).toHaveLength(75);
    expect(lines.slice(1).every((line) => line.startsWith(' ') && line.length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe('x'.repeat(200));
  });

  it('counts UTF-8 bytes and never splits a character', () => {
    const name = 'é'.repeat(60); // 120 octets
    const lines = foldIcsLine(name).split('\r\n');
    const encoder = new TextEncoder();
    expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(true);
    expect(lines.join('').replace(/ /g, '')).toBe(name);
  });
});

describe('generateIcs', () => {
  const deadlines = [
    { key: 'apply_deadline', label: 'Applications close', unixSeconds: BigInt(seconds(NOW) - 60) },
    { key: 'review_deadline', label: 'Reviews close', unixSeconds: BigInt(seconds(NOW) + 3600) },
    { key: 'release_deadline', label: 'Releases close', unixSeconds: BigInt(seconds(NOW) + 7200) },
  ];
  const ics = generateIcs('Rural clinics, phase 2; north', URL_BACK, deadlines, NOW);
  const lines = unfold(ics).split('\r\n');

  it('is a calendar with CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('has one event per deadline not yet passed, in UTC', () => {
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines).toContain('DTSTART:20260101T010000Z');
    expect(lines).toContain('DTSTART:20260101T020000Z');
    expect(unfold(ics)).not.toContain('Applications close');
  });

  it('treats a deadline at exactly now as passed', () => {
    const atNow = generateIcs('P', URL_BACK, [{ key: 'k', label: 'Now', unixSeconds: seconds(NOW) }], NOW);
    expect(atNow).not.toContain('BEGIN:VEVENT');
  });

  it('escapes the programme name and links every event back to the programme', () => {
    expect(lines).toContain(String.raw`SUMMARY:Reviews close: Rural clinics\, phase 2\; north`);
    expect(lines.filter((l) => l === `URL:${URL_BACK}`)).toHaveLength(2);
    expect(lines.find((l) => l.startsWith('DESCRIPTION:Reviews close'))).toContain(URL_BACK);
  });

  it('gives each event a stable, distinct UID', () => {
    const uids = lines.filter((l) => l.startsWith('UID:'));
    expect(new Set(uids).size).toBe(2);
    expect(unfold(generateIcs('Rural clinics, phase 2; north', URL_BACK, deadlines, NOW))).toContain(uids[0]);
  });

  it('keeps every physical line within 75 octets', () => {
    const long = generateIcs('A'.repeat(120), URL_BACK, deadlines, NOW);
    const encoder = new TextEncoder();
    expect(long.split('\r\n').every((line) => encoder.encode(line).length <= 75)).toBe(true);
  });

  it('is an empty calendar when every deadline has passed', () => {
    const empty = generateIcs('P', URL_BACK, deadlines.slice(0, 1), NOW);
    expect(empty).toBe(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Milepost//Programme deadlines//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n',
    );
  });
});

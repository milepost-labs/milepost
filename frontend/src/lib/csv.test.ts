import { describe, expect, it } from 'vitest';
import { escapeCsvField, csvRow, awardsToCsv } from './csv';
import { FIXTURE_AWARDS } from '../fixtures/programmeFixtures';

describe('escapeCsvField', () => {
  it('returns plain values unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('wraps fields with commas in quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('doubles existing quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps fields with newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('csvRow', () => {
  it('joins fields with commas', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('escapes individual fields', () => {
    expect(csvRow(['plain', 'has,comma'])).toBe('plain,"has,comma"');
  });
});

describe('awardsToCsv', () => {
  it('includes a header row and advisory notice', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Recipient');
    expect(lines[1]).toContain('advisory public index');
    expect(lines[1]).toContain('2026-09-15T12:00:00Z');
  });

  it('exports both stroops and formatted units', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    const firstAward = lines[2];
    expect(firstAward).toContain('140000000000');
    expect(firstAward).toContain('14,000');
  });

  it('handles awards with zero released', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    const zeroAward = lines[4];
    expect(zeroAward).toContain('0');
  });

  it('escapes commas in recipient addresses', () => {
    const awards = [{
      ...FIXTURE_AWARDS[0],
      recipient: 'GTEST,COMMA',
    }];
    const csv = awardsToCsv(awards, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    expect(lines[2]).toContain('"GTEST,COMMA"');
  });
});

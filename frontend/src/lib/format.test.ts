import { describe, it, expect } from 'vitest';
import { formatDate, timeUntil, hasPassed, truncateAddress, looksLikeAddress, toDate } from './format';

const NOW = new Date('2026-03-10T12:00:00Z');
const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe('toDate', () => {
  it('treats contract timestamps as seconds', () => {
    // The commonest mistake here is feeding seconds to Date, which lands in 1970.
    expect(toDate(1_772_712_000).getUTCFullYear()).toBe(2026);
  });
});

describe('formatDate', () => {
  it('renders a readable date', () => {
    expect(formatDate(at('2026-03-10T12:00:00Z'))).toMatch(/2026/);
  });
});

describe('timeUntil', () => {
  it('describes the future and the past', () => {
    expect(timeUntil(at('2026-03-13T12:00:00Z'), NOW)).toMatch(/3 days/);
    expect(timeUntil(at('2026-03-07T12:00:00Z'), NOW)).toMatch(/3 days ago/);
  });

  it('scales to the right unit', () => {
    expect(timeUntil(at('2026-03-10T12:00:30Z'), NOW)).toMatch(/second/);
    expect(timeUntil(at('2026-03-10T14:00:00Z'), NOW)).toMatch(/hour/);
  });
});

describe('hasPassed', () => {
  it('is inclusive of the exact moment', () => {
    expect(hasPassed(at('2026-03-10T12:00:00Z'), NOW)).toBe(true);
    expect(hasPassed(at('2026-03-10T12:00:01Z'), NOW)).toBe(false);
  });
});

describe('truncateAddress', () => {
  const a = 'GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA';

  it('keeps both ends so addresses stay distinguishable', () => {
    const short = truncateAddress(a);
    expect(short.startsWith('GAH3D4')).toBe(true);
    expect(short.endsWith('XCA')).toBe(true);
  });

  it('leaves short values alone', () => {
    expect(truncateAddress('GABC')).toBe('GABC');
  });
});

describe('looksLikeAddress', () => {
  it('accepts account and contract addresses', () => {
    expect(looksLikeAddress('GAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA')).toBe(true);
    expect(looksLikeAddress('CD236SGR4CHW3N5WA5REW7CDLCS4ZLDEX6JVEAIHZK7NSN4W7WD7YDAL')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(looksLikeAddress('')).toBe(false);
    expect(looksLikeAddress('GABC')).toBe(false);
    expect(looksLikeAddress('XAH3D4RM45ETE4W7VDRCWZBPRPT63CJXAGXFYVBC2FGANBZTS4OTKXCA')).toBe(false);
  });
});

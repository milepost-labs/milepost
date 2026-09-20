import { describe, it, expect } from 'vitest';
import {
  formatAmount,
  formatExact,
  parseAmount,
  tryParseAmount,
  percentOf,
  STROOPS_PER_UNIT,
} from './amount';

describe('formatAmount', () => {
  it('renders whole units', () => {
    expect(formatAmount(STROOPS_PER_UNIT)).toBe('1.00');
    expect(formatAmount(0n)).toBe('0.00');
  });

  it('groups thousands', () => {
    expect(formatAmount(1_000n * STROOPS_PER_UNIT)).toBe('1,000.00');
    expect(formatAmount(1_234_567n * STROOPS_PER_UNIT, { grouped: false })).toBe('1234567.00');
  });

  it('truncates rather than rounding up', () => {
    // 0.9999999 must not become "1.00" — that invites spending a unit you lack.
    expect(formatAmount(9_999_999n)).toBe('0.99');
    expect(formatAmount(19_999_999n)).toBe('1.99');
  });

  it('handles negatives', () => {
    expect(formatAmount(-STROOPS_PER_UNIT)).toBe('-1.00');
    expect(formatAmount(-1n)).toBe('-0.00');
  });

  it('appends an asset code when asked', () => {
    expect(formatAmount(STROOPS_PER_UNIT, { asset: 'XLM' })).toBe('1.00 XLM');
  });

  it('survives values past Number.MAX_SAFE_INTEGER', () => {
    // 1 billion XLM is 1e16 stroops, past 2^53. Going through Number here is
    // the silent-corruption bug this module exists to prevent, so prove it
    // rather than assert it: the float path loses the trailing stroop.
    const huge = 1_000_000_000n * STROOPS_PER_UNIT + 1n;
    expect(huge > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(BigInt(Number(huge))).not.toBe(huge);

    expect(formatAmount(huge)).toBe('1,000,000,000.00');
    expect(formatExact(huge)).toBe('1000000000.0000001');
  });

  it('rejects an impossible decimal width', () => {
    expect(() => formatAmount(1n, { decimals: 8 })).toThrow(RangeError);
  });
});

describe('formatExact', () => {
  it('keeps every significant digit and drops trailing zeros', () => {
    expect(formatExact(1n)).toBe('0.0000001');
    expect(formatExact(STROOPS_PER_UNIT)).toBe('1');
    expect(formatExact(15_000_000n)).toBe('1.5');
  });
});

describe('parseAmount', () => {
  it('parses plain and decimal input', () => {
    expect(parseAmount('1')).toBe(STROOPS_PER_UNIT);
    expect(parseAmount('1.5')).toBe(15_000_000n);
    expect(parseAmount('0.0000001')).toBe(1n);
    expect(parseAmount('1,000')).toBe(1_000n * STROOPS_PER_UNIT);
  });

  it('round-trips beyond the safe integer range', () => {
    const huge = 1_000_000_000n * STROOPS_PER_UNIT + 1n;
    expect(parseAmount(formatExact(huge))).toBe(huge);
  });

  it('rejects input finer than the asset can represent', () => {
    // Silently dropping the eighth digit would hide a real misunderstanding.
    expect(() => parseAmount('0.00000001')).toThrow(/decimal places/);
  });

  it('rejects malformed thousands grouping', () => {
    // Stripping commas before validating accepted these as 12, 123456 and 5 —
    // numbers nobody typed.
    expect(() => parseAmount('1,,,2')).toThrow(/not a valid number/i);
    expect(() => parseAmount('1,23,456')).toThrow(/not a valid number/i);
    expect(() => parseAmount(',,,5')).toThrow(/not a valid number/i);
    expect(parseAmount('1,234,567')).toBe(1_234_567n * STROOPS_PER_UNIT);
  });

  it('rejects a dangling decimal point', () => {
    expect(() => parseAmount('1.')).toThrow(/after the decimal/i);
    expect(() => parseAmount('.5')).toThrow(/before the decimal/i);
  });

  it('rejects empty, malformed and zero input', () => {
    expect(() => parseAmount('')).toThrow();
    expect(() => parseAmount('   ')).toThrow();
    expect(() => parseAmount('abc')).toThrow();
    expect(() => parseAmount('1.2.3')).toThrow();
    expect(() => parseAmount('-1')).toThrow();
    expect(() => parseAmount('0')).toThrow(/greater than zero/);
  });
});

describe('tryParseAmount', () => {
  it('reports failure instead of throwing', () => {
    expect(tryParseAmount('1.5')).toEqual({ ok: true, value: 15_000_000n });
    const bad = tryParseAmount('nope');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/not a valid number/i);
  });
});

describe('percentOf', () => {
  it('computes progress without integer division collapsing', () => {
    expect(percentOf(1n, 3n)).toBeCloseTo(33.33, 1);
    expect(percentOf(1n, 4n)).toBe(25);
    expect(percentOf(0n, 100n)).toBe(0);
  });

  it('never divides by zero', () => {
    expect(percentOf(5n, 0n)).toBe(0);
  });
});

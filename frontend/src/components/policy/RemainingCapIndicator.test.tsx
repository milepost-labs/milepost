import { describe, expect, it } from 'vitest';
import { formatAmount, percentOf } from '../../lib/amount';
import { formatDateTime, timeUntil } from '../../lib/format';

describe('RemainingCapIndicator logic', () => {
  it('calculates remaining percentage and formats stroops accurately', () => {
    const remaining = 200_0000000n; // 200 XLM
    const cap = 1000_0000000n; // 1000 XLM

    expect(percentOf(remaining, cap)).toBe(20);
    expect(formatAmount(remaining, { asset: 'XLM' })).toBe('200.00 XLM');
    expect(formatAmount(cap, { asset: 'XLM' })).toBe('1,000.00 XLM');
  });

  it('formats reset timestamp using lib/format', () => {
    const windowStart = 1700000000n;
    const period = 86400n;
    const resetTime = Number(windowStart + period);

    expect(formatDateTime(resetTime)).toBeTruthy();
    expect(timeUntil(resetTime)).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';
import { checkXlmForFee, formatNetworkFee, formatXlmStroops, insufficientXlmWarning } from './txFee';

describe('formatXlmStroops & formatNetworkFee', () => {
  it('formats stroops into trimmed XLM decimals', () => {
    expect(formatXlmStroops(0n)).toBe('0');
    expect(formatXlmStroops(100_000n)).toBe('0.01');
    expect(formatXlmStroops(1_250_000n)).toBe('0.125');
    expect(formatXlmStroops(10_000_000n)).toBe('1');
    expect(formatXlmStroops(12_345_678n)).toBe('1.2345678');
  });

  it('builds the standard network fee line', () => {
    expect(formatNetworkFee(100_000n)).toBe('Network fee: about 0.01 XLM');
    expect(formatNetworkFee(250_000n)).toBe('Network fee: about 0.025 XLM');
  });
});

describe('checkXlmForFee', () => {
  it('flags insufficient balance when XLM is below the simulated fee', () => {
    expect(checkXlmForFee(50_000n, 100_000n).insufficient).toBe(true);
    expect(checkXlmForFee(0n, 100_000n).insufficient).toBe(true);
  });

  it('allows signing when XLM equals or exceeds the simulated fee', () => {
    expect(checkXlmForFee(100_000n, 100_000n).insufficient).toBe(false);
    expect(checkXlmForFee(50_000_000n, 100_000n).insufficient).toBe(false);
  });

  it('does not falsely block when balance or fee is unknown', () => {
    expect(checkXlmForFee(null, 100_000n).insufficient).toBe(false);
    expect(checkXlmForFee(50_000n, null).insufficient).toBe(false);
  });
});

describe('insufficientXlmWarning', () => {
  it('mentions Friendbot only when allowed by the network setting', () => {
    const testnetMsg = insufficientXlmWarning(50_000n, 100_000n, true);
    expect(testnetMsg).toContain('0.005 XLM');
    expect(testnetMsg).toContain('0.01 XLM');
    expect(testnetMsg).toContain('Friendbot');

    const mainnetMsg = insufficientXlmWarning(50_000n, 100_000n, false);
    expect(mainnetMsg).toContain('0.005 XLM');
    expect(mainnetMsg).toContain('0.01 XLM');
    expect(mainnetMsg).not.toContain('Friendbot');
  });
});

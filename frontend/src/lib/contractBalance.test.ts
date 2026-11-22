import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BALANCE_DUST,
  balanceDiscrepancy,
  expectedContractBalance,
} from './contractBalance';

describe('expectedContractBalance', () => {
  it('equals total contributed when nothing has left the contract', () => {
    expect(
      expectedContractBalance({
        totalContributed: 80_000_000_000n,
        fee: 800_000_000n,
        totalReleased: 0n,
        totalRefunded: 0n,
        totalSwept: 0n,
        feeSwept: false,
      }),
    ).toBe(80_000_000_000n);
  });

  it('subtracts fee once swept, plus released and refunded amounts', () => {
    expect(
      expectedContractBalance({
        totalContributed: 100_000_000_000n,
        fee: 1_000_000_000n,
        totalReleased: 30_000_000_000n,
        totalRefunded: 10_000_000_000n,
        totalSwept: 0n,
        feeSwept: true,
      }),
    ).toBe(59_000_000_000n);
  });

  it('clamps at zero when sweep_unclaimed drains the entire contract including an unswept fee', () => {
    expect(
      expectedContractBalance({
        totalContributed: 100_000_000_000n,
        fee: 1_000_000_000n,
        totalReleased: 20_000_000_000n,
        totalRefunded: 0n,
        totalSwept: 80_000_000_000n,
        feeSwept: true,
      }),
    ).toBe(0n);
  });
});

describe('balanceDiscrepancy', () => {
  it('returns match when actual equals expected', () => {
    expect(balanceDiscrepancy(50_000n, 50_000n)).toEqual({
      status: 'match',
      diff: 0n,
    });
  });

  it('returns dust when difference is within the dust threshold (above or below)', () => {
    expect(balanceDiscrepancy(50_000n + DEFAULT_BALANCE_DUST, 50_000n)).toEqual({
      status: 'dust',
      diff: DEFAULT_BALANCE_DUST,
    });
    expect(balanceDiscrepancy(50_000n - 1n, 50_000n)).toEqual({
      status: 'dust',
      diff: -1n,
    });
  });

  it('returns mismatch when difference exceeds the dust threshold (surplus or shortfall)', () => {
    expect(balanceDiscrepancy(50_000n + DEFAULT_BALANCE_DUST + 1n, 50_000n)).toEqual({
      status: 'mismatch',
      diff: DEFAULT_BALANCE_DUST + 1n,
    });
    expect(balanceDiscrepancy(40_000n, 50_000n)).toEqual({
      status: 'mismatch',
      diff: -10_000n,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { formatPeriod, summarisePolicy, type PolicyRead } from './policySummary';

const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const POLICY: PolicyRead = {
  cap: 1_000_0000000n,
  period: 86_400n,
  spent: 250_0000000n,
  token: TOKEN,
};

describe('summarisePolicy', () => {
  it('reports a wallet with no policy at all', () => {
    const summary = summarisePolicy({ installed: false, policy: null, remaining: null });

    expect(summary.status).toBe('none');
    expect(summary.sentence).toMatch(/no spend policy/i);
  });

  it('calls a configured but uninstalled policy unprotected', () => {
    const summary = summarisePolicy({ installed: false, policy: POLICY, remaining: 750_0000000n });

    expect(summary.status).toBe('unprotected');
    expect(summary.sentence).toMatch(/^Unprotected:/);
    expect(summary.sentence).toMatch(/not installed/);
  });

  it('flags an installed signer with no rules', () => {
    const summary = summarisePolicy({ installed: true, policy: null, remaining: null });

    expect(summary.status).toBe('no-rules');
    expect(summary.sentence).toMatch(/limits nothing/);
  });

  it('summarises an installed policy in one sentence from the contract values', () => {
    const summary = summarisePolicy({ installed: true, policy: POLICY, remaining: 750_0000000n });

    expect(summary.status).toBe('protected');
    expect(summary.sentence).toBe(
      'Can send up to 1,000.00 of CDLZFC…CYSC to approved payees each day; 750.00 left.',
    );
    expect(summary.remaining).toBe(750_0000000n);
  });

  it('says nothing is left when the remaining cap is zero', () => {
    const summary = summarisePolicy({ installed: true, policy: POLICY, remaining: 0n });

    expect(summary.sentence).toMatch(/nothing left this period\.$/);
    expect(summary.remaining).toBe(0n);
  });
});

describe('formatPeriod', () => {
  it('names whole units', () => {
    expect(formatPeriod(86_400n)).toBe('day');
    expect(formatPeriod(604_800n)).toBe('week');
    expect(formatPeriod(30n * 86_400n)).toBe('30 days');
    expect(formatPeriod(21_600n)).toBe('6 hours');
    expect(formatPeriod(90n)).toBe('90 seconds');
  });
});

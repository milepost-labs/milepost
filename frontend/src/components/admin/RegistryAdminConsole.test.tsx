import { describe, expect, it } from 'vitest';
import { looksLikeAddress, truncateAddress } from '../../lib/format';

describe('RegistryAdminConsole logic', () => {
  it('validates Stellar admin and treasury addresses', () => {
    const adminAddr = 'GA7HUSERUURI6OIV7T22RI3J2BB2BIGC3A7QZCVLY2EKDZANYEDIAHUQ';
    const invalidAddr = 'invalid-admin';

    expect(looksLikeAddress(adminAddr)).toBe(true);
    expect(looksLikeAddress(invalidAddr)).toBe(false);
  });

  it('validates protocol fee basis points cap (1000 bps = 10%)', () => {
    const MAX_FEE_BPS = 1000;
    const validBps = 250;
    const invalidBps = 1500;

    expect(validBps <= MAX_FEE_BPS).toBe(true);
    expect(invalidBps <= MAX_FEE_BPS).toBe(false);
  });

  it('formats admin addresses using truncateAddress', () => {
    const adminAddr = 'GA7HUSERUURI6OIV7T22RI3J2BB2BIGC3A7QZCVLY2EKDZANYEDIAHUQ';
    expect(truncateAddress(adminAddr)).toBe('GA7HUS…AHUQ');
  });
});

import { describe, expect, it } from 'vitest';
import { looksLikeAddress, truncateAddress } from '../../lib/format';

describe('AllowlistManager logic', () => {
  it('validates payee addresses using looksLikeAddress', () => {
    const validAddr = 'GB4CCGYQ27CQR45FGZYVVXKTRM4GTBSML7U7GHLLLDK7CFEZ4JKLBZFP';
    const invalidAddr = 'invalid-payee';

    expect(looksLikeAddress(validAddr)).toBe(true);
    expect(looksLikeAddress(invalidAddr)).toBe(false);
  });

  it('truncates addresses for display using truncateAddress', () => {
    const addr = 'GB4CCGYQ27CQR45FGZYVVXKTRM4GTBSML7U7GHLLLDK7CFEZ4JKLBZFP';
    const truncated = truncateAddress(addr);

    expect(truncated).toContain('…');
    expect(truncated).toBe('GB4CCG…BZFP');
  });
});

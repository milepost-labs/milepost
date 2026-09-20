import { describe, expect, it } from 'vitest';
import { parseAmount, tryParseAmount } from '../../lib/amount';
import { looksLikeAddress } from '../../lib/format';

describe('ConfigurePolicyForm logic', () => {
  it('validates XLM cap conversion to stroops via parseAmount', () => {
    const parsed = tryParseAmount('150.5');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toBe(1505000000n);
      expect(parseAmount('100')).toBe(1000000000n);
    }
  });

  it('validates target wallet and steward Stellar addresses', () => {
    const validAddr = 'GB4CCGYQ27CQR45FGZYVVXKTRM4GTBSML7U7GHLLLDK7CFEZ4JKLBZFP';
    const invalidAddr = 'not-an-address';

    expect(looksLikeAddress(validAddr)).toBe(true);
    expect(looksLikeAddress(invalidAddr)).toBe(false);
  });
});

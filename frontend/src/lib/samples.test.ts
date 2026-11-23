import { describe, expect, it } from 'vitest';
import { samplesEnabled } from './samples';

describe('samplesEnabled', () => {
  it('allows samples only on testnet', () => {
    expect(samplesEnabled({ name: 'testnet' })).toBe(true);
    expect(samplesEnabled({ name: 'mainnet' })).toBe(false);
  });
});

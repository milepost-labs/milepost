import { describe, it, expect } from 'vitest';
import { parseTokenName } from './token';

describe('token name parser (#441)', () => {
  it('identifies native XLM when name is "native"', () => {
    const asset = parseTokenName('native');
    expect(asset.isNative).toBe(true);
    expect(asset.code).toBe('XLM');
    expect(asset.issuer).toBeNull();
  });

  it('identifies native XLM case-insensitively', () => {
    const asset = parseTokenName('NATIVE');
    expect(asset.isNative).toBe(true);
    expect(asset.code).toBe('XLM');
    expect(asset.issuer).toBeNull();
  });

  it('parses issued asset with CODE:ISSUER format', () => {
    const asset = parseTokenName('USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    expect(asset.isNative).toBe(false);
    expect(asset.code).toBe('USDC');
    expect(asset.issuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  });

  it('handles plain asset codes without issuer', () => {
    const asset = parseTokenName('DEMO');
    expect(asset.isNative).toBe(false);
    expect(asset.code).toBe('DEMO');
    expect(asset.issuer).toBeNull();
  });
});

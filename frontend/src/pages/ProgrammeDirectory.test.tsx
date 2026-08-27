import { describe, it, expect } from 'vitest';

describe('Issue #83 — Programme Directory helper logic', () => {
  it('determines correct nonces range from 0 to N-1', () => {
    const nonce = 5n;
    const nonces: bigint[] = [];
    for (let i = 0n; i < nonce; i += 1n) {
      nonces.push(i);
    }
    expect(nonces).toEqual([0n, 1n, 2n, 3n, 4n]);
  });

  it('handles empty registry with 0 nonce', () => {
    const nonce = 0n;
    const nonces: bigint[] = [];
    for (let i = 0n; i < nonce; i += 1n) {
      nonces.push(i);
    }
    expect(nonces.length).toBe(0);
  });
});

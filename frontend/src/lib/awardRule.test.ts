import { describe, expect, it } from 'vitest';
import { awardFromVotes } from './awardRule';

describe('awardFromVotes', () => {
  it('is the median when exactly the quorum has voted', () => {
    expect(awardFromVotes([100n, 300n, 500n], 3)).toBe(300n);
  });

  it('takes the lower middle for an even quorum, never an average', () => {
    expect(awardFromVotes([1_000n, 1_100n], 2)).toBe(1_000n);
  });

  it('counts from the lowest, so votes beyond the quorum can only lower it', () => {
    expect(awardFromVotes([100n, 200n, 300n, 400n, 500n], 3)).toBe(200n);
    expect(awardFromVotes([300n, 100n, 500n, 50n], 3)).toBe(100n);
  });

  it('is null until the quorum is in', () => {
    expect(awardFromVotes([100n, 200n], 3)).toBeNull();
    expect(awardFromVotes([], 0)).toBeNull();
  });
});

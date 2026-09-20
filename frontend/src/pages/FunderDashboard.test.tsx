import { describe, it, expect } from 'vitest';
import { explainCode } from '../lib/errors';

describe('Issue #82 — Cancel programme error explanations and logic', () => {
  it('translates Cancelled (16) into a clear error explanation', () => {
    const explained = explainCode('program', 16);
    expect(explained.kind).toBe('blocked');
    expect(explained.message).toContain('This programme has been cancelled');
  });

  it('translates NotCancellable (17) into a clear error explanation', () => {
    const explained = explainCode('program', 17);
    expect(explained.kind).toBe('denied');
    expect(explained.message).toContain('A programme that holds funds or has made awards cannot be cancelled');
  });
});

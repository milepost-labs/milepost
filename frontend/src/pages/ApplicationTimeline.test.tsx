import { describe, it, expect } from 'vitest';
import { explainCode } from '../lib/errors';

describe('Issue #81 — Withdraw application error explanations and logic', () => {
  it('translates Withdrawn (37) into a clear error explanation', () => {
    const explained = explainCode('program', 37);
    expect(explained.kind).toBe('conflict');
    expect(explained.message).toContain('This application has been withdrawn');
    expect(explained.action).toContain('cannot be reviewed, finalized, or re-applied');
  });

  it('translates AlreadyFinalized (13) into a clear error explanation', () => {
    const explained = explainCode('program', 13);
    expect(explained.kind).toBe('conflict');
  });
});

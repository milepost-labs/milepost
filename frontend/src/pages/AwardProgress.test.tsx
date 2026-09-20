import { describe, it, expect } from 'vitest';
import { explainCode, explain } from '../lib/errors';

describe('Issue #80 — Release tranche error explanations and logic', () => {
  it('translates AttestationInvalid (21) into a clear error explanation', () => {
    const explained = explainCode('program', 21);
    expect(explained.kind).toBe('denied');
    expect(explained.message).toContain('That proof is not valid for this release');
    expect(explained.action).toContain('revoked, expired');
  });

  it('translates AttestationAlreadyUsed (22) into a clear error explanation', () => {
    const explained = explainCode('program', 22);
    expect(explained.kind).toBe('conflict');
    expect(explained.message).toContain('That proof has already released a tranche');
    expect(explained.action).toContain('Each proof unlocks exactly one tranche');
  });

  it('translates ReleaseWindowClosed (23) into a clear error explanation', () => {
    const explained = explainCode('program', 23);
    expect(explained.kind).toBe('blocked');
    expect(explained.message).toContain('The release window for this programme has closed');
  });

  it('translates AwardFullyReleased (20) into a clear error explanation', () => {
    const explained = explainCode('program', 20);
    expect(explained.kind).toBe('none');
    expect(explained.message).toContain('Every tranche of this award has already been released');
  });

  it('translates PolicyNotInstalled (34) into a clear error explanation', () => {
    const explained = explainCode('program', 34);
    expect(explained.kind).toBe('blocked');
    expect(explained.message).toContain('no spend policy installed');
  });

  it('correctly maps raw contract errors using explain', () => {
    const rawError = new Error('HostError: Error(Contract, #22)');
    const explained = explain(rawError, 'program');
    expect(explained.code).toBe(22);
    expect(explained.kind).toBe('conflict');
  });
});

import { describe, expect, it } from 'vitest';
import {
  isHex32Bytes,
  parseProposalParam,
  quorumError,
  tranchesError,
} from './adminFixtures';

const b64 = (value: object) => encodeURIComponent(btoa(JSON.stringify(value)));

describe('adminFixtures', () => {
  it('accepts a well-formed proposal link as pre-fill', () => {
    const encoded = b64({
      name: 'Health worker stipends 2027',
      mode: 'Allocated',
      tranches: 3,
      contact: 'ada@example.org',
      purpose: 'Stipends',
      condition: 'Shifts confirmed',
      verifier: 'GABC',
      amount: '5000',
    });
    const parsed = parseProposalParam(encoded);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.proposal.name).toBe('Health worker stipends 2027');
      expect(parsed.proposal.mode).toBe('Allocated');
      expect(parsed.proposal.tranches).toBe(3);
    }
  });

  it('treats a damaged proposal link as untrusted input, never throwing', () => {
    expect(parseProposalParam('%%not-base64%%')).toEqual({ ok: false, reason: 'damaged' });
    expect(parseProposalParam(null)).toEqual({ ok: false, reason: 'missing' });
    expect(parseProposalParam(b64({ mode: 'Nope', tranches: 99 })).ok).toBe(true);
    const fallback = parseProposalParam(b64({ mode: 'Nope', tranches: 99 }));
    if (fallback.ok) {
      expect(fallback.proposal.mode).toBe('Allocated');
      expect(fallback.proposal.tranches).toBe(3);
    }
  });

  it('bounds quorum to whole numbers from 1 to 16', () => {
    expect(quorumError('3')).toBeNull();
    expect(quorumError('1')).toBeNull();
    expect(quorumError('16')).toBeNull();
    expect(quorumError('0')).toContain('1 to 16');
    expect(quorumError('17')).toContain('1 to 16');
    expect(quorumError('2.5')).toContain('1 to 16');
    expect(quorumError('')).toContain('quorum');
  });

  it('requires at least one tranche', () => {
    expect(tranchesError('3')).toBeNull();
    expect(tranchesError('0')).toContain('one tranche');
    expect(tranchesError('')).toContain('tranches');
  });

  it('validates 32-byte hex schema UIDs', () => {
    expect(isHex32Bytes('ab'.repeat(32))).toBe(true);
    expect(isHex32Bytes(`0x${'ab'.repeat(32)}`)).toBe(true);
    expect(isHex32Bytes('condition-met/v1')).toBe(false);
    expect(isHex32Bytes('')).toBe(false);
  });
});

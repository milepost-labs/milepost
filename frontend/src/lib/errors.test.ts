import { describe, it, expect } from 'vitest';
import {
  extractCode,
  explain,
  explainCode,
  formatErrorDetails,
  isFailure,
  type Explained,
} from './errors';

// ── extractCode ──────────────────────────────────────────────────────────────

describe('extractCode', () => {
  it('extracts a code from the canonical Soroban error format', () => {
    expect(extractCode(new Error('Error(Contract, #14)'))).toBe(14);
  });

  it('extracts a code from the short #N form', () => {
    expect(extractCode(new Error('contract error #3)'))).toBe(3);
  });

  it('returns null for a plain network error', () => {
    expect(extractCode(new Error('Failed to fetch'))).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(extractCode(null)).toBeNull();
    expect(extractCode(undefined)).toBeNull();
  });

  it('handles a raw string', () => {
    expect(extractCode('Error(Contract, #22)')).toBe(22);
  });

  it('handles an object with a message field', () => {
    expect(extractCode({ code: 9, message: 'Error(Contract, #9)' })).toBe(9);
  });
});

// ── explainCode ──────────────────────────────────────────────────────────────

describe('explainCode', () => {
  it('translates a known program code', () => {
    const result = explainCode('program', 2);
    expect(result.kind).toBe('blocked');
    expect(result.code).toBe(2);
    expect(result.contract).toBe('program');
    expect(result.message).toMatch(/window/i);
  });

  it('returns the unknown fallback for an unrecognised code', () => {
    const result = explainCode('program', 9999);
    expect(result.kind).toBe('fault');
    expect(result.code).toBe(9999);
    expect(result.contract).toBe('program');
  });

  it('translates a known registry code', () => {
    const result = explainCode('registry', 1);
    expect(result.kind).toBe('denied');
    expect(result.contract).toBe('registry');
  });

  it('translates the registry setup error', () => {
    const result = explainCode('registry', 3);
    expect(result.kind).toBe('fault');
    expect(result.contract).toBe('registry');
    expect(result.message).toMatch(/set up/i);
  });
});

// ── explain ──────────────────────────────────────────────────────────────────

describe('explain', () => {
  it('recognises a user-declined signature', () => {
    const result = explain(new Error('user declined the request'));
    expect(result.kind).toBe('none');
    expect(result.message).toMatch(/declined/i);
  });

  it('recognises a network failure', () => {
    const result = explain(new Error('Failed to fetch'));
    expect(result.kind).toBe('fault');
    expect(result.message).toMatch(/network/i);
  });

  it('translates a contract error by default to program', () => {
    const result = explain(new Error('Error(Contract, #14)'));
    expect(result.code).toBe(14);
    expect(result.contract).toBe('program');
  });

  it('uses the supplied contract name', () => {
    const result = explain(new Error('Error(Contract, #1)'), 'registry');
    expect(result.contract).toBe('registry');
    expect(result.kind).toBe('denied');
  });

  it('returns the unknown fallback for an unrecognised error', () => {
    const result = explain(new Error('something totally unexpected'));
    expect(result.kind).toBe('fault');
    expect(result.contract).toBeUndefined();
  });
});

// ── isFailure ────────────────────────────────────────────────────────────────

describe('isFailure', () => {
  it('returns false for kind "none"', () => {
    expect(isFailure({ kind: 'none', message: 'ok' })).toBe(false);
  });

  it('returns true for kind "fault"', () => {
    expect(isFailure({ kind: 'fault', message: 'bad' })).toBe(true);
  });
});

// ── formatErrorDetails ───────────────────────────────────────────────────────

const TIME = new Date('2026-10-18T10:00:00.000Z');
const CTX = { route: '/programme/42', time: TIME };

describe('formatErrorDetails — contract error', () => {
  const contractError: Explained = {
    kind: 'blocked',
    message: 'The window for this action is not open.',
    action: 'Check the programme timeline.',
    code: 2,
    contract: 'program',
  };

  it('includes the human message', () => {
    const text = formatErrorDetails(contractError, CTX);
    expect(text).toContain('Message: The window for this action is not open.');
  });

  it('includes the contract name', () => {
    expect(formatErrorDetails(contractError, CTX)).toContain('Contract: program');
  });

  it('includes the error code', () => {
    expect(formatErrorDetails(contractError, CTX)).toContain('Error code: 2');
  });

  it('includes the route', () => {
    expect(formatErrorDetails(contractError, CTX)).toContain('Route: /programme/42');
  });

  it('includes the ISO timestamp', () => {
    expect(formatErrorDetails(contractError, CTX)).toContain('Time: 2026-10-18T10:00:00.000Z');
  });

  it('does not include the action text (not part of the copied details)', () => {
    const text = formatErrorDetails(contractError, CTX);
    expect(text).not.toContain('Check the programme timeline.');
  });
});

describe('formatErrorDetails — non-contract error', () => {
  const networkError: Explained = {
    kind: 'fault',
    message: 'Could not reach the network.',
    action: 'Check your connection and try again.',
  };

  it('includes the message', () => {
    expect(formatErrorDetails(networkError, CTX)).toContain('Message: Could not reach the network.');
  });

  it('does not include Contract or Error code lines when contract is absent', () => {
    const text = formatErrorDetails(networkError, CTX);
    expect(text).not.toContain('Contract:');
    expect(text).not.toContain('Error code:');
  });

  it('still includes route and time', () => {
    const text = formatErrorDetails(networkError, CTX);
    expect(text).toContain('Route: /programme/42');
    expect(text).toContain('Time: 2026-10-18T10:00:00.000Z');
  });
});

describe('formatErrorDetails — XDR and key safety', () => {
  const XDR_PAYLOAD =
    'AAAAAgAAAABSBu0RAAAAAAAAAAAAAQAAAAAAAAAAAAAAAQAAAAEAAAABAAAAEAAAAQAAAAEAAAAAAAAAAAAAAAB';
  const SECRET_KEY = 'SCZANGBA5TICFCBMQ5AO7TS6SDHILYQ5TIQXC7W7JXBXPLR2MLNMGMU';

  it('never includes an XDR payload — formatErrorDetails only uses Explained, not the raw error', () => {
    // Even if the raw thrown value carried XDR, formatErrorDetails receives only
    // the curated Explained; the XDR has no path into the output.
    const explained: Explained = {
      kind: 'fault',
      message: 'Something went wrong that we do not have a specific explanation for.',
      contract: 'program',
      code: 99,
    };
    const text = formatErrorDetails(explained, CTX);
    expect(text).not.toContain(XDR_PAYLOAD);
    expect(text).not.toContain('AAAAA'); // XDR base64 prefix
  });

  it('never includes a secret key in the output', () => {
    const explained: Explained = {
      kind: 'fault',
      message: 'Something went wrong that we do not have a specific explanation for.',
    };
    const text = formatErrorDetails(explained, CTX);
    expect(text).not.toContain(SECRET_KEY);
    expect(text).not.toContain('SCZANG');
  });

  it('output is limited to the five labelled fields', () => {
    const explained: Explained = {
      kind: 'blocked',
      message: 'Test message.',
      code: 5,
      contract: 'attest',
    };
    const lines = formatErrorDetails(explained, CTX).split('\n');
    expect(lines).toHaveLength(5);
    const labels = lines.map((l) => l.split(':')[0]);
    expect(labels).toEqual(['Message', 'Contract', 'Error code', 'Route', 'Time']);
  });
});

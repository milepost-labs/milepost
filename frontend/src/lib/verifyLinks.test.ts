import { beforeEach, describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import {
  forgetRequest,
  loadRequests,
  loadSigned,
  parseReply,
  parseRequest,
  referenceHash,
  rememberRequest,
  rememberSigned,
  replyPath,
  REQUEST_NOTE_MAX,
  requestPath,
} from './verifyLinks';

const PROGRAMME = `CPRG${'C'.repeat(52)}`;
const RECIPIENT = `GREC${'B'.repeat(52)}`;
const ATTESTER = `GATT${'A'.repeat(52)}`;
const UID = 'ab'.repeat(32);

function query(path: string) {
  return new URLSearchParams(path.split('?')[1]);
}

beforeEach(() => window.localStorage.clear());

describe('request links', () => {
  it('round-trips a request, note included', () => {
    const path = requestPath({ programmeId: PROGRAMME, recipient: RECIPIENT, tranche: 2, note: 'Plot 14 & ward 3' });
    expect(path.startsWith('/verifiers?')).toBe(true);
    expect(parseRequest(query(path))).toEqual({
      programmeId: PROGRAMME,
      recipient: RECIPIENT,
      tranche: 2,
      note: 'Plot 14 & ward 3',
    });
  });

  it('leaves out an empty note and an unknown tranche', () => {
    const path = requestPath({ programmeId: PROGRAMME, recipient: RECIPIENT, tranche: null, note: '  ' });
    expect(query(path).has('note')).toBe(false);
    expect(query(path).has('tranche')).toBe(false);
  });

  it('refuses a link without a real programme and recipient', () => {
    expect(parseRequest(new URLSearchParams({ programme: PROGRAMME }))).toBeNull();
    expect(parseRequest(new URLSearchParams({ programme: 'nope', recipient: RECIPIENT }))).toBeNull();
    expect(parseRequest(new URLSearchParams({ programme: PROGRAMME, recipient: 'G123' }))).toBeNull();
  });

  it('drops a malformed tranche and cleans the note', () => {
    const parsed = parseRequest(
      new URLSearchParams({
        programme: PROGRAMME,
        recipient: RECIPIENT,
        tranche: '0',
        note: `line one\nline two${'x'.repeat(400)}`,
      }),
    );
    expect(parsed?.tranche).toBeNull();
    expect(parsed?.note.startsWith('line one line two')).toBe(true);
    expect(parsed?.note).toHaveLength(REQUEST_NOTE_MAX);
  });
});

describe('reply links', () => {
  it('round-trips a reply', () => {
    const path = replyPath({ programmeId: PROGRAMME, attestation: UID, attester: ATTESTER });
    expect(path.startsWith('/recipients?')).toBe(true);
    expect(parseReply(query(path))).toEqual({ programmeId: PROGRAMME, attestation: UID, attester: ATTESTER });
  });

  it('accepts upper-case and 0x ids, and refuses short ones', () => {
    const params = new URLSearchParams({ release: PROGRAMME, attestation: `0x${UID.toUpperCase()}`, attester: ATTESTER });
    expect(parseReply(params)?.attestation).toBe(UID);
    params.set('attestation', 'abc');
    expect(parseReply(params)).toBeNull();
  });
});

describe('referenceHash', () => {
  it('is 32 zero bytes with no reference', async () => {
    expect((await referenceHash('   ')).equals(Buffer.alloc(32))).toBe(true);
  });

  it('is the SHA-256 of the trimmed reference', async () => {
    const expected = Buffer.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('VR-2291'))),
    );
    expect((await referenceHash('  VR-2291 ')).equals(expected)).toBe(true);
  });
});

describe('this browser’s memory', () => {
  it('remembers a request once, keeping when it was first opened', () => {
    const request = { programmeId: PROGRAMME, recipient: RECIPIENT, tranche: 2, note: '' };
    rememberRequest(request, 1000);
    rememberRequest({ ...request, note: 'again' }, 5000);
    const list = loadRequests();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ openedAt: 1000, note: 'again' });
    expect(forgetRequest(request)).toEqual([]);
  });

  it('ignores storage it cannot read', () => {
    window.localStorage.setItem('milepost.verify.requests', '{not json');
    expect(loadRequests()).toEqual([]);
  });

  it('keeps signed attestations per attester', () => {
    rememberSigned({ uid: UID, programmeId: PROGRAMME, recipient: RECIPIENT, attester: ATTESTER, tranche: 2, signedAt: 1 });
    expect(loadSigned(ATTESTER)).toHaveLength(1);
    expect(loadSigned(RECIPIENT)).toEqual([]);
  });
});

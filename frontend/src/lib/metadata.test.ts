import { describe, expect, it } from 'vitest';
import {
  MAX_METADATA_BYTES,
  MetadataError,
  canonicalize,
  checkDocumentText,
  metadataHash,
  publishMetadata,
  resolveMetadata,
  validateMetadata,
  type ProgrammeMetadata,
} from './metadata';
import { handleMetadataRequest, memoryBackend } from './metadataStore';

// The worked example in docs/programme-metadata.md, with its published hash.
const WORKED_EXAMPLE = {
  schema_version: '1.0.0',
  name: "Lambani Girls' Term 2 Bursary",
  description: 'Ten termly bursaries for students at Lambani Secondary, paid on enrolment attestation.',
  vertical: 'education',
  language: 'en',
  contact: { name: 'Lambani Community Trust', email: 'grants@lambanitrust.example' },
  links: [
    { label: 'Prospectus', url: 'https://lambanitrust.example/prospectus.pdf' },
    { label: 'Audited budget', url: 'https://lambanitrust.example/budget-2026.pdf' },
  ],
};
const WORKED_HASH = '0dce7b1e6c419ba23f27b9d1ab3deef938938fb4edab8d71d82aa16a7d7305ca';

const VERIFIER = `GVER${'A'.repeat(52)}`;

function doc(overrides: Partial<ProgrammeMetadata> = {}): ProgrammeMetadata {
  return {
    schema_version: '1.1.0',
    name: 'Kano clinic stipends',
    description: 'Monthly stipends for community nurses, paid on confirmed shifts.',
    vertical: 'health',
    contact: { name: 'Kano Health Trust', email: 'grants@kanotrust.example' },
    labels: [{ address: VERIFIER, role: 'verifier', label: 'District clinic lead' }],
    ...overrides,
  };
}

/** A fetch that talks to the store handler, as the deployed function would. */
function storeFetch(backend = memoryBackend()) {
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handleMetadataRequest(new Request(new URL(String(input), 'http://localhost'), init), backend)) as typeof fetch;
  return { fetcher, backend };
}

describe('canonical hashing', () => {
  it('reproduces the worked example in the spec', async () => {
    expect(await metadataHash(WORKED_EXAMPLE)).toBe(WORKED_HASH);
  });

  it('sorts keys at every depth, inside arrays too, with no whitespace', () => {
    expect(canonicalize({ b: [{ z: 1, a: 2 }], a: { y: true, x: null } })).toBe('{"a":{"x":null,"y":true},"b":[{"a":2,"z":1}]}');
  });

  it('gives the same hash whatever order the keys were written in', async () => {
    const reordered = JSON.parse(JSON.stringify(WORKED_EXAMPLE, Object.keys(WORKED_EXAMPLE).reverse()));
    expect(await metadataHash({ ...reordered, contact: WORKED_EXAMPLE.contact, links: WORKED_EXAMPLE.links })).toBe(WORKED_HASH);
  });

  it('produces identical canonical output and hash for nested arrays with reordered keys and undefined fields', async () => {
    const a = {
      outer: [
        [{ z: 1, a: 2, skip: undefined }, { y: [true, { d: 4, c: 3 }] }],
      ],
    };
    const b = {
      outer: [
        [{ a: 2, z: 1 }, { y: [true, { c: 3, d: 4 }] }],
      ],
    };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(await metadataHash(a)).toBe(await metadataHash(b));
  });
});

describe('validateMetadata', () => {
  it('accepts a complete document with labels', () => {
    expect(validateMetadata(doc()).ok).toBe(true);
    expect(validateMetadata(WORKED_EXAMPLE).ok).toBe(true);
  });

  it('refuses missing required fields, unknown fields and bad labels', () => {
    expect(validateMetadata({ ...doc(), description: '' })).toEqual({ ok: false, error: 'description is required.' });
    expect(validateMetadata({ ...doc(), recipients: [] }).ok).toBe(false);
    expect(validateMetadata(doc({ contact: { name: 'x', email: 'not-an-email' } })).ok).toBe(false);
    expect(validateMetadata(doc({ links: [{ label: 'x', url: 'http://insecure.example' }] })).ok).toBe(false);
    expect(validateMetadata(doc({ labels: [{ address: 'nope', role: 'verifier', label: 'x' }] })).ok).toBe(false);
    expect(
      validateMetadata(
        doc({
          labels: [
            { address: VERIFIER, role: 'verifier', label: 'a' },
            { address: VERIFIER, role: 'verifier', label: 'b' },
          ],
        }),
      ).ok,
    ).toBe(false);
  });
});

describe('the store', () => {
  it('stores a document under its own hash and serves it back unchanged', async () => {
    const { fetcher, backend } = storeFetch();
    const hash = await publishMetadata(doc(), fetcher);
    expect(hash).toBe(await metadataHash(doc()));
    expect(backend.entries.get(hash)).toBe(canonicalize(doc()));

    const again = await fetcher(`/api/metadata?hash=${hash}`);
    expect(again.headers.get('cache-control')).toContain('immutable');
    expect(await resolveMetadata(hash, fetcher)).toEqual({ status: 'ok', doc: JSON.parse(canonicalize(doc())) });
  });

  it('is content-addressed: storing the same document twice changes nothing', async () => {
    const { fetcher, backend } = storeFetch();
    await publishMetadata(doc(), fetcher);
    const second = await fetcher('/api/metadata', { method: 'POST', body: JSON.stringify(doc()) });
    expect(second.status).toBe(200);
    expect(backend.entries.size).toBe(1);
  });

  it('refuses invalid and oversized documents before storing anything', async () => {
    const { fetcher, backend } = storeFetch();
    const bad = await fetcher('/api/metadata', { method: 'POST', body: JSON.stringify({ name: 'x' }) });
    expect(bad.status).toBe(422);
    const big = await fetcher('/api/metadata', {
      method: 'POST',
      body: JSON.stringify(doc({ description: 'x'.repeat(20_000) })),
    });
    expect(big.status).toBe(413);
    expect(backend.entries.size).toBe(0);
  });

  it('answers 404 for an unknown hash, and refuses a malformed one', async () => {
    const { fetcher } = storeFetch();
    expect(await resolveMetadata('ab'.repeat(32), fetcher)).toEqual({ status: 'missing' });
    expect((await fetcher('/api/metadata?hash=nope')).status).toBe(400);
  });
});

describe('resolveMetadata', () => {
  it('treats a zero hash as no document, without asking the store', async () => {
    let asked = false;
    const fetcher = (async () => {
      asked = true;
      return new Response('');
    }) as typeof fetch;
    expect(await resolveMetadata('0'.repeat(64), fetcher)).toEqual({ status: 'none' });
    expect(asked).toBe(false);
  });

  it('refuses a document that does not hash to the commitment', async () => {
    const { fetcher, backend } = storeFetch();
    const hash = await publishMetadata(doc(), fetcher);
    backend.entries.set(hash, canonicalize(doc({ name: 'Someone else’s words' })));
    const result = await resolveMetadata(hash, fetcher);
    expect(result.status).toBe('mismatch');
  });

  it('says the store is unreachable rather than inventing anything', async () => {
    const fetcher = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect((await resolveMetadata('ab'.repeat(32), fetcher)).status).toBe('unavailable');
  });
});

describe('validateMetadata thorough field and limit checks', () => {
  it('refuses non-object roots and unknown top-level fields', () => {
    expect(validateMetadata(null)).toEqual({ ok: false, error: 'The document must be a JSON object.' });
    expect(validateMetadata([])).toEqual({ ok: false, error: 'The document must be a JSON object.' });
    expect(validateMetadata('text')).toEqual({ ok: false, error: 'The document must be a JSON object.' });
    expect(validateMetadata({ ...doc(), extra: true })).toEqual({ ok: false, error: 'Unknown field “extra”.' });
  });

  it('refuses missing, non-string, whitespace-only, and over-length text fields', () => {
    for (const field of ['schema_version', 'name', 'description', 'vertical'] as const) {
      expect(validateMetadata({ ...doc(), [field]: '   ' })).toEqual({ ok: false, error: `${field} is required.` });
      expect(validateMetadata({ ...doc(), [field]: 42 })).toEqual({ ok: false, error: `${field} must be text.` });
    }
    expect(validateMetadata({ ...doc(), schema_version: 'x'.repeat(21) }).ok).toBe(false);
    expect(validateMetadata({ ...doc(), name: 'x'.repeat(201) }).ok).toBe(false);
    expect(validateMetadata({ ...doc(), description: 'x'.repeat(2001) }).ok).toBe(false);
    expect(validateMetadata({ ...doc(), vertical: 'x'.repeat(41) }).ok).toBe(false);

    // language is optional when omitted or blank, but refused if non-string or too long.
    expect(validateMetadata(doc({ language: '' })).ok).toBe(true);
    expect(validateMetadata({ ...doc(), language: 123 })).toEqual({ ok: false, error: 'language must be text.' });
    expect(validateMetadata(doc({ language: 'x'.repeat(36) })).ok).toBe(false);
  });

  it('refuses invalid contact fields and non-https contact.url', () => {
    expect(validateMetadata({ ...doc(), contact: null })).toEqual({ ok: false, error: 'contact is required.' });
    expect(validateMetadata({ ...doc(), contact: [] })).toEqual({ ok: false, error: 'contact is required.' });
    expect(validateMetadata({ ...doc(), contact: { name: 'A', email: 'a@b.co', phone: '123' } })).toEqual({
      ok: false,
      error: 'contact has an unknown field.',
    });
    expect(validateMetadata(doc({ contact: { name: '', email: 'a@b.co' } })).ok).toBe(false);
    expect(validateMetadata(doc({ contact: { name: 'A', email: '' } })).ok).toBe(false);
    expect(validateMetadata(doc({ contact: { name: 'A', email: 'a@b.co', url: 'http://insecure.example' } })).ok).toBe(false);
    expect(validateMetadata(doc({ contact: { name: 'A', email: 'a@b.co', url: 'not-a-url' } })).ok).toBe(false);
    expect(validateMetadata(doc({ contact: { name: 'A', email: 'a@b.co', url: 'https://kanotrust.example' } })).ok).toBe(true);
  });

  it('refuses malformed links, too many links, and non-https link urls', () => {
    expect(validateMetadata({ ...doc(), links: 'nope' })).toEqual({ ok: false, error: 'links must be a list.' });
    expect(
      validateMetadata(doc({ links: Array.from({ length: 11 }, (_, i) => ({ label: `L${i}`, url: 'https://a.example' })) })),
    ).toEqual({ ok: false, error: 'At most 10 links.' });
    expect(validateMetadata({ ...doc(), links: [null] })).toEqual({ ok: false, error: 'Each link must be an object.' });
    expect(validateMetadata({ ...doc(), links: [{ label: 'Site', url: 'https://a.example', extra: 1 }] })).toEqual({
      ok: false,
      error: 'A link has an unknown field.',
    });
    expect(validateMetadata(doc({ links: [{ label: '   ', url: 'https://a.example' }] })).ok).toBe(false);
    expect(validateMetadata(doc({ links: [{ label: 'FTP', url: 'ftp://a.example' }] })).ok).toBe(false);
    expect(validateMetadata(doc({ links: [{ label: 'Bad', url: 'not a url' }] })).ok).toBe(false);
  });

  it('refuses malformed labels, invalid roles, and duplicate (role, address) pairs while allowing different roles', () => {
    expect(validateMetadata({ ...doc(), labels: 'nope' })).toEqual({ ok: false, error: 'labels must be a list.' });
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const addr = (i: number) => `G${'A'.repeat(53)}${alphabet[Math.floor(i / 32)]}${alphabet[i % 32]}`;

    expect(
      validateMetadata(
        doc({
          labels: Array.from({ length: 65 }, (_, i) => ({ address: addr(i), role: 'verifier', label: `V${i}` })),
        }),
      ),
    ).toEqual({ ok: false, error: 'At most 64 labels.' });

    expect(validateMetadata({ ...doc(), labels: [[]] })).toEqual({ ok: false, error: 'Each label must be an object.' });
    expect(validateMetadata({ ...doc(), labels: [{ address: VERIFIER, role: 'verifier', label: 'X', extra: 1 }] })).toEqual({
      ok: false,
      error: 'A label has an unknown field.',
    });
    expect(
      validateMetadata({ ...doc(), labels: [{ address: VERIFIER, role: 'admin', label: 'X' }] }),
    ).toEqual({ ok: false, error: 'A label’s role must be reviewer, verifier or payee.' });
    expect(validateMetadata(doc({ labels: [{ address: VERIFIER, role: 'verifier', label: '' }] })).ok).toBe(false);

    // Same address with two different roles is allowed; same role twice is refused.
    expect(
      validateMetadata(
        doc({
          labels: [
            { address: VERIFIER, role: 'verifier', label: 'Lead verifier' },
            { address: VERIFIER, role: 'reviewer', label: 'Lead reviewer' },
          ],
        }),
      ).ok,
    ).toBe(true);
    expect(
      validateMetadata(
        doc({
          labels: [
            { address: VERIFIER, role: 'verifier', label: 'A' },
            { address: VERIFIER, role: 'verifier', label: 'B' },
          ],
        }),
      ),
    ).toEqual({ ok: false, error: 'An address is labelled twice for the same role.' });
  });
});

describe('publishMetadata and checkDocumentText edge cases', () => {
  it('refuses a valid document whose canonical JSON exceeds the 16 KB limit', async () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const addr = (i: number) => `G${'A'.repeat(53)}${alphabet[Math.floor(i / 32)]}${alphabet[i % 32]}`;
    const oversized = doc({
      description: 'd'.repeat(2000),
      links: Array.from({ length: 10 }, (_, i) => ({
        label: `Link ${i} ${'l'.repeat(100)}`,
        url: `https://example.org/${'p'.repeat(450)}`,
      })),
      labels: Array.from({ length: 64 }, (_, i) => ({
        address: addr(i),
        role: 'verifier',
        label: `Verifier ${i} ${'v'.repeat(60)}`,
      })),
    });

    expect(validateMetadata(oversized).ok).toBe(true);
    expect(new TextEncoder().encode(canonicalize(oversized)).length).toBeGreaterThan(MAX_METADATA_BYTES);

    await expect(publishMetadata(oversized)).rejects.toThrow(MetadataError);
    await expect(publishMetadata(oversized)).rejects.toThrow('The description is too long to store.');
  });

  it('rejects on network error, store error status, or mismatched returned hash', async () => {
    const down = (async () => {
      throw new TypeError('network down');
    }) as typeof fetch;
    await expect(publishMetadata(doc(), down)).rejects.toThrow('Could not reach the description store.');

    const errResp = (async () =>
      new Response(JSON.stringify({ error: 'Rejected by store' }), { status: 422 })) as typeof fetch;
    await expect(publishMetadata(doc(), errResp)).rejects.toThrow('Rejected by store');

    const badHash = (async () =>
      new Response(JSON.stringify({ hash: 'f'.repeat(64) }), { status: 200 })) as typeof fetch;
    await expect(publishMetadata(doc(), badHash)).rejects.toThrow('The description store returned a different hash.');
  });

  it('handles malformed hashes, 500s, invalid JSON, hash mismatches, and missing required fields on read', async () => {
    let called = false;
    const spyFetch = (async () => {
      called = true;
      return new Response('');
    }) as typeof fetch;
    expect(await resolveMetadata('not-a-hex-hash', spyFetch)).toEqual({ status: 'none' });
    expect(called).toBe(false);

    const serverErr = (async () => new Response('fail', { status: 503 })) as typeof fetch;
    expect(await resolveMetadata('AB'.repeat(32), serverErr)).toEqual({
      status: 'unavailable',
      reason: 'The description store answered 503.',
    });

    expect(await checkDocumentText('{not json', 'ab'.repeat(32))).toEqual({
      status: 'malformed',
      reason: 'The document is not valid JSON.',
    });

    const partial = { schema_version: '1.1.0' };
    const partialHash = await metadataHash(partial);
    expect(await checkDocumentText(JSON.stringify(partial), partialHash)).toEqual({
      status: 'malformed',
      reason: 'Required field “name” is missing.',
    });

    const otherHash = await metadataHash(doc({ name: 'Different' }));
    expect((await checkDocumentText(canonicalize(doc()), otherHash)).status).toBe('mismatch');
  });
});

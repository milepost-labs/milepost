import { describe, expect, it } from 'vitest';
import {
  canonicalize,
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

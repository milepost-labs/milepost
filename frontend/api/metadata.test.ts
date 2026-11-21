import { afterEach, describe, expect, it, vi } from 'vitest';

// `api/metadata.ts`'s `backend` talks to Vercel Blob through `head`/`fetch`/`put`.
// Mocked here so these tests never touch the network, per the project's rule
// that nothing may touch the network in tests.
class MockBlobNotFoundError extends Error {}

const mockHead = vi.fn();
const mockPut = vi.fn();

vi.mock('@vercel/blob', () => ({
  head: mockHead,
  put: mockPut,
  BlobNotFoundError: MockBlobNotFoundError,
}));

import { GET, POST } from './metadata.js';

const HASH = 'a'.repeat(64);
const CANONICAL = '{"name":"stored doc"}';

function request(method: string, url: string, body?: string) {
  return new Request(url, {
    method,
    headers: body
      ? { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(body).length) }
      : undefined,
    body,
  });
}

afterEach(() => {
  mockHead.mockReset();
  mockPut.mockReset();
  vi.unstubAllGlobals();
});

describe('GET /api/metadata — Blob backend', () => {
  it('answers a stored hash by reading through head() then fetch()', async () => {
    mockHead.mockResolvedValue({ url: 'https://blob.example/metadata/x.json' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(CANONICAL, { status: 200 })),
    );

    const res = await GET(request('GET', `http://localhost/api/metadata?hash=${HASH}`));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CANONICAL);
    expect(mockHead).toHaveBeenCalledWith(`metadata/${HASH}.json`);
  });

  it('answers 404 for a hash Blob has never heard of', async () => {
    mockHead.mockRejectedValue(new MockBlobNotFoundError('not found'));

    const res = await GET(request('GET', `http://localhost/api/metadata?hash=${HASH}`));

    expect(res.status).toBe(404);
  });

  it('turns a Blob failure into a clean error response, not a crash', async () => {
    // Not a BlobNotFoundError: head() itself failing (service error, bad
    // credentials, ...), which the shared handler maps to 503.
    mockHead.mockRejectedValue(new Error('blob service unavailable'));

    const res = await GET(request('GET', `http://localhost/api/metadata?hash=${HASH}`));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/could not be read/i);
  });
});

describe('POST /api/metadata — Blob backend', () => {
  it('stores a new document at its content-addressed path', async () => {
    mockHead.mockRejectedValue(new MockBlobNotFoundError('not found'));
    mockPut.mockResolvedValue(undefined);

    const doc = JSON.stringify({
      schema_version: '1.1.0',
      name: 'Test programme',
      description: 'A programme used only in this test.',
      vertical: 'health',
      contact: { name: 'Tester', email: 'test@example.com' },
    });

    const res = await POST(request('POST', 'http://localhost/api/metadata', doc));

    expect(res.status).toBe(201);
    const body = (await res.json()) as { hash: string };
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(mockPut).toHaveBeenCalledWith(
      `metadata/${body.hash}.json`,
      expect.any(String),
      expect.objectContaining({ access: 'public', addRandomSuffix: false }),
    );
  });

  it('turns a Blob write failure into a clean error response, not a crash', async () => {
    mockHead.mockRejectedValue(new MockBlobNotFoundError('not found'));
    mockPut.mockRejectedValue(new Error('blob service unavailable'));

    const doc = JSON.stringify({
      schema_version: '1.1.0',
      name: 'Test programme',
      description: 'A programme used only in this test.',
      vertical: 'health',
      contact: { name: 'Tester', email: 'test@example.com' },
    });

    const res = await POST(request('POST', 'http://localhost/api/metadata', doc));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/could not be written/i);
  });
});

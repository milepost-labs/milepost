import { MAX_METADATA_BYTES, canonicalize, isMetadataHash, sha256Hex, validateMetadata } from './metadata.js';

/**
 * The metadata store's request handling, apart from where bytes are kept, so
 * the Vercel function, the dev server and the tests share it.
 *
 * - `GET ?hash=<64 hex>` answers the stored canonical document, or 404.
 * - `POST` with a document validates it, stores its canonical bytes under
 *   their own SHA-256, and answers the hash. Content-addressed, so storing the
 *   same document twice is harmless and nothing can be overwritten.
 */
export interface MetadataBackend {
  get(hash: string): Promise<string | null>;
  put(hash: string, canonical: string): Promise<void>;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export async function handleMetadataRequest(request: Request, backend: MetadataBackend): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const hash = (url.searchParams.get('hash') ?? '').toLowerCase();
    if (!isMetadataHash(hash)) return json(400, { error: 'Ask for a document by its 64-character hash.' });
    let stored: string | null;
    try {
      stored = await backend.get(hash);
    } catch {
      return json(503, { error: 'The store could not be read.' });
    }
    if (stored === null) return json(404, { error: 'No document with that hash.' });
    // Content-addressed: the bytes behind a hash never change.
    return new Response(stored, {
      status: 200,
      headers: { ...JSON_HEADERS, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }

  if (request.method === 'POST') {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_METADATA_BYTES) return json(413, { error: 'The document is too large.' });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_METADATA_BYTES) return json(413, { error: 'The document is too large.' });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json(400, { error: 'The body is not JSON.' });
    }
    const check = validateMetadata(parsed);
    if (!check.ok) return json(422, { error: check.error });

    const canonical = canonicalize(check.doc);
    const hash = await sha256Hex(canonical);
    try {
      if ((await backend.get(hash)) === null) {
        await backend.put(hash, canonical);
        return json(201, { hash });
      }
    } catch {
      return json(503, { error: 'The store could not be written.' });
    }
    return json(200, { hash });
  }

  return json(405, { error: 'Use GET or POST.' }, { allow: 'GET, POST' });
}

/** An in-memory backend, for tests and the local dev server. */
export function memoryBackend(seed: Record<string, string> = {}): MetadataBackend & { entries: Map<string, string> } {
  const entries = new Map(Object.entries(seed));
  return {
    entries,
    get: async (hash) => entries.get(hash) ?? null,
    put: async (hash, canonical) => {
      entries.set(hash, canonical);
    },
  };
}

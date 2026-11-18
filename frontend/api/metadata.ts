import { BlobNotFoundError, head, put } from '@vercel/blob';
import { handleMetadataRequest, type MetadataBackend } from '../src/lib/metadataStore.js';

/**
 * `/api/metadata`: the programme metadata store (see `src/lib/metadataStore.ts`
 * for the rules). Documents live in Vercel Blob at `metadata/<hash>.json`,
 * public and content-addressed. The browser never talks to Blob directly: it
 * reads through this function, so the page's connect-src stays 'self'.
 *
 * Needs `BLOB_READ_WRITE_TOKEN`, which Vercel adds when a Blob store is
 * connected to the project.
 */
const pathFor = (hash: string) => `metadata/${hash}.json`;

const backend: MetadataBackend = {
  async get(hash) {
    try {
      const blob = await head(pathFor(hash));
      const response = await fetch(blob.url);
      if (!response.ok) throw new Error(`blob read ${response.status}`);
      return await response.text();
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },
  async put(hash, canonical) {
    await put(pathFor(hash), canonical, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 31_536_000,
    });
  },
};

export function GET(request: Request): Promise<Response> {
  return handleMetadataRequest(request, backend);
}

export function POST(request: Request): Promise<Response> {
  return handleMetadataRequest(request, backend);
}

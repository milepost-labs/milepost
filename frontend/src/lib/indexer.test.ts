import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INDEXER_BASE_URL,
  STALE_AFTER_MS,
  fetchAwards,
  fetchMeta,
  isStale,
  type IndexerMeta,
} from './indexer';

const meta = (overrides: Partial<IndexerMeta> = {}): IndexerMeta => ({
  network: 'testnet',
  registry: 'CCBQHBNIG5FIJEM6SQZQGTQRO3XXHV2BGVGGUY5JXXZ3Y55ZJSV3HMVF',
  fromLedger: 4697201,
  indexedToLedger: 4698280,
  indexedAt: '2026-09-15T12:00:00.000Z',
  complete: true,
  gap: false,
  unhandledEvents: {},
  ...overrides,
});

/** No test reaches the network: fetch is replaced, never called for real. */
function stubFetch(response: { ok?: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading the index', () => {
  it('reads a programme’s awards from the published path', async () => {
    const awards = [{ recipient: 'GAH3', granted: '300', released: '100', tranches: 3, tranchesReleased: 1, payee: 'GAH3', mode: 'Allocated', updatedLedger: 4697367 }];
    const fetchMock = stubFetch({ body: awards });

    await expect(fetchAwards('CD6X')).resolves.toEqual(awards);
    expect(fetchMock).toHaveBeenCalledWith(`${INDEXER_BASE_URL}/programmes/CD6X/awards.json`);
  });

  it('reads meta from the published path', async () => {
    const fetchMock = stubFetch({ body: meta() });

    await expect(fetchMeta()).resolves.toMatchObject({ network: 'testnet', complete: true });
    expect(fetchMock).toHaveBeenCalledWith(`${INDEXER_BASE_URL}/meta.json`);
  });

  it('fails with the status when a list is not published', async () => {
    stubFetch({ ok: false, status: 404 });

    await expect(fetchAwards('CNOTINDEXED')).rejects.toThrow(/404/);
  });
});

describe('isStale', () => {
  it('accepts an index published within the hour', () => {
    const published = Date.parse('2026-09-15T12:00:00.000Z');

    expect(isStale(meta(), published + STALE_AFTER_MS - 1)).toBe(false);
  });

  it('marks an index that stopped updating over an hour ago', () => {
    const published = Date.parse('2026-09-15T12:00:00.000Z');

    expect(isStale(meta(), published + STALE_AFTER_MS + 1)).toBe(true);
  });

  it('treats an unreadable timestamp as stale rather than fresh', () => {
    expect(isStale(meta({ indexedAt: 'not a date' }))).toBe(true);
  });
});

/**
 * Starts a tiny HTTP server that stands in for the published index.
 *
 * `VITE_INDEXER_URL` is pointed at this server so the app never fetches from
 * GitHub Pages during screenshots, making the test fully deterministic.
 *
 * The server is stopped in global-teardown.ts.
 */

import http from 'node:http';
import { INDEXER_PORT, FIXTURE_META, FIXTURE_PROGRAMMES } from './fixtures/indexer-data';

export default async function globalSetup() {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';

    // Strip leading slash and query string.
    const path = url.replace(/^\//, '').split('?')[0];

    let body: string;
    let status = 200;

    if (path === 'meta.json') {
      body = JSON.stringify(FIXTURE_META);
    } else if (path === 'programmes.json') {
      body = JSON.stringify(FIXTURE_PROGRAMMES);
    } else {
      // Any other path (e.g. awards.json for a specific programme) returns
      // an empty array so the app degrades gracefully without erroring.
      body = '[]';
      status = 200;
    }

    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(INDEXER_PORT, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  // Stash the server handle so teardown can close it.
  (global as Record<string, unknown>).__indexerServer = server;
}

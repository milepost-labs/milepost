/**
 * Serves a built `dist/` folder the way Vercel serves this app: the headers and
 * rewrites from `vercel.json` are applied, so a browser test sees the same
 * Content-Security-Policy a visitor gets.
 *
 * Usage: node scripts/serve-dist.mjs <dist-dir> <port>
 *
 * Reads only the parts of vercel.json this repo uses. Each `source` and
 * rewrite `source` is a regular expression matched against the whole path, and
 * every matching header rule is applied. A rewrite's `destination` is a plain
 * path. Any other vercel.json key is ignored.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const [, , distArg = 'dist', portArg = '4173'] = process.argv;
const distRoot = path.resolve(frontendRoot, distArg);
const port = Number(portArg);

const config = JSON.parse(await readFile(path.join(frontendRoot, 'vercel.json'), 'utf8'));

const headerRules = (config.headers ?? []).map((rule) => ({
  pattern: new RegExp(`^${rule.source}$`),
  headers: rule.headers,
}));

const rewriteRules = (config.rewrites ?? []).map((rule) => ({
  pattern: new RegExp(`^${rule.source}$`),
  destination: rule.destination,
}));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** The file a URL path names inside dist, or null. Never leaves dist. */
async function fileFor(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const candidate = path.resolve(distRoot, `.${decoded}`);
  if (candidate !== distRoot && !candidate.startsWith(distRoot + path.sep)) return null;

  const info = await stat(candidate).catch(() => null);
  if (info?.isFile()) return candidate;
  if (info?.isDirectory()) {
    const index = path.join(candidate, 'index.html');
    const indexInfo = await stat(index).catch(() => null);
    if (indexInfo?.isFile()) return index;
  }
  return null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const urlPath = (req.url ?? '/').split('?')[0];

  // Like Vercel: a file in dist wins, otherwise the first matching rewrite.
  let file = await fileFor(urlPath);
  if (!file) {
    const rewrite = rewriteRules.find((rule) => rule.pattern.test(urlPath));
    if (rewrite) file = await fileFor(rewrite.destination);
  }
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const headers = {
    'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
  };
  for (const rule of headerRules) {
    if (!rule.pattern.test(urlPath)) continue;
    for (const header of rule.headers) headers[header.key] = header.value;
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${distRoot} on http://127.0.0.1:${port}`);
});

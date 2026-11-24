import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  allows,
  checkFrontend,
  checkOrigins,
  connectSources,
  findEnvOrigins,
  findOrigins,
  isCheckedSource,
  validateLinkOnly,
} from './check-csp.mjs';

const policy = (connectSrc) => ({
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: `default-src 'self'; connect-src ${connectSrc}; img-src 'self'` },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    },
  ],
});

const url = (u) => {
  const parsed = new URL(u);
  return { scheme: parsed.protocol.slice(0, -1), host: parsed.hostname, port: parsed.port || undefined };
};

const EXPLORER = [{ host: 'stellar.expert', reason: 'Explorer links only.' }];

// ---- reading the policy ----

test('reads connect-src from the Content-Security-Policy header', () => {
  assert.deepEqual(connectSources(policy("'self' https://rpc.example.org blob:")), [
    "'self'",
    'https://rpc.example.org',
    'blob:',
  ]);
});

test('falls back to default-src when there is no connect-src, as the browser does', () => {
  const config = { headers: [{ source: '/(.*)', headers: [{ key: 'content-security-policy', value: "default-src 'self' https://a.example.org" }] }] };
  assert.deepEqual(connectSources(config), ["'self'", 'https://a.example.org']);
});

test('refuses a config without a policy rather than passing it', () => {
  assert.throws(() => connectSources({ headers: [] }), /no Content-Security-Policy/);
});

// ---- matching hosts ----

test('matches host sources the way CSP does', () => {
  const sources = ["'self'", 'https://rpc.example.org', '*.cdn.example.org', 'api.example.net:8443', 'blob:'];
  assert.ok(allows(sources, url('https://rpc.example.org/soroban')));
  assert.ok(allows(sources, url('wss://rpc.example.org')), 'an https source also allows wss');
  assert.ok(allows(sources, url('https://a.cdn.example.org')), 'a wildcard matches a subdomain');
  assert.ok(!allows(sources, url('https://cdn.example.org')), 'a wildcard does not match the apex');
  assert.ok(allows(sources, url('https://api.example.net:8443')));
  assert.ok(!allows(sources, url('https://api.example.net')), 'a source port must match');
  assert.ok(!allows(sources, url('https://other.example.org')));
  assert.ok(allows(['https:'], url('https://anything.example.org')), 'a scheme source allows every host');
});

// ---- finding origins in source ----

test('finds origins in strings and templates, and how each is used', () => {
  const source = [
    "const RPC = 'https://soroban-testnet.stellar.org';",
    'export async function fund(addr: string) {',
    '  await fetch(`https://friendbot.stellar.org/?addr=${addr}`);',
    '  const s = new rpc.Server(`https://rpc.example.org`);',
    '}',
    'export const Link = () => <a href={`https://stellar.expert/explorer/testnet`}>x</a>;',
    "export const Plain = () => <a href=\"https://docs.example.org/guide\">docs</a>;",
  ].join('\n');
  const found = findOrigins(source, 'src/x.tsx').map(({ line, origin, use }) => [line, origin, use.kind, use.via]);
  assert.deepEqual(found, [
    [1, 'https://soroban-testnet.stellar.org', 'reference', undefined],
    [3, 'https://friendbot.stellar.org', 'connect', 'fetch'],
    [4, 'https://rpc.example.org', 'connect', 'Server'],
    [6, 'https://stellar.expert', 'link', undefined],
    [7, 'https://docs.example.org', 'link', undefined],
  ]);
});

test('ignores URLs in comments and in prose without a host', () => {
  const source = [
    '// fetched from https://commented.example.org',
    '/** See https://docs.example.org. */',
    "const msg = 'The address must start with https://.';",
    'const dynamic = `https://${host}/path`;',
  ].join('\n');
  assert.deepEqual(findOrigins(source), []);
});

test('reads URL defaults from dotenv files', () => {
  const found = findEnvOrigins('# comment https://no.example.org\nVITE_INDEXER_URL=https://index.example.org/v1\nOTHER=https://x.example.org\n');
  assert.deepEqual(found.map((f) => [f.line, f.origin, f.use.via]), [[2, 'https://index.example.org', 'VITE_INDEXER_URL']]);
});

test('checks app sources, not tests or the test harness', () => {
  assert.ok(isCheckedSource('src/config/network.ts'));
  assert.ok(isCheckedSource('src/components/layout/AccountMenu.tsx'));
  assert.ok(!isCheckedSource('src/config/network.test.ts'));
  assert.ok(!isCheckedSource('src/test/server.ts'));
  assert.ok(!isCheckedSource('src/vite-env.d.ts'));
  assert.ok(!isCheckedSource('src/assets/logo.svg'));
});

// ---- the check ----

const APP = [
  "const RPC = 'https://soroban-testnet.stellar.org';",
  'export const fund = (a: string) => fetch(`https://friendbot.stellar.org/?addr=${a}`);',
  'export const tx = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;',
].join('\n');

test('passes when every host the app uses is allowed or link-only', () => {
  const found = findOrigins(APP, 'src/app.ts');
  const sources = connectSources(policy("'self' https://soroban-testnet.stellar.org https://friendbot.stellar.org"));
  assert.deepEqual(checkOrigins(found, sources, EXPLORER), []);
});

test('fails when a host the app fetches is missing, naming the host and the file', () => {
  const found = findOrigins(APP, 'src/app.ts');
  const sources = connectSources(policy("'self' https://soroban-testnet.stellar.org"));
  const violations = checkOrigins(found, sources, EXPLORER);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, 'vercel.json');
  assert.match(violations[0].message, /does not allow https:\/\/friendbot\.stellar\.org/);
  assert.match(violations[0].message, /src\/app\.ts:2 \(fetch\)/);
});

test('fails when a host named as a constant is missing, though no fetch names it', () => {
  // The RPC reaches rpc.Server through the network setting; the constant is
  // the only place its host is written.
  const found = findOrigins(APP, 'src/config/network.ts');
  const sources = connectSources(policy("'self' https://friendbot.stellar.org"));
  const [violation] = checkOrigins(found, sources, EXPLORER);
  assert.match(violation.message, /https:\/\/soroban-testnet\.stellar\.org.*src\/config\/network\.ts:1/);
});

test('explorer links need no connect-src entry', () => {
  const found = findOrigins('export const L = () => <a href="https://explorer.example.org/tx/1">tx</a>;', 'src/L.tsx');
  assert.deepEqual(checkOrigins(found, ["'self'"], []), []);
});

test('fails when a link-only host is connected to', () => {
  const found = findOrigins("export const read = () => fetch('https://stellar.expert/api/tx');", 'src/read.ts');
  const [violation] = checkOrigins(found, ["'self'"], EXPLORER);
  assert.equal(violation.file, 'src/read.ts');
  assert.match(violation.message, /link-only, but this line connects to it/);
});

test('fails on link-only entries without a reason or that nothing uses', () => {
  assert.match(validateLinkOnly([{ host: 'stellar.expert' }])[0], /no "reason"/);
  assert.match(validateLinkOnly([{ host: 'https://stellar.expert', reason: 'x' }])[0], /bare host name/);
  const [stale] = checkOrigins([], ["'self'"], EXPLORER);
  assert.match(stale.message, /stellar\.expert is not used/);
});

// ---- end to end, on a directory laid out like frontend/ ----

function frontendFixture(connectSrc) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-csp-'));
  fs.mkdirSync(path.join(root, 'src', 'config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'test'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'vercel.json'), JSON.stringify(policy(connectSrc)));
  fs.writeFileSync(path.join(root, 'scripts', 'csp-link-only-hosts.json'), JSON.stringify(EXPLORER));
  fs.writeFileSync(path.join(root, 'src', 'config', 'network.ts'), APP);
  // Tests may name any host: they run in Node, not under the policy.
  fs.writeFileSync(path.join(root, 'src', 'config', 'network.test.ts'), "fetch('https://test-only.example.org');");
  fs.writeFileSync(path.join(root, 'src', 'test', 'server.ts'), "fetch('https://harness.example.org');");
  return root;
}

test('checks a whole frontend directory', () => {
  const ok = frontendFixture("'self' https://soroban-testnet.stellar.org https://friendbot.stellar.org");
  assert.deepEqual(checkFrontend(ok).violations, []);

  const broken = frontendFixture("'self' https://soroban-testnet.stellar.org");
  fs.writeFileSync(path.join(broken, '.env.production'), 'VITE_INDEXER_URL=https://index.example.org/v1\n');
  const messages = checkFrontend(broken).violations.map((v) => v.message);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /friendbot\.stellar\.org.*src\/config\/network\.ts:2/);
  assert.match(messages[1], /index\.example\.org.*\.env\.production:1 \(VITE_INDEXER_URL\)/);
});

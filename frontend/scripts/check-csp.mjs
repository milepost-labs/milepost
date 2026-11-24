#!/usr/bin/env node
// The deployed app sends a Content-Security-Policy (frontend/vercel.json) whose
// connect-src lists every server the page may talk to. `npm run dev` sends no
// policy, so a host missing from that list works locally and is blocked only on
// the live site. This check makes the list a build failure instead of a
// production surprise. See CONTRIBUTING.md, "Content-Security-Policy hosts".
//
// It collects every absolute https:// or wss:// origin written in the app's
// source, not only the ones written at a `fetch` call. The hosts that matter
// most are named once as constants (the RPC, the index) and reach `rpc.Server`
// or `fetch` through the network setting, so a check that read call sites alone
// would miss exactly them. Each origin must then be:
//
//   - allowed by connect-src, or
//   - the target of an `href` attribute (a link, not a connection), or
//   - on the link-only list (scripts/csp-link-only-hosts.json) with a reason:
//     hosts the app only builds links to, such as the explorer.
//
// A link-only host written directly into a `fetch`, an SDK `Server`, an
// `EventSource`, a `WebSocket` or `sendBeacon` fails regardless, as do list
// entries without a reason or that no source uses any more.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = 'src';
export const POLICY_FILE = 'vercel.json';
export const LINK_ONLY_FILE = path.join('scripts', 'csp-link-only-hosts.json');
// What `vite build` reads, so a URL default set here ships in the bundle.
const ENV_FILES = ['.env', '.env.production'];
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs)$/;

// A host is at least two dot-separated labels; this skips "https://." in prose
// and template literals whose host is itself an interpolation.
const URL_PATTERN = /\b(https|wss):\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?::(\d+))?/gi;

// Callees that open a connection with their first argument. Matched on the
// last name in the callee, so `rpc.Server`, `Horizon.Server` and `window.fetch`
// count.
const CONNECTING_CALLEES = new Set(['fetch', 'Server', 'EventSource', 'WebSocket', 'sendBeacon']);

/**
 * The connect-src sources of the policy vercel.json sends on every page. With
 * no connect-src the browser falls back to default-src, and so does this.
 */
export function connectSources(vercelConfig) {
  const policies = [];
  for (const rule of vercelConfig?.headers ?? []) {
    for (const header of rule?.headers ?? []) {
      if (typeof header?.key === 'string' && header.key.toLowerCase() === 'content-security-policy') {
        policies.push(String(header.value));
      }
    }
  }
  if (policies.length === 0) throw new Error(`${POLICY_FILE} sets no Content-Security-Policy header`);
  if (policies.length > 1) throw new Error(`${POLICY_FILE} sets more than one Content-Security-Policy header; this check reads one`);

  const directives = new Map();
  for (const directive of policies[0].split(';')) {
    const [name, ...values] = directive.trim().split(/\s+/);
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), values);
  }
  const sources = directives.get('connect-src') ?? directives.get('default-src');
  if (!sources) throw new Error(`the Content-Security-Policy in ${POLICY_FILE} has neither connect-src nor default-src`);
  return sources;
}

const DEFAULT_PORT = { https: '443', wss: '443' };

/**
 * Whether a CSP source list allows connecting to `url` (`{ scheme, host, port }`).
 * Follows CSP host-source matching: a scheme-less source takes the page's
 * scheme (https), an https source also allows wss, `*.example.org` matches
 * subdomains but not the apex, and `https:` alone allows every https host.
 * A path on a source is not compared: the check works on origins.
 */
export function allows(sources, { scheme, host, port }) {
  const urlPort = port ?? DEFAULT_PORT[scheme];
  return sources.some((raw) => {
    const source = raw.toLowerCase();
    if (source.startsWith("'") || source === 'blob:' || source === 'data:') return false;
    if (source === '*') return true;
    if (source === `${scheme}:` || (scheme === 'wss' && source === 'https:')) return true;

    const match = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(\d+|\*))?(?:\/.*)?$/.exec(source);
    if (!match) return false;
    const [, sourceScheme, wildcard, sourceHost, sourcePort] = match;

    const schemeOk = !sourceScheme
      || sourceScheme === scheme
      || (scheme === 'https' && sourceScheme === 'http')
      || (scheme === 'wss' && ['https', 'http', 'ws'].includes(sourceScheme));
    if (!schemeOk) return false;

    const hostOk = wildcard ? host.endsWith(`.${sourceHost}`) : host === sourceHost;
    if (!hostOk) return false;

    return sourcePort === '*' || (sourcePort ?? DEFAULT_PORT[scheme]) === urlPort;
  });
}

function originOf({ scheme, host, port }) {
  return `${scheme}://${host}${port && port !== DEFAULT_PORT[scheme] ? `:${port}` : ''}`;
}

function urlsIn(text) {
  return [...text.matchAll(URL_PATTERN)].map(([, scheme, host, port]) => ({
    scheme: scheme.toLowerCase(),
    host: host.toLowerCase(),
    port,
  }));
}

/** The last identifier of a callee: `fetch`, `rpc.Server` → `Server`. */
function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

/**
 * How a string literal is used: `link` when it is (inside) the value of an
 * `href` attribute, `connect` when it is (inside) the first argument of a
 * connecting call, otherwise `reference`: a constant, a default, a return
 * value, whose use the check cannot see from here.
 */
function useOf(literal) {
  let child = literal;
  for (let node = literal.parent; node; child = node, node = node.parent) {
    if (ts.isJsxAttribute(node)) {
      return node.name.getText() === 'href' ? { kind: 'link' } : { kind: 'reference' };
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments?.[0] === child) {
      const name = calleeName(node.expression);
      if (name && CONNECTING_CALLEES.has(name)) return { kind: 'connect', via: name };
    }
    // A literal inside a function body is not that function's argument.
    if (ts.isFunctionLike(node) || ts.isSourceFile(node)) break;
  }
  return { kind: 'reference' };
}

/** Every absolute origin in a source file's string and template literals; comments are skipped. */
export function findOrigins(source, file = '<input>.tsx') {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    ) {
      const urls = urlsIn(node.text);
      if (urls.length) {
        // A template's head and spans are used as the whole template expression.
        let literal = node;
        while (literal.parent && (ts.isTemplateSpan(literal.parent) || ts.isTemplateExpression(literal.parent))) {
          literal = literal.parent;
        }
        const use = useOf(literal);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        for (const url of urls) found.push({ file, line, origin: originOf(url), url, use });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** `VITE_*` values in a dotenv file that are absolute URLs. */
export function findEnvOrigins(source, file = '.env') {
  const found = [];
  source.split('\n').forEach((text, index) => {
    const match = /^\s*(?:export\s+)?(VITE_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(text);
    if (!match) return;
    for (const url of urlsIn(match[2])) {
      found.push({ file, line: index + 1, origin: originOf(url), url, use: { kind: 'reference', via: match[1] } });
    }
  });
  return found;
}

/** Link-only entries are `{ host, reason }`; one without a reason is itself a violation. */
export function validateLinkOnly(entries) {
  if (!Array.isArray(entries)) return ['the link-only list must be a JSON array of { "host", "reason" } entries'];
  const problems = [];
  const seen = new Set();
  entries.forEach((entry, index) => {
    const host = typeof entry?.host === 'string' ? entry.host.trim().toLowerCase() : '';
    const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
    if (!host) problems.push(`entry ${index} has no "host"`);
    else if (host.includes('/') || host.includes(':')) problems.push(`entry ${index} ("${host}") must be a bare host name, not a URL`);
    if (!reason) problems.push(`entry ${index} (${host || 'no host'}) has no "reason"; say why the app only links to it`);
    if (host && seen.has(host)) problems.push(`${host} is listed more than once`);
    seen.add(host);
  });
  return problems;
}

/**
 * Check every found origin against the policy's connect-src and the link-only
 * list. Returns violations as `{ file, message }`, grouped so each missing
 * origin is reported once with every place that uses it.
 */
export function checkOrigins(found, sources, linkOnly = []) {
  const violations = validateLinkOnly(linkOnly).map((message) => ({ file: LINK_ONLY_FILE, message }));
  const linkHosts = new Map(
    (Array.isArray(linkOnly) ? linkOnly : [])
      .filter((entry) => typeof entry?.host === 'string')
      .map((entry) => [entry.host.trim().toLowerCase(), false]),
  );

  const missing = new Map();
  for (const occurrence of found) {
    const { url, use } = occurrence;
    if (use.kind === 'link') continue;
    if (allows(sources, url)) continue;

    if (linkHosts.has(url.host)) {
      if (use.kind !== 'connect') {
        linkHosts.set(url.host, true);
        continue;
      }
      violations.push({
        file: occurrence.file,
        line: occurrence.line,
        message: `passes ${occurrence.origin} to ${use.via}(), which connect-src in ${POLICY_FILE} does not allow. `
          + `It is on ${LINK_ONLY_FILE} as link-only, but this line connects to it: add it to connect-src.`,
      });
      continue;
    }
    if (!missing.has(occurrence.origin)) missing.set(occurrence.origin, []);
    missing.get(occurrence.origin).push(occurrence);
  }

  for (const [origin, uses] of missing) {
    const where = uses
      .map(({ file, line, use }) => `${file}:${line}${use.via ? ` (${use.via})` : ''}`)
      .join(', ');
    violations.push({
      file: POLICY_FILE,
      message: `connect-src does not allow ${origin}, which the app uses in ${where}. `
        + `The browser will block it on the deployed site. Add it to connect-src, `
        + `or, if the app only links to it, add the host to ${LINK_ONLY_FILE} with a reason.`,
    });
  }

  for (const [host, used] of linkHosts) {
    if (!used) {
      violations.push({ file: LINK_ONLY_FILE, message: `${host} is not used outside connect-src or an href any more; remove it` });
    }
  }
  return violations;
}

/** App sources: under src/, excluding tests and the test harness. */
export function isCheckedSource(file) {
  const normalised = file.split(path.sep).join('/');
  return SOURCE_EXTENSIONS.test(normalised)
    && !normalised.endsWith('.d.ts')
    && !/\.test\.[a-z]+$/.test(normalised)
    && !normalised.startsWith('src/test/');
}

/** Read everything the check needs from a frontend directory. */
export function checkFrontend(root = FRONTEND) {
  const sources = connectSources(JSON.parse(fs.readFileSync(path.join(root, POLICY_FILE), 'utf8')));
  const linkOnlyPath = path.join(root, LINK_ONLY_FILE);
  const linkOnly = fs.existsSync(linkOnlyPath) ? JSON.parse(fs.readFileSync(linkOnlyPath, 'utf8')) : [];

  const files = fs.readdirSync(path.join(root, SOURCE_ROOT), { recursive: true })
    .map((entry) => path.join(SOURCE_ROOT, entry).split(path.sep).join('/'))
    .filter(isCheckedSource)
    .sort();
  const found = files.flatMap((file) => findOrigins(fs.readFileSync(path.join(root, file), 'utf8'), file));
  for (const file of ENV_FILES) {
    const envPath = path.join(root, file);
    if (fs.existsSync(envPath)) found.push(...findEnvOrigins(fs.readFileSync(envPath, 'utf8'), file));
  }

  return { violations: checkOrigins(found, sources, linkOnly), files: files.length, origins: new Set(found.map((f) => f.origin)) };
}

function main() {
  let result;
  try {
    result = checkFrontend();
  } catch (error) {
    console.error(`frontend/${POLICY_FILE}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const { violations, files, origins } = result;
  if (violations.length) {
    for (const v of violations) console.error(`frontend/${v.file}${v.line ? `:${v.line}` : ''}: ${v.message}`);
    console.error(`CSP check found ${violations.length} violation(s).`);
    process.exitCode = 1;
  } else {
    console.log(`CSP check passed (${files} files, ${origins.size} origins: ${[...origins].sort().join(', ')}).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

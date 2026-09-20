import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every module must be reachable from the entry point.
 *
 * A React component that nothing imports compiles, lints, and passes its own
 * tests — while the bundler drops it entirely and no user can reach it. It
 * looks finished and does nothing. That has happened here repeatedly: three
 * pages merged unreachable, then four policy and admin components, then one
 * more. Every other check we run is blind to it, because nothing is *wrong*
 * with the code.
 *
 * So: walk the import graph from `main.tsx` and fail on anything it cannot
 * reach. If this test names your file, it is not rendered anywhere — add the
 * route or render it from a parent.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Reached by the tooling rather than by an import. */
const ENTRY_POINTS = ['main.tsx'];

const IGNORED = [
  /\.test\.tsx?$/,
  /\.d\.ts$/,
  /^test\//, // this file and its setup
  /^assets\//,
];

/**
 * Deliberate exceptions. Keep this list short and justified — every entry is a
 * module the check can no longer protect. "I will wire it up later" is not a
 * reason; that is the exact situation this test exists to catch.
 */
const ALLOWED_UNREACHABLE = [
  // The accessor for ThemeContext, which App.tsx provides. Nothing consumes it
  // because the app has no theme toggle yet — see issue #101, which adds one.
  'context/useTheme.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/**
 * Resolve a relative specifier the way the bundler does. `is_file` matters:
 * `../components/ui` names a directory, and the module actually imported is
 * the `index.ts` inside it.
 */
function resolveImport(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this one — keep looking.
    }
  }
  return null;
}

const IMPORT_SPECIFIER = /(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g;

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => resolveImport(file, match[1]))
    .filter((resolved): resolved is string => resolved !== null);
}

describe('module reachability', () => {
  it('every module is reachable from the entry point', () => {
    const all = sourceFiles(SRC).filter((file) => {
      const rel = relative(SRC, file);
      return !IGNORED.some((pattern) => pattern.test(rel));
    });

    const reached = new Set<string>();
    const queue = ENTRY_POINTS.map((entry) => join(SRC, entry));
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (reached.has(file)) continue;
      reached.add(file);
      queue.push(...importsOf(file));
    }

    const unreachable = all
      .filter((file) => !reached.has(file))
      .map((file) => relative(SRC, file))
      .filter((file) => !ALLOWED_UNREACHABLE.includes(file))
      .sort();

    expect(unreachable, [
      'These modules are imported by nothing, so the bundler drops them and',
      'no user can reach them. Add a route in App.tsx, or render them from a',
      'component that is already reachable.',
    ].join(' ')).toEqual([]);
  });
});

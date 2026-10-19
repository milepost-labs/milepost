#!/usr/bin/env node
// Every stand-in value on screen carries a "Sample data" tag. This makes that
// rule a check rather than a review comment: a component that reads a
// `FIXTURE_*` export must render the tag itself, or be on the allowlist with a
// reason. See CONTRIBUTING.md, "Sample data".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = 'src';
const ALLOWLIST_FILE = path.join('scripts', 'sample-tag-allowlist.json');
const FIXTURE_NAME = /^FIXTURE_[A-Z0-9_]+$/;
const SAMPLE_TAG = 'Sample data';

/**
 * The `FIXTURE_*` exports a component reads, and whether it renders the tag.
 * Reads are value imports (type-only imports render nothing) and namespace
 * member access (`fixtures.FIXTURE_X`). The tag counts only as JSX text or a
 * string literal, so a comment that mentions it does not.
 */
export function inspectSource(source, file = '<input>.tsx') {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fixtures = new Set();
  let tagged = false;

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (clause && !clause.isTypeOnly && bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          const imported = (specifier.propertyName ?? specifier.name).text;
          if (!specifier.isTypeOnly && FIXTURE_NAME.test(imported)) fixtures.add(imported);
        }
      }
      return;
    }
    if (ts.isPropertyAccessExpression(node) && FIXTURE_NAME.test(node.name.text)) {
      fixtures.add(node.name.text);
    }
    if (
      (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
      && node.text.includes(SAMPLE_TAG)
    ) {
      tagged = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { fixtures: [...fixtures].sort(), tagged };
}

/** Allowlist entries are `{ file, reason }`; an entry without a reason is itself a violation. */
export function validateAllowlist(entries) {
  const problems = [];
  if (!Array.isArray(entries)) return ['the allowlist must be a JSON array of { "file", "reason" } entries'];
  const seen = new Set();
  entries.forEach((entry, index) => {
    const file = typeof entry?.file === 'string' ? entry.file.trim() : '';
    const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
    if (!file) problems.push(`entry ${index} has no "file"`);
    if (!reason) problems.push(`entry ${index} (${file || 'no file'}) has no "reason"; say why it may skip the tag`);
    if (file && seen.has(file)) problems.push(`${file} is listed more than once`);
    seen.add(file);
  });
  return problems;
}

/**
 * Checks each `[file, source]` pair against the allowlist. An allowlisted file
 * that no longer needs its entry (it renders the tag, or reads no fixture) is
 * reported too, so the list cannot quietly outlive its reasons.
 */
export function checkSources(sources, allowlist = []) {
  const violations = validateAllowlist(allowlist).map((message) => ({ file: ALLOWLIST_FILE, message }));
  const allowed = new Map(
    (Array.isArray(allowlist) ? allowlist : []).map((entry) => [entry?.file, entry?.reason]),
  );
  const inspected = new Set();

  for (const [file, source] of sources) {
    inspected.add(file);
    const { fixtures, tagged } = inspectSource(source, file);
    const needsTag = fixtures.length > 0 && !tagged;
    if (needsTag && !allowed.has(file)) {
      violations.push({
        file,
        message: `reads ${fixtures.join(', ')} but never renders a "${SAMPLE_TAG}" tag. `
          + `Render <Badge tone="neutral">${SAMPLE_TAG}</Badge> beside the values, `
          + `or add the file to ${ALLOWLIST_FILE} with a reason.`,
      });
    } else if (!needsTag && allowed.has(file)) {
      violations.push({
        file: ALLOWLIST_FILE,
        message: `${file} no longer needs its entry (${fixtures.length ? 'it renders the tag' : 'it reads no fixture'}); remove it`,
      });
    }
  }

  for (const file of allowed.keys()) {
    if (typeof file === 'string' && file && !inspected.has(file)) {
      violations.push({ file: ALLOWLIST_FILE, message: `${file} does not exist or is not a checked component; remove it` });
    }
  }
  return violations;
}

/** Components: `.tsx` under src/, excluding tests and the fixture modules themselves. */
export function isCheckedComponent(file) {
  const normalised = file.split(path.sep).join('/');
  return normalised.endsWith('.tsx')
    && !/\.test\.tsx$/.test(normalised)
    && !normalised.startsWith('src/fixtures/')
    && !normalised.startsWith('src/test/');
}

function componentFiles() {
  return fs.readdirSync(path.join(FRONTEND, SOURCE_ROOT), { recursive: true })
    .map((entry) => path.join(SOURCE_ROOT, entry).split(path.sep).join('/'))
    .filter(isCheckedComponent)
    .sort();
}

function main() {
  const allowlist = JSON.parse(fs.readFileSync(path.join(FRONTEND, ALLOWLIST_FILE), 'utf8'));
  const sources = componentFiles().map((file) => [file, fs.readFileSync(path.join(FRONTEND, file), 'utf8')]);
  const violations = checkSources(sources, allowlist);

  if (violations.length) {
    for (const violation of violations) console.error(`frontend/${violation.file}: ${violation.message}`);
    console.error(`Sample-tag check found ${violations.length} violation(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Sample-tag check passed (${sources.length} components, ${allowlist.length} allowlisted).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

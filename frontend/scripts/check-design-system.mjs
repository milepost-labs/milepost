#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PAGE_ROOT = path.join('frontend', 'src', 'pages');
const SPACING_PROPERTIES = /^(?:margin|padding|gap|row-gap|column-gap|inset|inset-block|inset-inline|top|right|bottom|left)(?:-.+)?$/;
const LENGTH = /(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)\b/g;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/gi;
const ALLOW = /design-system-guard:\s*allow\s+(color|spacing|all)\b/i;

function isOnFourPixelScale(value, unit) {
  if (value === 0) return true;
  if (unit === 'px') return Math.abs(value % 4) < 0.000001;
  return Math.abs((value * 16) % 4) < 0.000001;
}

function withoutComments(line) {
  return line.replace(/\/\*.*?\*\//g, '');
}

export function scanCss(source, file = '<input>', onlyLines = null) {
  const violations = [];
  const lines = source.split(/\r?\n/);
  let previousAllow = '';

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const selected = !onlyLines || onlyLines.has(lineNumber);
    if (!selected) {
      previousAllow = rawLine.match(/\/\*[^*]*design-system-guard:[^*]*\*\//i)?.[0] ?? '';
      continue;
    }

    const marker = `${previousAllow} ${rawLine}`;
    const code = withoutComments(rawLine);
    const declaration = code.match(/^\s*([\w-]+)\s*:\s*([^;{}]+)/);
    const property = declaration?.[1] ?? '';
    const value = declaration?.[2] ?? '';

    if (!ALLOW.test(marker) && HEX_COLOR.test(code)) {
      violations.push({ file, line: lineNumber, kind: 'color', message: 'use a colour token instead of a hard-coded hex colour' });
    }
    HEX_COLOR.lastIndex = 0;

    if (!ALLOW.test(marker) && declaration && !property.startsWith('--') && SPACING_PROPERTIES.test(property)) {
      for (const match of value.matchAll(LENGTH)) {
        const numeric = Number(match[1]);
        if (!isOnFourPixelScale(numeric, match[2])) {
          violations.push({
            file,
            line: lineNumber,
            kind: 'spacing',
            message: `${match[1]}${match[2]} is off the 4px spacing scale`,
          });
          break;
        }
      }
    }

    previousAllow = rawLine.match(/\/\*[^*]*design-system-guard:[^*]*\*\//i)?.[0] ?? '';
  }

  return violations;
}

function pageCssFiles() {
  return fs.readdirSync(PAGE_ROOT, { recursive: true })
    .filter((entry) => entry.endsWith('.css'))
    .map((entry) => path.join(PAGE_ROOT, entry));
}

function parseAddedLines(diff) {
  const files = new Map();
  let currentFile = null;
  let nextLine = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      if (!currentFile.endsWith('.css') || !currentFile.startsWith(`${PAGE_ROOT}/`)) currentFile = null;
      continue;
    }
    const hunk = line.match(/^@@ .* \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      nextLine = Number(hunk[1]);
      continue;
    }
    if (!currentFile || !line.startsWith('+')) continue;
    const entry = files.get(currentFile) ?? [];
    entry.push([nextLine, line.slice(1)]);
    files.set(currentFile, entry);
    nextLine += 1;
  }
  return files;
}

function scanDiff(base) {
  const diff = execFileSync('git', ['diff', '--unified=0', base, '--', PAGE_ROOT], { encoding: 'utf8' });
  const violations = [];
  for (const [file, additions] of parseAddedLines(diff)) {
    const source = fs.readFileSync(file, 'utf8');
    const addedLines = new Set(additions.map(([line]) => line));
    violations.push(...scanCss(source, file, addedLines));
  }
  return violations;
}

function printViolations(violations) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const diffIndex = args.indexOf('--diff-base');
  const base = diffIndex >= 0 ? args[diffIndex + 1] : null;
  const paths = args.filter((arg, index) => arg === '--paths' ? false : index !== diffIndex && index !== diffIndex + 1);
  let violations;

  if (base) {
    violations = scanDiff(base);
  } else {
    const files = paths.length ? paths : pageCssFiles();
    violations = files.flatMap((file) => scanCss(fs.readFileSync(file, 'utf8'), file));
  }

  if (violations.length) {
    printViolations(violations);
    console.error(`Design-system guard found ${violations.length} violation(s).`);
    process.exitCode = 1;
  } else {
    console.log('Design-system guard passed.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

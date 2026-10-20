#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SPACING_PROPERTIES = /^(?:margin|padding|gap|row-gap|column-gap|inset|inset-block|inset-inline|top|right|bottom|left)(?:-.+)?$/;
const LENGTH = /(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)\b/g;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/gi;
const ALLOW = /design-system-guard:\s*allow\s+(color|spacing|all)\b/i;

function resolveRoots() {
  const repoRelative = [
    path.join('frontend', 'src', 'pages'),
    path.join('frontend', 'src', 'components'),
  ];
  if (fs.existsSync(repoRelative[0])) {
    return repoRelative;
  }
  return [
    path.join('src', 'pages'),
    path.join('src', 'components'),
  ];
}

function isOnFourPixelScale(value, unit) {
  if (value === 0) return true;
  if (unit === 'px') return Math.abs(value % 4) < 0.000001;
  return Math.abs((value * 16) % 4) < 0.000001;
}

export function scanCss(source, file = '<input>', onlyLines = null) {
  const violations = [];
  const lines = source.split(/\r?\n/);
  let previousAllow = '';
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const selected = !onlyLines || onlyLines.has(lineNumber);

    let effectiveLine = rawLine;
    const lineAllow = rawLine.match(/\/\*[^*]*design-system-guard:[^*]*\*\//i)?.[0] ?? '';

    if (inBlockComment) {
      const closeIdx = effectiveLine.indexOf('*/');
      if (closeIdx !== -1) {
        effectiveLine = effectiveLine.slice(closeIdx + 2);
        inBlockComment = false;
      } else {
        effectiveLine = '';
      }
    }

    while (effectiveLine.includes('/*')) {
      const openIdx = effectiveLine.indexOf('/*');
      const closeIdx = effectiveLine.indexOf('*/', openIdx + 2);
      if (closeIdx !== -1) {
        effectiveLine = effectiveLine.slice(0, openIdx) + effectiveLine.slice(closeIdx + 2);
      } else {
        effectiveLine = effectiveLine.slice(0, openIdx);
        inBlockComment = true;
        break;
      }
    }

    if (!selected) {
      previousAllow = lineAllow;
      continue;
    }

    const marker = `${previousAllow} ${rawLine}`;
    const code = effectiveLine;
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

    previousAllow = lineAllow;
  }

  return violations;
}

function allCssFiles() {
  const roots = resolveRoots();
  return roots.flatMap((root) => {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { recursive: true })
      .filter((entry) => entry.endsWith('.css'))
      .map((entry) => path.join(root, entry));
  });
}

function parseAddedLines(diff) {
  const files = new Map();
  let currentFile = null;
  let nextLine = 0;
  const roots = resolveRoots().map((r) => r.replace(/\\/g, '/'));

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      const normalized = currentFile.replace(/\\/g, '/');
      const inScope = normalized.endsWith('.css') && roots.some((root) => normalized.startsWith(`${root}/`));
      if (!inScope) currentFile = null;
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
  const roots = resolveRoots();
  const diff = execFileSync('git', ['diff', '--unified=0', base, '--', ...roots], { encoding: 'utf8' });
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
    const files = paths.length ? paths : allCssFiles();
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

import assert from 'node:assert/strict';
import test from 'node:test';
import { scanCss } from './check-design-system.mjs';

test('rejects hard-coded hex colours', () => {
  const violations = scanCss('.button {\n  color: #123456;\n}', 'fixture.css');
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, 'color');
});

test('rejects spacing values off the 4px scale', () => {
  const violations = scanCss('.panel {\n  gap: 6px;\n  padding: 1rem;\n}', 'fixture.css');
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, 'spacing');
  assert.match(violations[0].message, /6px/);
});

test('accepts token values and scale-aligned lengths', () => {
  const violations = scanCss('.panel {\n  gap: var(--space-2);\n  padding: 1.25rem 8px;\n  color: var(--text);\n}', 'fixture.css');
  assert.deepEqual(violations, []);
});

test('supports a documented exception for genuine one-off values', () => {
  const violations = scanCss([
    '.logo {',
    '  /* design-system-guard: allow color */',
    '  color: #123456;',
    '}',
    '.timeline { /* design-system-guard: allow spacing */\n  gap: 3px;\n}',
  ].join('\n'), 'fixture.css');
  assert.deepEqual(violations, []);
});

test('keeps exception comments when checking only added lines', () => {
  const source = [
    '.timeline {',
    '  /* design-system-guard: allow spacing */',
    '  gap: 3px;',
    '}',
  ].join('\n');
  assert.deepEqual(scanCss(source, 'fixture.css', new Set([3])), []);
});

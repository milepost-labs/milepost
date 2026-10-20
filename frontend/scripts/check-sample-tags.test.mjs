import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSources, inspectSource, isCheckedComponent, validateAllowlist } from './check-sample-tags.mjs';

const TAGGED = [
  "import { Badge } from '../components/ui';",
  "import { FIXTURE_TTL } from '../fixtures/keepaliveFixtures';",
  'export function Lifetimes() {',
  '  return (',
  '    <p>',
  '      {FIXTURE_TTL.length} entries <Badge tone="neutral">Sample data</Badge>',
  '    </p>',
  '  );',
  '}',
].join('\n');

const UNTAGGED = [
  "import { FIXTURE_TTL } from '../fixtures/keepaliveFixtures';",
  '// Sample data: a comment is not a tag.',
  'export function Lifetimes() {',
  '  return <p>{FIXTURE_TTL.length} entries</p>;',
  '}',
].join('\n');

test('passes a component that renders the fixture with the tag', () => {
  assert.deepEqual(checkSources([['src/pages/Tagged.tsx', TAGGED]]), []);
});

test('fails a component that renders a fixture without the tag', () => {
  const violations = checkSources([['src/pages/Untagged.tsx', UNTAGGED]]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, 'src/pages/Untagged.tsx');
  assert.match(violations[0].message, /FIXTURE_TTL/);
});

test('passes an untagged component on the allowlist with a reason', () => {
  const allowlist = [{ file: 'src/components/landing/Demo.tsx', reason: 'Landing illustration.' }];
  assert.deepEqual(checkSources([['src/components/landing/Demo.tsx', UNTAGGED]], allowlist), []);
});

test('rejects an allowlist entry without a reason', () => {
  const allowlist = [{ file: 'src/components/landing/Demo.tsx', reason: '  ' }];
  const violations = checkSources([['src/components/landing/Demo.tsx', UNTAGGED]], allowlist);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /no "reason"/);
  assert.match(validateAllowlist([{ file: 'x.tsx' }])[0], /no "reason"/);
});

test('reports allowlist entries that are no longer needed or point nowhere', () => {
  const allowlist = [
    { file: 'src/pages/Tagged.tsx', reason: 'Was untagged once.' },
    { file: 'src/pages/Gone.tsx', reason: 'Deleted since.' },
  ];
  const messages = checkSources([['src/pages/Tagged.tsx', TAGGED]], allowlist).map((v) => v.message);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /Tagged\.tsx no longer needs its entry/);
  assert.match(messages[1], /Gone\.tsx does not exist/);
});

test('counts namespace and aliased reads, but not type-only imports or local constants', () => {
  assert.deepEqual(inspectSource("import * as f from './fx';\nconst a = f.FIXTURE_A;").fixtures, ['FIXTURE_A']);
  assert.deepEqual(inspectSource("import { FIXTURE_B as b } from './fx';").fixtures, ['FIXTURE_B']);
  assert.deepEqual(inspectSource("import type { FIXTURE_C } from './fx';").fixtures, []);
  assert.deepEqual(inspectSource("import { type FIXTURE_D } from './fx';").fixtures, []);
  assert.deepEqual(inspectSource("const FIXTURE_E = 'G...';\nexport const x = FIXTURE_E;").fixtures, []);
});

test('accepts the tag from a string literal but not from a comment', () => {
  assert.equal(inspectSource("const label = 'Sample data';").tagged, true);
  assert.equal(inspectSource('const label = `${name} · Sample data`;').tagged, true);
  assert.equal(inspectSource('/* Sample data */ const label = 1;').tagged, false);
});

test('checks components only, not tests or the fixture modules', () => {
  assert.equal(isCheckedComponent('src/pages/Keepalive.tsx'), true);
  assert.equal(isCheckedComponent('src/pages/Keepalive.test.tsx'), false);
  assert.equal(isCheckedComponent('src/fixtures/programmes.ts'), false);
  assert.equal(isCheckedComponent('src/lib/programmeView.ts'), false);
});

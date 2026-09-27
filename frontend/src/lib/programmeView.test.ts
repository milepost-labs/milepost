import { describe, expect, it } from 'vitest';

import { FIXTURE_CHAIN_DEFAULT, FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import {
  filterProgrammes,
  formatAgo,
  formatUsdc,
  mergeProgrammes,
  moneySquares,
  phaseCounts,
  programmeCta,
  programmeStatus,
  shortId,
} from './programmeView';

describe('mergeProgrammes', () => {
  it('appends the fixture set when the index is empty', () => {
    const merged = mergeProgrammes([]);
    expect(merged).toHaveLength(FIXTURE_PROGRAMMES.length);
    expect(merged.every((p) => p.sample)).toBe(true);
  });

  it('keeps real entries first and marks them not-sample', () => {
    const merged = mergeProgrammes([
      { id: 'CREAL', name: 'Real programme', creator: 'GCREATOR', createdLedger: 42 },
    ]);
    expect(merged[0]).toMatchObject({ id: 'CREAL', name: 'Real programme', sample: false });
    // The fixture set is still appended for layout purposes.
    expect(merged).toHaveLength(FIXTURE_PROGRAMMES.length + 1);
  });

  it('falls back to "Unnamed programme" when the index has no name', () => {
    const merged = mergeProgrammes([
      { id: 'CNONAME', name: null, creator: null, createdLedger: null },
    ]);
    expect(merged[0].name).toBe('Unnamed programme');
  });

  it('uses the default chain read for an unknown id', () => {
    const merged = mergeProgrammes([{ id: 'CUNKNOWN', name: 'x', creator: null, createdLedger: 1 }]);
    expect(merged[0].chain).toEqual(FIXTURE_CHAIN_DEFAULT);
  });

  it('dedupes a fixture that matches a real id', () => {
    const real = FIXTURE_PROGRAMMES[0];
    const merged = mergeProgrammes([{ ...real }]);
    const matches = merged.filter((p) => p.id === real.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].sample).toBe(false);
  });
});

describe('filterProgrammes and matchesQuery', () => {
  const all = mergeProgrammes([]);

  it('filters by name', () => {
    const shown = filterProgrammes(all, 'flood', 'All');
    expect(shown).toHaveLength(1);
    expect(shown[0].name).toContain('Flood');
  });

  it('filters by id', () => {
    const target = FIXTURE_PROGRAMMES[2].id;
    const shown = filterProgrammes(all, target.slice(4, 12), 'All');
    expect(shown.map((p) => p.id)).toContain(target);
  });

  it('is case-insensitive', () => {
    expect(filterProgrammes(all, 'SMALLHOLDER', 'All')).toHaveLength(1);
  });

  it('filters by phase', () => {
    const cancelled = filterProgrammes(all, '', 'Cancelled');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].chain.phase).toBe('Cancelled');
  });
});

describe('phaseCounts', () => {
  it('counts phases over the search text, with All as the total', () => {
    const all = mergeProgrammes([]);
    const counts = phaseCounts(all, '');
    expect(counts.All).toBe(all.length);
    expect(counts.Open + counts.Review + counts.Settled + counts.Cancelled).toBe(all.length);
  });

  it('narrows with the search text', () => {
    const all = mergeProgrammes([]);
    const counts = phaseCounts(all, 'flood');
    expect(counts.All).toBe(1);
    expect(counts.Cancelled).toBe(1);
    expect(counts.Open).toBe(0);
  });
});

describe('status and call to action', () => {
  it('describes each phase', () => {
    expect(programmeStatus({ ...FIXTURE_CHAIN_DEFAULT, phase: 'Open', applicants: 3, closesInDays: 5 })).toContain('closes in 5 days');
    expect(programmeStatus({ ...FIXTURE_CHAIN_DEFAULT, phase: 'Review' })).toContain('Reviewers are voting');
    expect(programmeStatus({ ...FIXTURE_CHAIN_DEFAULT, phase: 'Settled' })).toContain('Awards are final');
    expect(programmeStatus({ ...FIXTURE_CHAIN_DEFAULT, phase: 'Cancelled' })).toContain('full refund');
  });

  it('gives every phase an action', () => {
    expect(programmeCta('Open')).toBe('Fund or apply');
    expect(programmeCta('Review')).toBe('Follow review');
    expect(programmeCta('Settled')).toBe('See releases');
    expect(programmeCta('Cancelled')).toBe('Claim refund');
  });
});

describe('moneySquares', () => {
  it('renders the requested number of squares', () => {
    expect(moneySquares(FIXTURE_CHAIN_DEFAULT, 20)).toHaveLength(20);
    expect(moneySquares(FIXTURE_CHAIN_DEFAULT, 40)).toHaveLength(40);
  });

  it('marks released, awarded-locked and refundable buckets', () => {
    const squares = moneySquares(FIXTURE_CHAIN_DEFAULT, 20);
    expect(squares).toContain('var(--accent)');
    expect(squares).toContain('var(--locked)');
    expect(squares).toContain('var(--accent-soft)');
  });

  it('greys out an empty budget rather than dividing by zero', () => {
    const squares = moneySquares({ ...FIXTURE_CHAIN_DEFAULT, contributed: '0', fee: '0' }, 20);
    expect(squares.every((c) => c === 'var(--surface-raised)')).toBe(true);
  });
});

describe('formatting helpers', () => {
  it('formats stroops as USDC without trailing zeros', () => {
    expect(formatUsdc('1260000000')).toBe('126 USDC');
    expect(formatUsdc(0n)).toBe('0 USDC');
  });

  it('humanises index age', () => {
    expect(formatAgo(30_000)).toBe('1 min ago');
    expect(formatAgo(3 * 3_600_000)).toBe('3 h ago');
    expect(formatAgo(3 * 24 * 3_600_000)).toBe('3 days ago');
  });

  it('shortens long ids', () => {
    expect(shortId('CBQ4SCHOOLBURSARY2026XK3ZP7M2QWJ5T8VN4RD6HY')).toBe('CBQ4SC…4RD6HY');
    expect(shortId('CSHORT')).toBe('CSHORT');
  });
});

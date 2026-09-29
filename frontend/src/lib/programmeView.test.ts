import { describe, expect, it } from 'vitest';

import { FIXTURE_CHAIN_DEFAULT, FIXTURE_PROGRAMMES } from '../fixtures/programmes';
import { FIXTURE_USER_ROLES } from '../fixtures/userRoles';
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
  sortProgrammes,
  type DirectoryProgramme,
} from './programmeView';

function directoryProgramme({
  id,
  name = id,
  phase = 'Open',
  contributed,
  createdLedger,
  closesInDays,
}: {
  id: string;
  name?: string;
  phase?: DirectoryProgramme['chain']['phase'];
  contributed: string;
  createdLedger: number;
  closesInDays?: number;
}): DirectoryProgramme {
  return {
    id,
    name,
    creator: null,
    createdLedger,
    sample: true,
    chain: {
      ...FIXTURE_CHAIN_DEFAULT,
      phase,
      contributed,
      fee: '0',
      closesInDays,
    },
  };
}

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

describe('sortProgrammes', () => {
  it('defaults to newest first', () => {
    const sorted = sortProgrammes(mergeProgrammes([]));
    expect(sorted[0].id).toBe(FIXTURE_PROGRAMMES[0].id);
  });

  it('sorts open programmes by closing soonest before entries without a close date', () => {
    const sorted = sortProgrammes(mergeProgrammes([]), 'closing-soonest');
    expect(sorted.slice(0, 2).map((p) => p.name)).toEqual([
      'Community resilience grants 2026',
      'Smallholder inputs, long rains',
    ]);
    expect(sorted.at(-1)?.chain.closesInDays).toBeUndefined();
  });

  it('sorts by largest budget using contributed less fee', () => {
    const sorted = sortProgrammes(mergeProgrammes([]), 'largest-budget');
    expect(sorted[0].name).toBe('SME supplier microgrants Q2');
  });

  it('compares large stroop budgets as BigInt instead of Number', () => {
    const smaller = directoryProgramme({
      id: 'CSMALL',
      contributed: '9007199254740992',
      createdLedger: 2,
    });
    const larger = directoryProgramme({
      id: 'CLARGE',
      contributed: '9007199254740993',
      createdLedger: 1,
    });

    expect(sortProgrammes([smaller, larger], 'largest-budget').map((p) => p.id)).toEqual([
      'CLARGE',
      'CSMALL',
    ]);
  });

  it('composes after search and phase filtering', () => {
    const rows = [
      directoryProgramme({ id: 'CLOW', name: 'Alpha low', contributed: '10', createdLedger: 3 }),
      directoryProgramme({ id: 'CHIGH', name: 'Alpha high', contributed: '30', createdLedger: 1 }),
      directoryProgramme({
        id: 'CREVIEW',
        name: 'Alpha review',
        phase: 'Review',
        contributed: '90',
        createdLedger: 2,
      }),
    ];

    expect(sortProgrammes(filterProgrammes(rows, 'alpha', 'Open'), 'largest-budget').map((p) => p.id)).toEqual([
      'CHIGH',
      'CLOW',
    ]);
  });
});

describe('yours filter', () => {
  it('attaches userRoles when provided', () => {
    const merged = mergeProgrammes([], FIXTURE_USER_ROLES);
    const withRoles = merged.find((p) => p.userRoles && p.userRoles.length > 0);
    expect(withRoles).toBeDefined();
    expect(withRoles?.userRoles).toContain('funder');
  });

  it('filters to only programmes with roles when yoursOnly is true', () => {
    const all = mergeProgrammes([], FIXTURE_USER_ROLES);
    const yours = filterProgrammes(all, '', 'All', true);
    expect(yours.length).toBeGreaterThan(0);
    expect(yours.every((p) => p.userRoles != null && p.userRoles.length > 0)).toBe(true);
  });

  it('returns all programmes when yoursOnly is false', () => {
    const all = mergeProgrammes([], FIXTURE_USER_ROLES);
    const allFiltered = filterProgrammes(all, '', 'All', false);
    expect(allFiltered.length).toBe(all.length);
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

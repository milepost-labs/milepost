import { describe, expect, it } from 'vitest';
import { escapeCsvField, csvRow, awardsToCsv, contributionsToCsv } from './csv';
import type { ContributionCard } from './funding';
import { FIXTURE_AWARDS } from '../fixtures/programmeFixtures';

describe('escapeCsvField', () => {
  it('returns plain values unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('wraps fields with commas in quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('doubles existing quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps fields with newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('csvRow', () => {
  it('joins fields with commas', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('escapes individual fields', () => {
    expect(csvRow(['plain', 'has,comma'])).toBe('plain,"has,comma"');
  });
});

describe('awardsToCsv', () => {
  it('includes a header row and advisory notice', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Recipient');
    expect(lines[1]).toContain('advisory public index');
    expect(lines[1]).toContain('2026-09-15T12:00:00Z');
  });

  it('exports both stroops and formatted units', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    const firstAward = lines[2];
    expect(firstAward).toContain('140000000000');
    expect(firstAward).toContain('14000');
  });

  it('handles awards with zero released', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    const zeroAward = lines[4];
    expect(zeroAward).toContain('0');
  });

  it('escapes commas in recipient addresses', () => {
    const awards = [{
      ...FIXTURE_AWARDS[0],
      recipient: 'GTEST,COMMA',
    }];
    const csv = awardsToCsv(awards, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    expect(lines[2]).toContain('"GTEST,COMMA"');
  });
});

describe('contributionsToCsv', () => {
  const makeCard = (overrides: Partial<ContributionCard> = {}): ContributionCard => ({
    programmeId: 'CPROG123',
    name: 'Health Stipends',
    phase: 'Settled',
    asset: 'USDC',
    chain: null,
    sample: false,
    amount: 20_000_000_000n, // 2000 USDC
    share: 2_000n,
    releasedShare: 10_000_000_000n,
    refundable: 1_255_000_000n, // 125.5 USDC
    estimatedRefund: 0n,
    claimable: true,
    refunded: false,
    note: '',
    refundedSoFar: 500_000_000n, // 50 USDC
    ...overrides,
  });

  it('writes the required columns and decimal amounts in the asset (never stroops)', () => {
    const csv = contributionsToCsv([makeCard()]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('programme id,name,asset,contributed,refunded,refundable now,phase');
    expect(lines[1]).toBe('CPROG123,Health Stipends,USDC,2000,50,125.5,Settled');
  });

  it('excludes sample programmes', () => {
    const csv = contributionsToCsv([
      makeCard({ programmeId: 'CSAMPLE', name: 'Sample Fund', sample: true }),
      makeCard({ programmeId: 'CREAL', name: 'Real, "Active" Fund', sample: false, claimable: false, refunded: false, refundedSoFar: 0n, phase: 'Open' }),
    ]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(csv).not.toContain('CSAMPLE');
    expect(lines[1]).toBe('CREAL,"Real, ""Active"" Fund",USDC,2000,0,0,Open');
  });

  it('returns only the header when all contributions are samples', () => {
    const csv = contributionsToCsv([makeCard({ sample: true })]);
    expect(csv).toBe('programme id,name,asset,contributed,refunded,refundable now,phase');
  });
});

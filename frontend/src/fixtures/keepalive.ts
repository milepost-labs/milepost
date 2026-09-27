/** Stand-in TTL reads for a programme's persistent contract entries. */
export interface FixtureTtlEntry {
  key: string;
  label: string;
  note: string;
  liveForDays: number;
}

export const FIXTURE_TTL: FixtureTtlEntry[] = [
  { key: 'instance', label: 'Programme contract', note: 'Terms, phase and budget', liveForDays: 61 },
  { key: 'awards', label: 'Awards', note: '4 entries', liveForDays: 12 },
  { key: 'contribs', label: 'Contributions', note: '9 entries, needed for refunds', liveForDays: 44 },
  { key: 'apps', label: 'Applications and votes', note: '23 entries', liveForDays: 27 },
];

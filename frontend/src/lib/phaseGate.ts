/**
 * The sentence every phase-gated action shows when it is unavailable.
 *
 * Kept in one place so "which phase does this need" reads the same on the
 * programme panel and in the contribute flow.
 */

export type Phase = 'Open' | 'Review' | 'Settled' | 'Cancelled';

const NEEDS: Record<Exclude<Phase, 'Cancelled'>, string> = {
  Open: 'while the programme is Open',
  Review: 'during Review',
  Settled: 'once the programme is Settled',
};

/** "Available only while the programme is Open. This programme is Review." */
export function phaseRequirement(needs: Exclude<Phase, 'Cancelled'>, current: Phase): string {
  return `Available only ${NEEDS[needs]}. This programme is ${current}.`;
}

export function isPhase(value: unknown): value is Phase {
  return value === 'Open' || value === 'Review' || value === 'Settled' || value === 'Cancelled';
}

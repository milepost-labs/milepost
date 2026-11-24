import { describe, expect, it } from 'vitest';
import { isPhase, phaseRequirement, type Phase } from './phaseGate';

const phases: Phase[] = ['Open', 'Review', 'Settled', 'Cancelled'];

describe('phaseRequirement', () => {
  const requirements = [
    ['Open', 'while the programme is Open'],
    ['Review', 'during Review'],
    ['Settled', 'once the programme is Settled'],
  ] as const;

  it.each(requirements)('explains an action that needs %s for every current phase', (needs, wording) => {
    for (const current of phases) {
      expect(phaseRequirement(needs, current)).toBe(
        `Available only ${wording}. This programme is ${current}.`,
      );
    }
  });
});

describe('isPhase', () => {
  it.each(phases)('accepts %s', (phase) => {
    expect(isPhase(phase)).toBe(true);
  });

  it.each([null, undefined, '', 'open', 'Paused', 0, {}])('rejects %s', (value) => {
    expect(isPhase(value)).toBe(false);
  });
});

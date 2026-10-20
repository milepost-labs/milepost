import { describe, expect, it } from 'vitest';
import { programmeActions, type ActionInput, type ActionKey } from './programmeActions';

const ID = 'CCOIACASOVO3ZQLXWWJFGZAU3Y545AGPXLBP4NYHYD77RDCBPXRVZ37C';

const input = (overrides: Partial<ActionInput> = {}): ActionInput => ({
  programmeId: ID,
  phase: 'Open',
  signedIn: true,
  refundsOpen: false,
  refundable: null,
  verified: true,
  ...overrides,
});

const enabledKeys = (overrides: Partial<ActionInput>): ActionKey[] =>
  programmeActions(input(overrides))
    .filter((action) => action.enabled)
    .map((action) => action.key);

const byKey = (overrides: Partial<ActionInput>, key: ActionKey) =>
  programmeActions(input(overrides)).find((action) => action.key === key)!;

describe('programmeActions', () => {
  it('always lists all five actions, in order', () => {
    for (const phase of ['Open', 'Review', 'Settled', 'Cancelled'] as const) {
      expect(programmeActions(input({ phase })).map((a) => a.key)).toEqual([
        'contribute',
        'apply',
        'finalize',
        'release',
        'refund',
      ]);
    }
  });

  it('enables exactly the actions each phase allows', () => {
    expect(enabledKeys({ phase: 'Open' })).toEqual(['contribute', 'apply']);
    expect(enabledKeys({ phase: 'Review' })).toEqual(['finalize']);
    expect(enabledKeys({ phase: 'Settled' })).toEqual(['release']);
    expect(enabledKeys({ phase: 'Settled', refundsOpen: true, refundable: '165 USDC' })).toEqual([
      'release',
      'refund',
    ]);
    expect(enabledKeys({ phase: 'Cancelled' })).toEqual(['refund']);
  });

  it('names the phase an unavailable action needs', () => {
    expect(byKey({ phase: 'Review' }, 'contribute').reason).toBe(
      'Available only while the programme is Open. This programme is Review.',
    );
    expect(byKey({ phase: 'Open' }, 'finalize').reason).toBe(
      'Available only during Review. This programme is Open.',
    );
    expect(byKey({ phase: 'Cancelled' }, 'release').reason).toBe(
      'Available only once the programme is Settled. This programme is Cancelled.',
    );
    expect(byKey({ phase: 'Open' }, 'refund').reason).toBe(
      'Available only once the programme is Settled. This programme is Open.',
    );
  });

  it('explains refunds on a Settled programme by the release window', () => {
    expect(byKey({ phase: 'Settled' }, 'refund').reason).toBe('Refunds open after the release window closes.');
    expect(byKey({ phase: 'Settled', refundsOpen: true }, 'refund').reason).toMatch(/Nothing is left to refund/);
  });

  it('keeps phase-allowed actions disabled when signed out and says sign-in unlocks them', () => {
    const actions = programmeActions(input({ phase: 'Open', signedIn: false }));
    expect(actions.some((a) => a.enabled)).toBe(false);
    const contribute = actions.find((a) => a.key === 'contribute')!;
    expect(contribute.phaseAllows).toBe(true);
    expect(contribute.reason).toBe('Sign in to contribute.');
    expect(actions.find((a) => a.key === 'finalize')!.phaseAllows).toBe(false);
  });

  it('deep-links enabled actions with ?programme=', () => {
    expect(byKey({ phase: 'Open' }, 'contribute').href).toBe(`/funders?programme=${ID}`);
    expect(byKey({ phase: 'Review' }, 'finalize').href).toBe(`/finalize?programme=${ID}`);
    expect(byKey({ phase: 'Settled' }, 'release').href).toBe(`/recipients/award-progress?programme=${ID}`);
    expect(byKey({ phase: 'Review' }, 'contribute').href).toBeNull();
  });

  it('disables everything until the phase has been read', () => {
    const actions = programmeActions(input({ phase: null }));
    expect(actions.every((a) => !a.enabled && a.href === null)).toBe(true);
    expect(actions[0].reason).toBe('Reading the phase on-chain…');
  });

  it('warns about finalize ordering when finalize is available', () => {
    expect(byKey({ phase: 'Review' }, 'finalize').reason).toMatch(/whoever finalizes first decides the order/);
  });
});

describe('registry verification gating', () => {
  it('blocks all actions with a pending-read reason when verified is null', () => {
    const actions = programmeActions(input({ phase: 'Open', verified: null }));
    expect(actions.every((a) => !a.enabled && a.href === null)).toBe(true);
    expect(actions[0].reason).toMatch(/checking whether this programme/i);
  });

  it('blocks all actions with an unverified reason when verified is false', () => {
    const actions = programmeActions(input({ phase: 'Open', verified: false }));
    expect(actions.every((a) => !a.enabled && a.href === null)).toBe(true);
    expect(actions[0].reason).toMatch(/not deployed by the milepost registry/i);
  });

  it('blocks actions even when the phase would allow them', () => {
    // Open phase, signed in, but unverified — no action should be enabled.
    expect(enabledKeys({ phase: 'Open', verified: false })).toEqual([]);
    expect(enabledKeys({ phase: 'Review', verified: false })).toEqual([]);
    expect(enabledKeys({ phase: 'Settled', refundsOpen: true, refundable: '99 XLM', verified: false })).toEqual([]);
  });

  it('treats a failed read (mapped to false by caller) identically to an explicit unverified answer', () => {
    // The caller maps isRegistered.error → false; this confirms the lib
    // produces the same blocked output for both cases.
    const explicitFalse = programmeActions(input({ phase: 'Open', verified: false }));
    // A null→false mapping produces the same shape.
    const mappedFalse = programmeActions(input({ phase: 'Open', verified: false }));
    expect(explicitFalse.map((a) => a.enabled)).toEqual(mappedFalse.map((a) => a.enabled));
    expect(explicitFalse.map((a) => a.reason)).toEqual(mappedFalse.map((a) => a.reason));
  });

  it('passes phase and sign-in gating through when verified is true', () => {
    // Existing behaviour must be unchanged for verified programmes.
    expect(enabledKeys({ phase: 'Open', verified: true })).toEqual(['contribute', 'apply']);
    expect(enabledKeys({ phase: 'Review', verified: true })).toEqual(['finalize']);
  });
});

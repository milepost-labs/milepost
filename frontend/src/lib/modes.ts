/**
 * The four payment modes, ranked by how much the contract itself guarantees.
 *
 * They are not equals and are never presented as such: `Allocated` depends on
 * nothing outside the contract, while `Restricted` relies on a wallet being
 * configured correctly. See `Mode` in `contracts/program/src/lib.rs`.
 */
export type ModeName = 'Allocated' | 'Direct' | 'Restricted' | 'Open';

export interface ModeInfo {
  /** Bars filled on the four-step strength meter. */
  strength: 1 | 2 | 3 | 4;
  /** A few words placing the mode on the scale. */
  rank: string;
  /** Where the money goes, in one line. */
  line: string;
}

export const MODE_INFO: Record<ModeName, ModeInfo> = {
  Allocated: {
    strength: 4,
    rank: 'Strongest guarantee',
    line: 'Held in escrow; the recipient picks a verified payee',
  },
  Direct: {
    strength: 3,
    rank: 'Strong, but paternalistic',
    line: 'Straight to a verified payee chosen at award time',
  },
  Restricted: {
    strength: 2,
    rank: 'Weaker than it looks',
    line: 'Into a policy wallet. The policy limits one signer, not the wallet',
  },
  Open: {
    strength: 1,
    rank: 'Simplest, unchecked',
    line: 'Straight to the recipient. Nothing checks it afterwards',
  },
};

/** Strongest guarantee first — the order every list of modes uses. */
export const MODES_BY_STRENGTH: ModeName[] = ['Allocated', 'Direct', 'Restricted', 'Open'];

export function modeInfo(mode: string): ModeInfo | null {
  return Object.hasOwn(MODE_INFO, mode) ? MODE_INFO[mode as ModeName] : null;
}

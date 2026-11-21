/**
 * The two "send it to the treasury" actions on a programme, and when each is
 * available.
 *
 * Both are permissionless, so the only roles are "signed in" and, for the
 * writes in general, "registry-verified programme". Everything else is the
 * phase and the clock. Like `programmeActions`, an unavailable action carries
 * a sentence saying why, so nothing is left to fail as a transaction.
 *
 * Kept apart from `programmeActions` because these two open a sheet rather
 * than deep-linking to another screen.
 */

import { extractCode } from './errors';
import type { Phase } from './phaseGate';

export interface SweepGate {
  enabled: boolean;
  reason: string;
}

export interface SweepFeeGateInput {
  /** Null until the phase has been read on-chain. */
  phase: Phase | null;
  signedIn: boolean;
  /** Registry verification: true confirmed, false refused, null still reading. */
  verified: boolean | null;
  /** A sample programme has no contract to send to. */
  sample?: boolean;
  /**
   * Whether `sweep_fee` has already run. Null while it is being read. A read
   * that fails is passed as false: the sheet simulates before anything is
   * signed, and the contract's own refusal is explained there.
   */
  feeSwept: boolean | null;
}

/** `FeeAlreadySwept` is error 24 on the program contract. */
const FEE_ALREADY_SWEPT = 24;
/** `NothingToSweep` is error 29. */
const NOTHING_TO_SWEEP = 29;

/** When may the protocol fee be sent? After applications close, until it has been. */
export function sweepFeeGate(input: SweepFeeGateInput): SweepGate {
  if (input.verified === null) {
    return { enabled: false, reason: 'Checking whether this programme was deployed by the registry…' };
  }
  if (input.verified === false) {
    return {
      enabled: false,
      reason: 'Write actions are disabled: this address was not deployed by the Milepost registry.',
    };
  }
  if (input.sample) {
    return { enabled: false, reason: 'A sample programme has no contract, so there is no fee to send.' };
  }
  if (input.phase === null) return { enabled: false, reason: 'Reading the phase on-chain…' };
  if (input.phase === 'Open') {
    return {
      enabled: false,
      reason: 'Available once applications close, so the fee can no longer change. This programme is Open.',
    };
  }
  if (input.feeSwept === null) {
    return { enabled: false, reason: 'Checking whether the fee has already been sent…' };
  }
  if (input.feeSwept) {
    return { enabled: false, reason: 'The protocol fee has already been sent to the treasury.' };
  }
  if (!input.signedIn) return { enabled: false, reason: 'Sign in to send the protocol fee to the treasury.' };
  return {
    enabled: true,
    reason: 'Anyone can send it, once. Re-checked on-chain when you continue.',
  };
}

/** The slice of a programme client a sweep check needs: one simulated write. */
type Simulated = () => Promise<{
  result: { isErr: () => boolean; unwrapErr: () => unknown };
}>;

/**
 * Whether simulating this write is refused with one particular error.
 * Nothing is signed or sent. A refusal with `code` (or the binding's own
 * `name` for it) answers true, a call that would go through answers false, and
 * any other failure is rethrown for the caller to treat as unknown.
 */
async function refusedWith(simulate: Simulated, code: number, name: string): Promise<boolean> {
  const matches = (caught: unknown) =>
    extractCode(caught) === code ||
    (typeof caught === 'object' && caught !== null && (caught as { message?: unknown }).message === name);

  try {
    const { result } = await simulate();
    if (!result.isErr()) return false;
    const refusal = result.unwrapErr();
    if (matches(refusal)) return true;
    throw refusal;
  } catch (caught) {
    if (matches(caught)) return true;
    throw caught;
  }
}

/**
 * Whether the protocol fee has already been sent. The contract keeps no getter
 * for it, so this simulates `sweep_fee`: refused with `FeeAlreadySwept` means yes.
 */
export function readFeeSwept(client: { sweep_fee: Simulated }): Promise<boolean> {
  return refusedWith(() => client.sweep_fee(), FEE_ALREADY_SWEPT, 'FeeAlreadySwept');
}

/**
 * Whether a sweep of unclaimed refunds would find nothing to send, from a
 * simulation of `sweep_unclaimed` refused with `NothingToSweep`.
 */
export function readNothingToSweep(client: { sweep_unclaimed: Simulated }): Promise<boolean> {
  return refusedWith(() => client.sweep_unclaimed(), NOTHING_TO_SWEEP, 'NothingToSweep');
}

export interface SweepUnclaimedGateInput {
  signedIn: boolean;
  /** Registry verification: true confirmed, false refused, null still reading. */
  verified: boolean | null;
  sample?: boolean;
  /**
   * Whether the sweep deadline has passed, from the config and the clock.
   * Null while the config is being read.
   */
  deadlinePassed: boolean | null;
  /** The sweep deadline, formatted for the reason shown before it opens. */
  deadlineText: string | null;
  /**
   * Whether a sweep would find nothing left. Null while being read; a failed
   * read is passed as false, since the sheet simulates before signing.
   */
  nothingLeft: boolean | null;
}

/** When may unclaimed refunds be sent to the treasury? After the sweep deadline, while money remains. */
export function sweepUnclaimedGate(input: SweepUnclaimedGateInput): SweepGate {
  if (input.verified === null) {
    return { enabled: false, reason: 'Checking whether this programme was deployed by the registry…' };
  }
  if (input.verified === false) {
    return {
      enabled: false,
      reason: 'Write actions are disabled: this address was not deployed by the Milepost registry.',
    };
  }
  if (input.sample) {
    return { enabled: false, reason: 'A sample programme has no contract, so there is nothing to send.' };
  }
  if (input.deadlinePassed === null) return { enabled: false, reason: 'Reading the sweep deadline…' };
  if (!input.deadlinePassed) {
    return {
      enabled: false,
      reason: input.deadlineText
        ? `Opens after the sweep deadline, ${input.deadlineText}. Until then donors can still claim their refunds.`
        : 'Opens after the sweep deadline. Until then donors can still claim their refunds.',
    };
  }
  if (input.nothingLeft === null) return { enabled: false, reason: 'Checking what is left to send…' };
  if (input.nothingLeft) return { enabled: false, reason: 'There is nothing left to send to the treasury.' };
  if (!input.signedIn) return { enabled: false, reason: 'Sign in to send unclaimed refunds to the treasury.' };
  return {
    enabled: true,
    reason: 'Anyone can send it. Re-checked on-chain when you continue.',
  };
}

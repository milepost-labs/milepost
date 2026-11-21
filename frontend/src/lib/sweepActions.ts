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

/** The slice of the programme client the fee check needs. */
interface FeeSweepSimulator {
  sweep_fee: () => Promise<{
    result: { isErr: () => boolean; unwrapErr: () => unknown };
  }>;
}

/**
 * Whether the protocol fee has already been sent. The contract keeps no getter
 * for it, so this simulates `sweep_fee` (nothing is signed or sent): refused
 * with `FeeAlreadySwept` means yes, anything that would go through means no,
 * and any other failure is rethrown for the caller to treat as unknown.
 */
export async function readFeeSwept(client: FeeSweepSimulator): Promise<boolean> {
  const refusedAsSwept = (caught: unknown) =>
    extractCode(caught) === FEE_ALREADY_SWEPT ||
    (typeof caught === 'object' &&
      caught !== null &&
      (caught as { message?: unknown }).message === 'FeeAlreadySwept');

  try {
    const { result } = await client.sweep_fee();
    if (!result.isErr()) return false;
    const refusal = result.unwrapErr();
    if (refusedAsSwept(refusal)) return true;
    throw refusal;
  } catch (caught) {
    if (refusedAsSwept(caught)) return true;
    throw caught;
  }
}

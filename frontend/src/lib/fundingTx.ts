/**
 * Building the funding transactions, for real programmes and for stand-ins.
 *
 * A real programme is signed and sent through its contract client. A sample
 * programme has no contract behind it, so its transaction is a stand-in that
 * resolves (or fails) the way the real one would, without asking the wallet to
 * sign anything. Both go through `useTransaction`, so the screen cannot tell
 * them apart and every outcome takes the same path.
 */

import type { Client as Programme } from '@milepost/program';
import type { Sendable } from '../hooks/useTransaction';
import { FIXTURE_TX, FIXTURE_TX_FAILURES } from '../fixtures/funding';
import { isPhase, type Phase } from './phaseGate';
import type { DirectoryProgramme } from './programmeView';

/** How long a stand-in transaction takes, so the pending state is visible. */
export const SAMPLE_TX_DELAY_MS = 1200;

export interface TxReceipt {
  hash: string;
  ledger: number | null;
}

/** The parts of a bindings `SentTransaction` a receipt is read from. */
export interface SentResponses {
  sendTransactionResponse?: { hash: string };
  getTransactionResponse?: object;
}

/** Hash and ledger from a sent transaction's responses. */
export function receiptOf(sent: SentResponses): TxReceipt {
  const response = sent.getTransactionResponse as { txHash?: string; ledger?: number } | undefined;
  return {
    hash: sent.sendTransactionResponse?.hash ?? response?.txHash ?? '',
    ledger: response?.ledger ?? null,
  };
}

export function sampleSendable<T>(outcome: () => T, delayMs: number): Sendable<T> {
  return {
    signAndSend: async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { result: outcome() };
    },
  };
}

/** The stand-in outcome for a sample programme: its fixture failure, or the fixture receipt. */
export function sampleOutcome(programmeId: string): TxReceipt {
  const failure = FIXTURE_TX_FAILURES[programmeId];
  if (failure) throw new Error(failure);
  return { hash: FIXTURE_TX.hash, ledger: FIXTURE_TX.ledger };
}

/**
 * The programme's phase as it stands now. Real programmes are read on-chain;
 * sample programmes return their stand-in chain read.
 */
export async function readPhase(programme: DirectoryProgramme, client: () => Programme): Promise<Phase> {
  if (programme.sample) return programme.chain.phase;
  const read = await client().get_phase();
  const tag = read.result.unwrap().tag;
  if (!isPhase(tag)) throw new Error(`Unknown phase ${String(tag)}`);
  return tag;
}

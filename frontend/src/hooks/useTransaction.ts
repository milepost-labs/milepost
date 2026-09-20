import { useCallback, useRef, useState } from 'react';
import { useWallet } from '../context/useWallet';
import { explain, type ContractName, type Explained } from '../lib/errors';

/**
 * One way to send a transaction.
 *
 * Nothing in this app had ever written to a contract, which meant whoever built
 * the first write path would define it for every screen after it. Since these
 * screens move money, that is not a decision to leave to whoever happens to
 * start first.
 *
 * The sequence is always the same: refuse if no wallet, refuse if the wallet is
 * on the wrong network, build and simulate, sign, submit, then let the caller
 * refresh whatever the transaction changed.
 */

export type TransactionPhase =
  | 'idle'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'error';

/** A transaction the generated clients produced but have not yet sent. */
interface Sendable<T> {
  signAndSend: (options: {
    signTransaction: (xdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>;
  }) => Promise<{ result: T }>;
}

export interface TransactionState<T> {
  phase: TransactionPhase;
  /** True from build through submit. Bind this to a button's `loading`. */
  busy: boolean;
  error: Explained | null;
  result: T | null;
  /** Resolves to the result, or null if it failed. Never throws. */
  send: (build: () => Promise<Sendable<T>>) => Promise<T | null>;
  reset: () => void;
}

export function useTransaction<T = unknown>(
  options: { contract?: ContractName; onSuccess?: (result: T) => void } = {},
): TransactionState<T> {
  const { contract = 'program', onSuccess } = options;
  const wallet = useWallet();

  const [phase, setPhase] = useState<TransactionPhase>('idle');
  const [error, setError] = useState<Explained | null>(null);
  const [result, setResult] = useState<T | null>(null);

  // Guards against a double-click submitting twice. A duplicated contribution
  // is real money, so this is not merely tidiness.
  const inFlight = useRef(false);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setResult(null);
  }, []);

  const send = useCallback(
    async (build: () => Promise<Sendable<T>>): Promise<T | null> => {
      if (inFlight.current) return null;

      if (!wallet.address) {
        setPhase('error');
        setError({ kind: 'blocked', message: 'Connect a wallet first.', action: 'Use Connect in the header.' });
        return null;
      }
      if (wallet.status === 'wrong-network') {
        setPhase('error');
        setError({
          kind: 'blocked',
          message: wallet.networkError ?? 'Your wallet is on a different network.',
          action: 'Switch network in Freighter and try again.',
        });
        return null;
      }

      inFlight.current = true;
      setError(null);
      setResult(null);

      try {
        // Building also simulates, so most contract errors surface here —
        // before anything is signed, which is the good place for them.
        setPhase('building');
        const transaction = await build();

        setPhase('signing');
        const sent = await transaction.signAndSend({ signTransaction: wallet.signTransaction });

        setPhase('submitting');
        setResult(sent.result);
        setPhase('success');
        onSuccess?.(sent.result);
        return sent.result;
      } catch (caught) {
        const explained = explain(caught, contract);
        setError(explained);
        // A declined signature is a choice, not a failure. Treating it as an
        // error leaves a red banner over a decision someone deliberately made.
        setPhase(explained.kind === 'none' ? 'idle' : 'error');
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [wallet, contract, onSuccess],
  );

  return {
    phase,
    busy: phase === 'building' || phase === 'signing' || phase === 'submitting',
    error,
    result,
    send,
    reset,
  };
}

/** What to show while a transaction is in flight. */
export function phaseLabel(phase: TransactionPhase): string {
  switch (phase) {
    case 'building':
      return 'Preparing…';
    case 'signing':
      return 'Waiting for your signature…';
    case 'submitting':
      return 'Submitting…';
    case 'success':
      return 'Done';
    default:
      return '';
  }
}

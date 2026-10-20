import { useCallback, useEffect, useRef, useState } from 'react';
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
export interface Sendable<T> {
  signAndSend: (options: {
    signTransaction: (xdr: string) => Promise<{ signedTxXdr: string; signerAddress: string }>;
  }) => Promise<{ result: T }>;
  /** Simulation fee in stroops, when the binding exposes it. */
  estimatedFee?: bigint;
}

export interface TransactionState<T> {
  phase: TransactionPhase;
  /** True from build through submit. Bind this to a button's `loading`. */
  busy: boolean;
  error: Explained | null;
  result: T | null;
  /** Fee from the latest simulation, available before signing. */
  estimatedFee: bigint | null;
  /** True when confirmation has taken longer than the safe waiting threshold. */
  slow: boolean;
  /** Resolves to the result, or null if it failed. Never throws. */
  send: (build: () => Promise<Sendable<T>>) => Promise<T | null>;
  reset: () => void;
}

export function useTransaction<T = unknown>(
  options: {
    contract?: ContractName;
    onSuccess?: (result: T) => void;
    /** Called whenever a send fails, including before signing is attempted. */
    onError?: (error: Explained) => void;
  } = {},
): TransactionState<T> {
  const { contract = 'program', onSuccess, onError } = options;
  const wallet = useWallet();

  const [phase, setPhase] = useState<TransactionPhase>('idle');
  const [error, setError] = useState<Explained | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [estimatedFee, setEstimatedFee] = useState<bigint | null>(null);
  const [slow, setSlow] = useState(false);

  // Guards against a double-click submitting twice. A duplicated contribution
  // is real money, so this is not merely tidiness.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!inFlight.current) return;
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setResult(null);
    setEstimatedFee(null);
    setSlow(false);
  }, []);

  const send = useCallback(
    async (build: () => Promise<Sendable<T>>): Promise<T | null> => {
      if (inFlight.current) return null;

      if (!wallet.address) {
        const blocked: Explained = {
          kind: 'blocked',
          message: 'Connect a wallet first.',
          action: 'Use Connect in the header.',
        };
        setPhase('error');
        setError(blocked);
        onError?.(blocked);
        return null;
      }
      if (wallet.status === 'wrong-network') {
        const blocked: Explained = {
          kind: 'blocked',
          message:
            wallet.networkError ??
            `Your wallet is on ${wallet.network ?? 'an unknown network'}, but these contracts are deployed on ${wallet.expectedNetwork}.`,
          action: 'Switch network in Freighter, then check again and try again.',
        };
        setPhase('error');
        setError(blocked);
        onError?.(blocked);
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
        const simulation = transaction as Sendable<T> & {
          simulationResponse?: { minResourceFee?: string | number | bigint };
        };
        const rawFee = simulation.estimatedFee ?? simulation.simulationResponse?.minResourceFee;
        if (rawFee !== undefined) setEstimatedFee(BigInt(rawFee));

        setPhase('signing');
        const sent = await transaction.signAndSend({ signTransaction: wallet.signTransaction });

        setPhase('submitting');
        setResult(sent.result);
        setPhase('success');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('milepost:transaction-success'));
        }
        onSuccess?.(sent.result);
        return sent.result;
      } catch (caught) {
        const explained = explain(caught, contract);
        setError(explained);
        // A declined signature is a choice, not a failure. Treating it as an
        // error leaves a red banner over a decision someone deliberately made.
        setPhase(explained.kind === 'none' ? 'idle' : 'error');
        onError?.(explained);
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [wallet, contract, onSuccess, onError],
  );

  return {
    phase,
    busy: phase === 'building' || phase === 'signing' || phase === 'submitting',
    error,
    result,
    estimatedFee,
    slow,
    send,
    reset,
  };
}

/** What to show while a transaction is in flight. */
export function phaseLabel(phase: string): string {
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

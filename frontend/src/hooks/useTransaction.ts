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
 * on the wrong network, build and simulate, optionally pause to show the
 * simulated fee, sign, submit, then let the caller refresh whatever the
 * transaction changed.
 */

export type TransactionPhase =
  | 'idle'
  | 'building'
  | 'confirming'
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
  /** True from build through submit (excluding the interactive confirm pause). Bind this to a button's `loading`. */
  busy: boolean;
  error: Explained | null;
  result: T | null;
  /** Fee from the latest simulation, available before signing. */
  estimatedFee: bigint | null;
  /** True when confirmation has taken longer than the safe waiting threshold. */
  slow: boolean;
  /** Build, simulate, sign, and submit in one step. Resolves to the result, or null if it failed. Never throws. */
  send: (build: () => Promise<Sendable<T>>) => Promise<T | null>;
  /**
   * Build and simulate without signing yet, stopping in the `confirming` phase
   * with `estimatedFee` populated so a write sheet can show the network fee
   * before asking for a signature. Returns true when ready to confirm.
   */
  prepare: (build: () => Promise<Sendable<T>>) => Promise<boolean>;
  /** Sign and submit the transaction prepared by `prepare()`. Resolves to the result or null. */
  confirm: () => Promise<T | null>;
  reset: () => void;
}

function extractFee<T>(transaction: Sendable<T>): bigint | null {
  const simulation = transaction as Sendable<T> & {
    simulationResponse?: { minResourceFee?: string | number | bigint };
  };
  const rawFee = simulation.estimatedFee ?? simulation.simulationResponse?.minResourceFee;
  return rawFee !== undefined ? BigInt(rawFee) : null;
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
  const preparedRef = useRef<Sendable<T> | null>(null);

  useEffect(() => {
    if (!inFlight.current) return;
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const reset = useCallback(() => {
    preparedRef.current = null;
    setPhase('idle');
    setError(null);
    setResult(null);
    setEstimatedFee(null);
    setSlow(false);
  }, []);

  const checkWalletReady = useCallback((): boolean => {
    if (!wallet.address) {
      const blocked: Explained = {
        kind: 'blocked',
        message: 'Connect a wallet first.',
        action: 'Use Connect in the header.',
      };
      setPhase('error');
      setError(blocked);
      onError?.(blocked);
      return false;
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
      return false;
    }
    return true;
  }, [wallet.address, wallet.status, wallet.networkError, wallet.network, wallet.expectedNetwork, onError]);

  const prepare = useCallback(
    async (build: () => Promise<Sendable<T>>): Promise<boolean> => {
      if (inFlight.current) return false;
      if (!checkWalletReady()) return false;

      inFlight.current = true;
      preparedRef.current = null;
      setError(null);
      setResult(null);
      setEstimatedFee(null);

      try {
        setPhase('building');
        const transaction = await build();
        const fee = extractFee(transaction);
        if (fee !== null) setEstimatedFee(fee);
        preparedRef.current = transaction;
        setPhase('confirming');
        return true;
      } catch (caught) {
        const explained = explain(caught, contract);
        setError(explained);
        setPhase(explained.kind === 'none' ? 'idle' : 'error');
        onError?.(explained);
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [checkWalletReady, contract, onError],
  );

  const confirm = useCallback(async (): Promise<T | null> => {
    const transaction = preparedRef.current;
    if (inFlight.current || !transaction) return null;
    if (!checkWalletReady()) return null;

    inFlight.current = true;
    setError(null);

    try {
      setPhase('signing');
      const sent = await transaction.signAndSend({ signTransaction: wallet.signTransaction });

      setPhase('submitting');
      preparedRef.current = null;
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
      setPhase(explained.kind === 'none' ? 'idle' : 'error');
      onError?.(explained);
      return null;
    } finally {
      inFlight.current = false;
    }
  }, [checkWalletReady, wallet.signTransaction, contract, onSuccess, onError]);

  const send = useCallback(
    async (build: () => Promise<Sendable<T>>): Promise<T | null> => {
      if (inFlight.current) return null;
      if (!checkWalletReady()) return null;

      inFlight.current = true;
      preparedRef.current = null;
      setError(null);
      setResult(null);

      try {
        // Building also simulates, so most contract errors surface here —
        // before anything is signed, which is the good place for them.
        setPhase('building');
        const transaction = await build();
        const fee = extractFee(transaction);
        if (fee !== null) setEstimatedFee(fee);

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
    [checkWalletReady, wallet.signTransaction, contract, onSuccess, onError],
  );

  return {
    phase,
    busy: phase === 'building' || phase === 'signing' || phase === 'submitting',
    error,
    result,
    estimatedFee,
    slow,
    send,
    prepare,
    confirm,
    reset,
  };
}

/** What to show while a transaction is in flight. */
export function phaseLabel(phase: string): string {
  switch (phase) {
    case 'building':
      return 'Preparing…';
    case 'confirming':
      return 'Ready to sign';
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

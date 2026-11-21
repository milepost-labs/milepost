import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../context/useWallet';
import { explain, type CodeOverrides, type ContractName, type Explained } from '../lib/errors';
import { restoreOf, type RestoreStep } from '../lib/restore';
import { requestRestoreConsent } from '../lib/restoreConsent';

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
 *
 * When the simulation says archived entries must be restored first, it asks
 * once (through the layout's restore prompt), sends the restore, then builds
 * and simulates the original again. Declining sends nothing.
 */

export type TransactionPhase =
  | 'idle'
  | 'building'
  | 'restoring'
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
  /**
   * Archived entries the write needs restored first. Wrappers around an
   * assembled transaction pass `restoreFromAssembled(assembled)`; an
   * assembled transaction sent as is is checked directly.
   */
  restore?: RestoreStep | null;
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
    /** Re-words specific error codes for this write only. Pass a module-level constant. */
    overrides?: CodeOverrides;
    onSuccess?: (result: T) => void;
    /** Called whenever a send fails, including before signing is attempted. */
    onError?: (error: Explained) => void;
  } = {},
): TransactionState<T> {
  const { contract = 'program', overrides, onSuccess, onError } = options;
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

  /**
   * Builds and simulates. When the simulation asks for archived entries to be
   * restored first, asks once, sends the restore, then builds again — the
   * restore moved the account's sequence on.
   */
  const buildRestoring = useCallback(
    async (build: () => Promise<Sendable<T>>): Promise<Sendable<T>> => {
      const transaction = await build();
      const restore = restoreOf(transaction);
      if (!restore) return transaction;
      const consent = await requestRestoreConsent(restore.feeStroops);
      if (consent === null) throw new Error('Expired state: the restore preamble needs restoring first.');
      if (!consent) throw new Error('RestoreDeclined');
      setPhase('restoring');
      await restore.run(wallet.signTransaction);
      setPhase('building');
      const rebuilt = await build();
      if (restoreOf(rebuilt)) throw new Error('Expired state: entries are still archived after the restore.');
      return rebuilt;
    },
    [wallet.signTransaction],
  );

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
        const transaction = await buildRestoring(build);
        const fee = extractFee(transaction);
        if (fee !== null) setEstimatedFee(fee);
        preparedRef.current = transaction;
        setPhase('confirming');
        return true;
      } catch (caught) {
        const explained = explain(caught, contract, overrides);
        setError(explained);
        setPhase(explained.kind === 'none' ? 'idle' : 'error');
        onError?.(explained);
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [checkWalletReady, buildRestoring, contract, overrides, onError],
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
      const explained = explain(caught, contract, overrides);
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
        const transaction = await buildRestoring(build);
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
        const explained = explain(caught, contract, overrides);
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
    [checkWalletReady, buildRestoring, wallet.signTransaction, contract, overrides, onSuccess, onError],
  );

  return {
    phase,
    busy: phase === 'building' || phase === 'restoring' || phase === 'signing' || phase === 'submitting',
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
    case 'restoring':
      return 'Restoring archived data…';
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

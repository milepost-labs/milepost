import { useEffect, useRef } from 'react';
import { announce } from './announce';

/**
 * Hook that wraps a `TransactionState` and announces phase transitions
 * through the global live region.
 *
 * Import `announce` from ./announce to use the live region directly from
 * non-component code.
 */
export function useAnnouncedTransaction<T>(
  tx: { phase: string; error: { message: string } | null; result: T | null },
  actionLabel: string,
) {
  const prevPhase = useRef(tx.phase);

  useEffect(() => {
    if (tx.phase === prevPhase.current) return;
    prevPhase.current = tx.phase;

    switch (tx.phase) {
      case 'building':
        announce(`${actionLabel}: preparing transaction.`);
        break;
      case 'signing':
        announce(`${actionLabel}: waiting for your signature.`);
        break;
      case 'submitting':
        announce(`${actionLabel}: submitting to the network.`);
        break;
      case 'success':
        announce(`${actionLabel}: confirmed.`);
        break;
      case 'error':
        if (tx.error) {
          announce(`${actionLabel}: failed. ${tx.error.message}`);
        }
        break;
      default:
        break;
    }
  }, [tx.phase, tx.error, actionLabel]);
}

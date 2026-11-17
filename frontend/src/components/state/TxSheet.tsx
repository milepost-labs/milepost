import type { ReactNode } from 'react';
import type { TransactionState } from '../../hooks/useTransaction';
import type { ReceiptRow } from '../ui';
import { Button, Modal } from '../ui';
import { TxDone, TxFailed, TxPending } from './TxStatus';

export interface TxSheetProps<T> {
  open: boolean;
  onClose: () => void;
  /** The write this sheet shows. */
  tx: TransactionState<T>;
  eyebrow: string;
  /** While pending, e.g. "Installing the policy signer". */
  pendingTitle: string;
  /** Once confirmed, e.g. "Policy installed". */
  doneTitle: string;
  /** One sentence on what changed. */
  doneText?: ReactNode;
  doneRows?: ReceiptRow[];
  /** When it fails, e.g. "Policy not installed". */
  failTitle: string;
  onRetry?: () => void;
}

/**
 * The sheet a single write runs in: pending with its three steps, then the
 * receipt, or the explained failure with a retry. Open it when the write
 * starts; it can't be dismissed while the transaction is in flight.
 *
 * A failure is shown whenever there is an error and nothing in flight,
 * because `useTransaction` returns to idle, not error, for answers like a
 * declined signature.
 */
export function TxSheet<T>({
  open,
  onClose,
  tx,
  eyebrow,
  pendingTitle,
  doneTitle,
  doneText,
  doneRows,
  failTitle,
  onRetry,
}: TxSheetProps<T>) {
  const close = () => {
    if (tx.busy) return;
    onClose();
  };
  const done = tx.phase === 'success';
  const failed = !done && tx.error !== null && !tx.busy;

  return (
    <Modal open={open} onClose={close} busy={tx.busy} eyebrow={eyebrow} title={done ? doneTitle : failed ? failTitle : pendingTitle}>
      {done ? (
        <TxDone title={doneTitle} rows={doneRows} actions={<Button onClick={close}>Done</Button>}>
          {doneText && <p>{doneText}</p>}
        </TxDone>
      ) : failed && tx.error ? (
        <TxFailed
          title={failTitle}
          explained={tx.error}
          onRetry={onRetry}
          actions={
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          }
        />
      ) : (
        <TxPending title={pendingTitle} phase={tx.phase} />
      )}
    </Modal>
  );
}

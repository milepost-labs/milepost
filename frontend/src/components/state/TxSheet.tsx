import type { ReactNode } from 'react';
import { NETWORK } from '../../config/network';
import { useBalances } from '../../hooks/useBalances';
import type { TransactionState } from '../../hooks/useTransaction';
import { checkXlmForFee, formatNetworkFee, insufficientXlmWarning } from '../../lib/txFee';
import type { ReceiptRow } from '../ui';
import { Button, Modal, Notice } from '../ui';
import { TxDone, TxFailed, TxPending } from './TxStatus';

export interface TxSheetProps<T> {
  open: boolean;
  onClose: () => void;
  /** The write this sheet shows. */
  tx: TransactionState<T>;
  eyebrow: string;
  /** While confirming the simulated fee before signing. */
  confirmTitle?: string;
  /** Optional summary shown on the confirm step. */
  confirmText?: ReactNode;
  /** Label on the primary sign button. Defaults to "Sign and send". */
  confirmLabel?: string;
  /** Called when the user confirms signing. Defaults to `tx.confirm()`. */
  onConfirm?: () => void;
  /** Holds the sign button back, e.g. until a typed confirmation matches. */
  confirmDisabled?: boolean;
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
  /** Optional XLM balance override in stroops (for tests); defaults to `useBalances().xlm`. */
  xlmBalance?: bigint | null;
  /** Optional Friendbot flag override (for tests); defaults to `NETWORK.friendbot`. */
  friendbot?: boolean;
}

/**
 * The sheet a single write runs in: simulation and fee confirmation (with an
 * XLM balance check before signing), pending with its three steps, then the
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
  confirmTitle = 'Review and sign',
  confirmText,
  confirmLabel = 'Sign and send',
  onConfirm,
  confirmDisabled = false,
  pendingTitle,
  doneTitle,
  doneText,
  doneRows,
  failTitle,
  onRetry,
  xlmBalance,
  friendbot = NETWORK.friendbot,
}: TxSheetProps<T>) {
  const balances = useBalances();
  const effectiveXlm = xlmBalance !== undefined ? xlmBalance : balances.xlm;

  const close = () => {
    if (tx.busy) return;
    onClose();
  };
  const done = tx.phase === 'success';
  const failed = !done && tx.error !== null && !tx.busy;
  const confirming = tx.phase === 'confirming';
  const balanceCheck = checkXlmForFee(effectiveXlm, tx.estimatedFee);

  const handleConfirm = () => {
    if (balanceCheck.insufficient || confirmDisabled) return;
    if (onConfirm) {
      onConfirm();
    } else {
      void tx.confirm();
    }
  };

  const title = done
    ? doneTitle
    : failed
      ? failTitle
      : confirming
        ? confirmTitle
        : pendingTitle;

  return (
    <Modal open={open} onClose={close} busy={tx.busy} eyebrow={eyebrow} title={title}>
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
      ) : confirming ? (
        <div className="state-tx state-tx--confirm">
          {confirmText && <div className="state-tx__note">{confirmText}</div>}
          <p className="state-tx__fee numeric">
            {tx.estimatedFee !== null
              ? formatNetworkFee(tx.estimatedFee)
              : 'Network fee: calculated at signing'}
          </p>
          {balanceCheck.insufficient &&
            balanceCheck.balance !== null &&
            balanceCheck.fee !== null && (
              <div className="state-tx__warn">
                <Notice tone="warn" role="alert">
                  {insufficientXlmWarning(balanceCheck.balance, balanceCheck.fee, friendbot)}
                </Notice>
              </div>
            )}
          <div className="state-tx__actions">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={balanceCheck.insufficient || confirmDisabled}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : (
        <TxPending title={pendingTitle} phase={tx.phase} />
      )}
    </Modal>
  );
}

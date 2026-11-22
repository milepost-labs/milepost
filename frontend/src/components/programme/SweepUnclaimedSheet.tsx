import { useEffect } from 'react';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useTransaction } from '../../hooks/useTransaction';
import { formatIn } from '../../lib/funding';
import { receiptOf, type TxReceipt } from '../../lib/fundingTx';
import { restoreFromAssembled } from '../../lib/restore';
import { shortId } from '../../lib/programmeView';
import { TxSheet } from '../state/TxSheet';
import { AddressChip, CopyButton, TxExplorerLink } from '../ui';

interface UnclaimedSwept {
  amount: bigint;
  receipt: TxReceipt;
}

export interface SweepUnclaimedSheetProps {
  programmeId: string;
  open: boolean;
  onClose: () => void;
  asset: string;
  /** Where the money goes: `get_config().treasury`. */
  treasury: string;
  /** Called after the sweep lands, so the page can re-read what changed. */
  onSwept: () => void;
}

/**
 * Sending unclaimed refunds to the treasury, in the shared write sheet. The
 * amount is not known until the contract answers, so the confirm step says
 * what the sweep does and that it is final, and the receipt shows the amount
 * the contract returned.
 */
export function SweepUnclaimedSheet({ programmeId, open, onClose, asset, treasury, onSwept }: SweepUnclaimedSheetProps) {
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<UnclaimedSwept>({
    contract: 'program',
    onSuccess: (swept) => {
      onSwept();
      announce(`Unclaimed refunds of ${formatIn(swept.amount, asset)} sent to the treasury.`);
    },
  });

  const prepare = () => {
    void tx.prepare(async () => {
      const assembled = await programmeAt(programmeId).sweep_unclaimed();
      const rawFee = (
        assembled as unknown as { simulationResponse?: { minResourceFee?: string | number | bigint } }
      ).simulationResponse?.minResourceFee;
      return {
        restore: restoreFromAssembled(assembled),
        estimatedFee: rawFee !== undefined ? BigInt(rawFee) : undefined,
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          return { result: { amount: sent.result.unwrap(), receipt: receiptOf(sent) } };
        },
      };
    });
  };

  // Simulate as soon as the sheet opens so the fee is ready before signing.
  useEffect(() => {
    if (open && tx.phase === 'idle' && !tx.result) prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (tx.phase === 'error' && tx.error) {
      announce(`The unclaimed refunds were not sent. ${tx.error.message}`, 'alert');
    }
  }, [announce, tx.error, tx.phase]);

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    onClose();
  };

  const doneRows = tx.result
    ? [
        { label: 'Sent to the treasury', value: formatIn(tx.result.amount, asset) },
        { label: 'Treasury', value: <AddressChip address={treasury} showExplorerLink copyLabel="Copy treasury address" /> },
        {
          label: 'Transaction',
          value: tx.result.receipt.hash ? (
            <span className="programme-actions__hash">
              <span title={tx.result.receipt.hash}>{shortId(tx.result.receipt.hash)}</span>
              <CopyButton value={tx.result.receipt.hash} label="Copy transaction hash" />
              <TxExplorerLink hash={tx.result.receipt.hash} />
            </span>
          ) : (
            'Not reported'
          ),
        },
      ]
    : undefined;

  return (
    <TxSheet
      open={open}
      onClose={close}
      tx={tx}
      eyebrow="Unclaimed refunds"
      confirmTitle="Send unclaimed refunds to the treasury"
      confirmText={
        <>
          <p>
            Everything the programme still holds, because no donor came back for it, goes to the treasury:
          </p>
          <p>
            <AddressChip address={treasury} showExplorerLink copyLabel="Copy treasury address" />
          </p>
          <p>
            <strong>This is final.</strong> Once it is sent, donors who have not yet claimed can no longer get that
            money back. The amount is worked out by the contract when the transaction runs, and the receipt shows
            it.
          </p>
        </>
      }
      confirmLabel="Sign and send to treasury"
      pendingTitle="Sending unclaimed refunds"
      doneTitle="Unclaimed refunds sent"
      doneText="Whatever no donor claimed has gone to the treasury."
      doneRows={doneRows}
      failTitle={tx.phase === 'idle' && tx.error ? 'Nothing was sent' : 'The unclaimed refunds were not sent'}
      onRetry={prepare}
    />
  );
}

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

interface FeeSwept {
  amount: bigint;
  receipt: TxReceipt;
}

export interface SweepFeeSheetProps {
  programmeId: string;
  open: boolean;
  onClose: () => void;
  /** The protocol fee as `fee()` reports it, so the amount is on screen before signing. */
  fee: bigint;
  asset: string;
  /** Where the fee goes: `get_config().treasury`. */
  treasury: string;
  /** Called after the fee has been sent, so the page can re-read what changed. */
  onSwept: () => void;
}

/**
 * Sending the protocol fee to the treasury, in the shared write sheet:
 * simulates first so the network fee and XLM balance check show before
 * signing, says how much goes where, then the receipt or the explained failure.
 */
export function SweepFeeSheet({ programmeId, open, onClose, fee, asset, treasury, onSwept }: SweepFeeSheetProps) {
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<FeeSwept>({
    contract: 'program',
    onSuccess: (swept) => {
      onSwept();
      announce(`Protocol fee of ${formatIn(swept.amount, asset)} sent to the treasury.`);
    },
  });

  const prepare = () => {
    void tx.prepare(async () => {
      const assembled = await programmeAt(programmeId).sweep_fee();
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
      announce(`The fee was not sent. ${tx.error.message}`, 'alert');
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
      eyebrow="Protocol fee"
      confirmTitle="Send the protocol fee"
      confirmText={
        <>
          <p>
            Send <span className="numeric">{formatIn(fee, asset)}</span>, the protocol&rsquo;s cut of the
            contributions, to the treasury:
          </p>
          <p>
            <AddressChip address={treasury} showExplorerLink copyLabel="Copy treasury address" />
          </p>
          <p>
            This money was never part of the budget awarded to anyone. Anyone can send it, and it can only be
            sent once.
          </p>
        </>
      }
      confirmLabel="Sign and send fee"
      pendingTitle="Sending the protocol fee"
      doneTitle="Fee sent to the treasury"
      doneText="The protocol fee has left the programme. It can’t be sent again."
      doneRows={doneRows}
      failTitle={tx.phase === 'idle' && tx.error ? 'Nothing was sent' : 'The fee was not sent'}
      onRetry={prepare}
    />
  );
}

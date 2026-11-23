import { useEffect, useState } from 'react';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useTransaction } from '../../hooks/useTransaction';
import { validateAmount } from '../../lib/amount';
import { formatIn, type ContributionCard } from '../../lib/funding';
import { FIXTURE_TX } from '../../fixtures/funding';
import { receiptOf, sampleSendable, type TxReceipt } from '../../lib/fundingTx';
import { shortId } from '../../lib/programmeView';
import { restoreFromAssembled } from '../../lib/restore';
import { TxSheet } from '../state/TxSheet';
import { AmountField, Button, CopyButton, Modal, SampleTag, TxExplorerLink } from '../ui';
import './ContributeSheet.css';

interface PartialRefund {
  amount: bigint;
  receipt: TxReceipt;
}

export interface PartialRefundSheetProps {
  card: ContributionCard;
  open: boolean;
  onClose: () => void;
  /** What the donor can still claim, per the contract's formula. */
  remaining: bigint;
  /** What the donor has claimed so far, before this claim. */
  claimedSoFar: bigint;
  /** Called once the claim has landed, so the card re-reads what it shows. */
  onClaimed: (amount: bigint) => void;
  sampleDelayMs: number;
}

/**
 * Claiming part of a refund: an amount capped at what is still claimable, then
 * `refund_partial` in the shared write sheet. The rest stays claimable, or goes
 * to the sweep if it is never claimed, and the receipt says how much is left.
 */
export function PartialRefundSheet({
  card,
  open,
  onClose,
  remaining,
  claimedSoFar,
  onClaimed,
  sampleDelayMs,
}: PartialRefundSheetProps) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const [amount, setAmount] = useState('');
  // The figures this claim started from. The card re-reads as soon as the
  // claim lands, so the receipt must not move with it.
  const [started, setStarted] = useState<{ remaining: bigint; claimedSoFar: bigint } | null>(null);

  const tx = useTransaction<PartialRefund>({
    contract: 'program',
    onSuccess: (claimed) => {
      onClaimed(claimed.amount);
      announce(`Refund of ${formatIn(claimed.amount, card.asset)} sent to your wallet.`);
    },
  });

  const check = validateAmount(amount, {
    balance: remaining,
    asset: card.asset,
    overMessage: `More than the ${formatIn(remaining, card.asset)} still claimable`,
  });

  const prepare = (value: bigint) => {
    if (!address) return;
    void tx.prepare(async () => {
      if (card.sample) {
        return sampleSendable(
          () => ({ amount: value, receipt: { hash: FIXTURE_TX.hash, ledger: FIXTURE_TX.ledger } }),
          sampleDelayMs,
        );
      }
      const assembled = await programmeAt(card.programmeId).refund_partial({ donor: address, amount: value });
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

  const start = () => {
    if (!check.ok) return;
    setStarted({ remaining, claimedSoFar });
    prepare(check.value);
  };

  useEffect(() => {
    if (tx.phase === 'error' && tx.error) announce(`Refund didn't go through. ${tx.error.message}`, 'alert');
  }, [announce, tx.error, tx.phase]);

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    setStarted(null);
    setAmount('');
    onClose();
  };

  if (started === null) {
    return (
      <Modal open={open} onClose={close} eyebrow={card.name} title="Claim part of your refund">
        <div className="contribute__amount-step">
          <p className="contribute__aside">
            Take some of your refund now and leave the rest. What you leave stays claimable until the programme
            sweeps what no donor came back for.
          </p>
          <AmountField
            label="Amount to claim"
            value={amount}
            onChange={setAmount}
            asset={card.asset}
            balance={remaining}
            overMessage={`More than the ${formatIn(remaining, card.asset)} still claimable`}
            hint={`Still claimable: ${formatIn(remaining, card.asset)}`}
            offerMax
          />
          <div className="contribute__actions">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={start} disabled={!check.ok || !address}>
              Continue
            </Button>
          </div>
          {!address && <p className="contribute__aside">Connect a wallet to claim.</p>}
        </div>
      </Modal>
    );
  }

  const claimed = tx.result?.amount ?? 0n;
  const doneRows = tx.result
    ? [
        { label: 'Claimed now', value: formatIn(claimed, card.asset) },
        { label: 'Claimed so far', value: formatIn(started.claimedSoFar + claimed, card.asset) },
        { label: 'Still claimable', value: formatIn(started.remaining - claimed, card.asset) },
        {
          label: 'Transaction',
          value: tx.result.receipt.hash ? (
            <span className="contribute__hash">
              <span title={tx.result.receipt.hash}>{shortId(tx.result.receipt.hash)}</span>
              <CopyButton value={tx.result.receipt.hash} label="Copy transaction hash" />
              {!card.sample && <TxExplorerLink hash={tx.result.receipt.hash} />}
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
      eyebrow={card.name}
      confirmTitle="Claim part of your refund"
      confirmText={
        check.ok ? (
          <p>
            Claim <span className="numeric">{formatIn(check.value, card.asset)}</span> back to your wallet. That
            leaves <span className="numeric">{formatIn(started.remaining - check.value, card.asset)}</span> still
            claimable.
          </p>
        ) : undefined
      }
      confirmLabel="Sign and claim"
      pendingTitle="Claiming part of your refund"
      doneTitle="Part of your refund claimed"
      doneRows={doneRows}
      doneText={
        tx.result ? (
          <>
            {formatIn(claimed, card.asset)} sent back to your wallet.{' '}
            {started.remaining - claimed > 0n
              ? `${formatIn(started.remaining - claimed, card.asset)} is still yours to claim.`
              : 'That was the last of your share.'}
            {card.sample && (
              <span className="contribute__sample">
                {' '}
                <SampleTag>Sample receipt</SampleTag>
              </span>
            )}
          </>
        ) : undefined
      }
      failTitle={tx.phase === 'idle' && tx.error ? 'Nothing was sent' : "Refund didn't go through"}
      onRetry={() => {
        if (check.ok) prepare(check.value);
      }}
    />
  );
}

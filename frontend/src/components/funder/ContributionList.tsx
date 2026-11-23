import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useTransaction } from '../../hooks/useTransaction';
import { useRefundRemaining } from '../../hooks/useRefundRemaining';
import { describeAmount } from '../../lib/amount';
import { formatDate } from '../../lib/format';
import { formatEstimatedRefund, formatIn, formatShare, type ContributionCard } from '../../lib/funding';
import { FIXTURE_TX } from '../../fixtures/funding';
import { receiptOf, SAMPLE_TX_DELAY_MS, sampleSendable, type TxReceipt } from '../../lib/fundingTx';
import { formatFigure, shortId } from '../../lib/programmeView';
import { MoneyRow } from '../programme/MoneyRow';
import { PartialRefundSheet } from './PartialRefundSheet';
import { TxSheet } from '../state/TxSheet';
import { Button, CopyButton, PhaseBadge, SampleTag, TxExplorerLink } from '../ui';
import { restoreFromAssembled } from '../../lib/restore';

export interface ContributionListProps {
  cards: ContributionCard[];
  onRefunded: (programmeId: string) => void;
  /**
   * Unix-second release deadlines keyed by programme id, used to say when
   * refunds open while the release window is still running.
   */
  releaseDeadlines?: ReadonlyMap<string, bigint>;
  sampleDelayMs?: number;
}

interface Refund {
  amount: bigint;
  receipt: TxReceipt;
}

/**
 * Claiming a refund, in the shared write sheet: simulates first to show the
 * network fee and XLM balance check, then sends on confirmation and shows the
 * receipt or failure with retry.
 */
function RefundSheet({
  card,
  refundable,
  open,
  onClose,
  onRefunded,
  sampleDelayMs,
}: {
  card: ContributionCard;
  /** What this claim will send: the whole of what is still claimable. */
  refundable: bigint;
  open: boolean;
  onClose: () => void;
  onRefunded: (programmeId: string) => void;
  sampleDelayMs: number;
}) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<Refund>({
    contract: 'program',
    onSuccess: (refunded) => {
      onRefunded(card.programmeId);
      announce(`Refund of ${formatIn(refunded.amount, card.asset)} sent to your wallet.`);
    },
  });

  const prepareRefund = () => {
    if (!address) return;
    void tx.prepare(async () => {
      if (card.sample) {
        return sampleSendable(
          () => ({ amount: refundable, receipt: { hash: FIXTURE_TX.hash, ledger: FIXTURE_TX.ledger } }),
          sampleDelayMs,
        );
      }
      const assembled = await programmeAt(card.programmeId).refund({ donor: address });
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
    if (open && tx.phase === 'idle' && !tx.result) prepareRefund();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (tx.phase === 'error' && tx.error) announce(`Refund didn't go through. ${tx.error.message}`, 'alert');
  }, [announce, tx.error, tx.phase]);

  const close = () => {
    if (tx.busy) return;
    tx.reset();
    onClose();
  };

  const doneRows = tx.result
    ? [
        { label: 'Refunded', value: formatIn(tx.result.amount, card.asset) },
        {
          label: 'Ledger',
          value: tx.result.receipt.ledger !== null ? tx.result.receipt.ledger.toLocaleString() : 'Not reported',
        },
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
      confirmTitle="Claim your refund"
      confirmText={
        <p>
          Claim <span className="numeric">{formatIn(refundable, card.asset)}</span> back to your wallet, in
          proportion to what you put in.
        </p>
      }
      confirmLabel="Sign and claim refund"
      pendingTitle="Claiming your refund"
      doneTitle="Refund claimed"
      doneRows={doneRows}
      doneText={
        tx.result ? (
          <>
            {formatIn(tx.result.amount, card.asset)} sent back to your wallet, in proportion to what you put in.
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
      onRetry={prepareRefund}
    />
  );
}

function ContributionItem({
  card,
  onRefunded,
  releaseDeadline,
  sampleDelayMs,
}: {
  card: ContributionCard;
  onRefunded: (programmeId: string) => void;
  releaseDeadline: bigint | null;
  sampleDelayMs: number;
}) {
  const { address } = useWallet();
  const [claiming, setClaiming] = useState(false);
  const [claimingPart, setClaimingPart] = useState(false);
  // A sample has no contract to read, so what it has claimed is kept here.
  const [sampleClaimed, setSampleClaimed] = useState(0n);

  // On-chain read: how much this donor has received back and how much of
  // their share is still theirs. Skipped for samples and without a wallet.
  const chain = useRefundRemaining(card.programmeId, address ?? null, card.sample);
  const refundedSoFar = card.sample ? sampleClaimed : chain.refundedSoFar;
  // Null while it is being read.
  const stillClaimable = card.sample
    ? card.refundable > sampleClaimed
      ? card.refundable - sampleClaimed
      : 0n
    : chain.remaining;
  const sharePaidOut = stillClaimable !== null && stillClaimable <= 0n && refundedSoFar > 0n;
  const claimable = card.claimable && !sharePaidOut;
  const refreshAfterClaim = chain.refetch;

  const href = `/programme/${encodeURIComponent(card.programmeId)}`;
  const deadline = releaseDeadline !== null && releaseDeadline > 0n ? formatDate(releaseDeadline) : null;
  const estimateText = !card.claimable && !card.refunded ? formatEstimatedRefund(card) : null;

  let waiting: string;
  if (card.phase === 'Open') waiting = deadline ? `Refunds, if any, open after ${deadline}.` : card.note;
  else if (card.phase === 'Settled' && !card.refunded && deadline) waiting = `Releasing. Refunds open after ${deadline}.`;
  else waiting = card.note;

  return (
    <li className={`fund-card${card.phase === 'Cancelled' ? ' fund-card--cancelled' : ''}`}>
      <div className="fund-card__top">
        <span className="fund-card__id numeric">
          {card.asset ? `${shortId(card.programmeId)} · ${card.asset}` : shortId(card.programmeId)}
        </span>
        <PhaseBadge phase={card.phase} />
      </div>

      <h3 className="fund-card__name">
        <Link to={href}>{card.name}</Link>
      </h3>

      <dl className="fund-card__figs">
        <div>
          <dt>You put in</dt>
          <dd className="numeric" aria-label={describeAmount(card.amount, card.asset)}>
            {formatFigure(card.amount)}
          </dd>
        </div>
        <div>
          <dt>Your share</dt>
          <dd className="numeric">{formatShare(card.share)}</dd>
        </div>
        <div>
          <dt>Released, your share</dt>
          <dd className="numeric" aria-label={describeAmount(card.releasedShare, card.asset)}>
            {formatFigure(card.releasedShare)}
          </dd>
        </div>
      </dl>

      {card.chain && (
        <div className="fund-card__money">
          <MoneyRow chain={card.chain} count={40} />
        </div>
      )}

      {refundedSoFar > 0n && (
        <p className="fund-card__refunded-so-far">
          Claimed so far <span className="numeric">{formatIn(refundedSoFar, card.asset)}</span>
          {claimable && stillClaimable !== null && (
            <>
              {' '}
              · Still claimable <span className="numeric">{formatIn(stillClaimable, card.asset)}</span>
            </>
          )}
        </p>
      )}

      {estimateText && (
        <p className="fund-card__estimate">
          <span className="numeric">{estimateText}</span>{' '}
          <span className="fund-card__estimate-tag">(estimate)</span>
        </p>
      )}

      <div className="fund-card__foot">
        {claimable ? (
          <>
            <span className="fund-card__refund">
              <b className="numeric">{formatIn(stillClaimable ?? card.refundable, card.asset)}</b> refundable
              <span className="visually-hidden">. {card.note}</span>
            </span>
            <span className="fund-card__claims">
              <Button
                size="sm"
                variant="secondary"
                disabled={stillClaimable === null || !address}
                aria-describedby={stillClaimable === null || !address ? `claim-part-why-${card.programmeId}` : undefined}
                onClick={() => setClaimingPart(true)}
              >
                Claim part
              </Button>
              <Button size="sm" onClick={() => setClaiming(true)}>
                Claim refund
              </Button>
            </span>
            {(stillClaimable === null || !address) && (
              <span id={`claim-part-why-${card.programmeId}`} className="fund-card__note">
                {address ? 'Reading what is left of your share…' : 'Connect a wallet to claim part of your refund.'}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="fund-card__note">
              {sharePaidOut ? 'You have claimed your whole share.' : card.refunded ? card.note : waiting}
            </span>
            <Link to={href} className="fund-card__follow">
              Follow releases
            </Link>
          </>
        )}
      </div>

      {/* Stays mounted after the claim lands, so its receipt is still shown. */}
      {(claimable || claiming) && (
        <RefundSheet
          card={card}
          refundable={stillClaimable ?? card.refundable}
          open={claiming}
          onClose={() => setClaiming(false)}
          onRefunded={(programmeId) => {
            refreshAfterClaim();
            onRefunded(programmeId);
          }}
          sampleDelayMs={sampleDelayMs}
        />
      )}
      {(claimable || claimingPart) && (
        <PartialRefundSheet
          card={card}
          open={claimingPart}
          onClose={() => setClaimingPart(false)}
          remaining={stillClaimable ?? 0n}
          claimedSoFar={refundedSoFar}
          onClaimed={(amount) => {
            if (card.sample) setSampleClaimed((current) => current + amount);
            else refreshAfterClaim();
          }}
          sampleDelayMs={sampleDelayMs}
        />
      )}
    </li>
  );
}

/**
 * The funder's contributions, one card each: what they put in, their share,
 * their share of what has been released, and where the programme's money is.
 * A refund claim is offered only when it would succeed now: the programme is
 * Cancelled, or Settled with money left unpaid, and this funder has not
 * claimed already.
 */
export function ContributionList({
  cards,
  onRefunded,
  releaseDeadlines,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: ContributionListProps) {
  return (
    <section className="fund-contributions" aria-labelledby="contributions-heading">
      <h2 id="contributions-heading" className="visually-hidden">
        Your contributions
      </h2>
      <ul className="fund-contributions__list">
        {cards.map((card) => (
          <ContributionItem
            key={card.programmeId}
            card={card}
            onRefunded={onRefunded}
            releaseDeadline={releaseDeadlines?.get(card.programmeId) ?? null}
            sampleDelayMs={sampleDelayMs}
          />
        ))}
      </ul>
    </section>
  );
}

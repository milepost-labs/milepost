import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { useTransaction } from '../../hooks/useTransaction';
import { useRefundedTo } from '../../hooks/useRefundedTo';
import { describeAmount } from '../../lib/amount';
import { formatDate } from '../../lib/format';
import { formatIn, formatShare, type ContributionCard } from '../../lib/funding';
import { FIXTURE_TX } from '../../fixtures/funding';
import { receiptOf, SAMPLE_TX_DELAY_MS, sampleSendable, type TxReceipt } from '../../lib/fundingTx';
import { formatFigure, shortId } from '../../lib/programmeView';
import { MoneyRow } from '../programme/MoneyRow';
import { TxDone, TxFailed, TxPending } from '../state/TxStatus';
import { Button, CopyButton, Modal, PhaseBadge, SampleTag, TxExplorerLink } from '../ui';

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
 * Claiming a refund, in a sheet: it opens already sending, then shows the
 * receipt or the failure with a retry. It cannot be closed while in flight.
 */
function RefundSheet({
  card,
  open,
  onClose,
  onRefunded,
  sampleDelayMs,
}: {
  card: ContributionCard;
  open: boolean;
  onClose: () => void;
  onRefunded: (programmeId: string) => void;
  sampleDelayMs: number;
}) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<Refund>({ contract: 'program' });

  const claim = async () => {
    if (!address) return;
    const refunded = await tx.send(async () => {
      if (card.sample) {
        return sampleSendable(
          () => ({ amount: card.refundable, receipt: { hash: FIXTURE_TX.hash, ledger: FIXTURE_TX.ledger } }),
          sampleDelayMs,
        );
      }
      const assembled = await programmeAt(card.programmeId).refund({ donor: address });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          return { result: { amount: sent.result.unwrap(), receipt: receiptOf(sent) } };
        },
      };
    });
    if (refunded !== null) {
      onRefunded(card.programmeId);
      announce(`Refund of ${formatIn(refunded.amount, card.asset)} sent to your wallet.`);
    }
  };

  // The sheet opens because someone pressed Claim: send straight away.
  useEffect(() => {
    if (open && tx.phase === 'idle' && !tx.result) void claim();
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

  const declined = tx.error !== null && tx.phase === 'idle';

  return (
    <Modal open={open} onClose={close} title="Claim your refund" eyebrow={card.name} busy={tx.busy}>
      {tx.phase === 'success' && tx.result ? (
        <TxDone
          title="Refund claimed"
          rows={[
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
          ]}
          actions={<Button onClick={close}>Done</Button>}
        >
          <p>
            {formatIn(tx.result.amount, card.asset)} sent back to your wallet, in proportion to what you put in.
          </p>
          {card.sample && (
            <p className="contribute__sample">
              <SampleTag>Sample receipt</SampleTag>
            </p>
          )}
        </TxDone>
      ) : tx.phase === 'error' && tx.error ? (
        <TxFailed title="Refund didn't go through" explained={tx.error} onRetry={claim} />
      ) : declined ? (
        <TxFailed
          title="Nothing was sent"
          explained={tx.error!}
          actions={
            <>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button onClick={claim}>Try again</Button>
            </>
          }
        />
      ) : (
        <TxPending title="Claiming your refund" phase={tx.phase === 'idle' ? 'building' : tx.phase} />
      )}
    </Modal>
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

  // On-chain read: how much this donor has already received back.
  // Returns 0n for samples; skipped when no wallet is connected.
  const { refundedSoFar } = useRefundedTo(card.programmeId, address ?? null, card.sample);

  const href = `/programme/${encodeURIComponent(card.programmeId)}`;
  const deadline = releaseDeadline !== null && releaseDeadline > 0n ? formatDate(releaseDeadline) : null;

  let waiting: string;
  if (card.phase === 'Open') waiting = deadline ? `Refunds, if any, open after ${deadline}.` : card.note;
  else if (card.phase === 'Settled' && !card.refunded && deadline) waiting = `Releasing. Refunds open after ${deadline}.`;
  else waiting = card.note;

  return (
    <li className={`fund-card${card.phase === 'Cancelled' ? ' fund-card--cancelled' : ''}`}>
      <div className="fund-card__top">
        <span className="fund-card__id numeric">
          {shortId(card.programmeId)} · {card.asset}
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
          Refunded so far <span className="numeric">{formatIn(refundedSoFar, card.asset)}</span>
        </p>
      )}

      <div className="fund-card__foot">
        {card.claimable ? (
          <>
            <span className="fund-card__refund">
              <b className="numeric">{formatIn(card.refundable, card.asset)}</b> refundable
              <span className="visually-hidden">. {card.note}</span>
            </span>
            <Button size="sm" onClick={() => setClaiming(true)}>
              Claim refund
            </Button>
          </>
        ) : (
          <>
            <span className="fund-card__note">{card.refunded ? card.note : waiting}</span>
            <Link to={href} className="fund-card__follow">
              Follow releases
            </Link>
          </>
        )}
      </div>

      {/* Stays mounted after the claim lands, so its receipt is still shown. */}
      {(card.claimable || claiming) && (
        <RefundSheet
          card={card}
          open={claiming}
          onClose={() => setClaiming(false)}
          onRefunded={onRefunded}
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

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { phaseLabel, useTransaction } from '../../hooks/useTransaction';
import { useRefundedTo } from '../../hooks/useRefundedTo';
import type { ContributionCard } from '../../lib/funding';
import { SAMPLE_TX_DELAY_MS, sampleSendable } from '../../lib/fundingTx';
import { formatUsdc } from '../../lib/programmeView';
import { describeAmount } from '../../lib/amount';
import { ErrorPanel } from '../state/AsyncStates';
import '../programme/phasePill.css';
import './Funding.css';

export interface ContributionListProps {
  cards: ContributionCard[];
  /** Ids of programmes whose cards are stand-ins with no contract behind them. */
  sampleIds: ReadonlySet<string>;
  onRefunded: (programmeId: string) => void;
  /**
   * Unix-second release deadlines keyed by programme id, used to render
   * "Refunds open after <date>" before the window opens.
   */
  releaseDeadlines?: ReadonlyMap<string, bigint>;
  sampleDelayMs?: number;
}

function ContributionItem({
  card,
  sample,
  onRefunded,
  releaseDeadline,
  sampleDelayMs,
}: {
  card: ContributionCard;
  sample: boolean;
  onRefunded: (programmeId: string) => void;
  releaseDeadline: bigint | null;
  sampleDelayMs: number;
}) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<bigint>({ contract: 'program' });

  // On-chain read: how much this donor has already received back.
  // Returns 0n for samples; skipped when no wallet is connected.
  const { refundedSoFar } = useRefundedTo(card.programmeId, address ?? null, sample);

  useEffect(() => {
    if (tx.phase === 'error' && tx.error) announce(`Refund didn't go through. ${tx.error.message}`, 'alert');
  }, [announce, tx.error, tx.phase]);

  const claim = async () => {
    if (!address) return;
    const refunded = await tx.send(async () => {
      if (sample) return sampleSendable(() => card.refundable, sampleDelayMs);
      const assembled = await programmeAt(card.programmeId).refund({ donor: address });
      return {
        signAndSend: async (options: Parameters<typeof assembled.signAndSend>[0]) => {
          const sent = await assembled.signAndSend(options);
          return { result: sent.result.unwrap() };
        },
      };
    });
    if (refunded !== null) {
      onRefunded(card.programmeId);
      announce(`Refund of ${formatUsdc(refunded)} sent to your account.`);
    }
  };

  const href = `/programme/${encodeURIComponent(card.programmeId)}`;

  // "Refunds open after <deadline>" — shown when the programme is Settled and
  // the release window hasn't closed yet (i.e. refunds not open). Relies on
  // the release_deadline passed down from the dashboard's on-chain config read.
  const showWhenOpen =
    !sample &&
    card.phase === 'Settled' &&
    !card.claimable &&
    !card.refunded &&
    releaseDeadline !== null &&
    releaseDeadline > 0n;

  // Format the deadline date for display.
  const deadlineDate =
    releaseDeadline !== null && releaseDeadline > 0n
      ? new Date(Number(releaseDeadline) * 1000).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null;

  const showRefundedSoFar = refundedSoFar > 0n;

  return (
    <li className="fund-card">
      <div className="fund-card__head">
        <Link to={href} className="fund-card__name">
          {card.name}
        </Link>
        <span className={`phase-pill phase-pill--${card.phase.toLowerCase()}`}>{card.phase}</span>
      </div>
      <div className="fund-card__body">
        <span className="fund-card__figures">
          <span
            className="fund-card__amount numeric"
            aria-label={describeAmount(card.amount, 'USDC')}
          >
            {formatUsdc(card.amount)}
          </span>
          <span className="fund-card__note">{card.note}</span>

          {/* Refunds open after — only while the release window is still running */}
          {showWhenOpen && deadlineDate && (
            <span className="fund-card__refund-hint" aria-live="polite">
              Refunds open after the release window closes
              {' '}
              <span className="fund-card__refund-hint-date">({deadlineDate})</span>
              .
            </span>
          )}

          {/* Refunded so far — on-chain read, shown once > 0 */}
          {showRefundedSoFar && (
            <span
              className="fund-card__refunded-so-far"
              aria-label={`Refunded so far: ${describeAmount(refundedSoFar, 'USDC')}`}
            >
              <span className="fund-card__refunded-so-far-label">Refunded so far</span>
              <span className="fund-card__refunded-so-far-value numeric">
                {formatUsdc(refundedSoFar)}
              </span>
            </span>
          )}
        </span>

        {card.claimable && (
          <button
            type="button"
            className="fund-button fund-button--primary fund-button--small"
            onClick={claim}
            disabled={tx.busy}
            aria-busy={tx.busy || undefined}
          >
            {tx.busy ? phaseLabel(tx.phase) : 'Claim refund'}
          </button>
        )}
      </div>
      {tx.phase === 'error' && tx.error && <ErrorPanel explained={tx.error} onRetry={claim} live={false} />}
    </li>
  );
}

/**
 * The funder's contributions, one card each. A refund claim is offered only
 * when it would succeed now: the programme is Cancelled, or Settled with
 * unawarded budget left, and this funder has not claimed already.
 *
 * Each card also shows:
 * - "Refunded so far" — the on-chain `refunded_to(donor)` value, so a donor
 *   who made partial claims can see what they've already received.
 * - "Refunds open after <date>" — while the release window is still running on
 *   a Settled programme, so the donor knows when they can come back.
 */
export function ContributionList({
  cards,
  sampleIds,
  onRefunded,
  releaseDeadlines,
  sampleDelayMs = SAMPLE_TX_DELAY_MS,
}: ContributionListProps) {
  return (
    <section className="fund-contributions" aria-labelledby="contributions-heading">
      <h2 id="contributions-heading" className="fund-contributions__title">
        Your contributions
      </h2>
      {cards.length === 0 ? (
        <p className="fund-note">You haven't contributed to a programme yet.</p>
      ) : (
        <ul className="fund-contributions__list">
          {cards.map((card) => (
            <ContributionItem
              key={card.programmeId}
              card={card}
              sample={sampleIds.has(card.programmeId)}
              onRefunded={onRefunded}
              releaseDeadline={releaseDeadlines?.get(card.programmeId) ?? null}
              sampleDelayMs={sampleDelayMs}
            />
          ))}
        </ul>
      )}
      <span className="fund-sample">Sample contributions for the design phase.</span>
    </section>
  );
}

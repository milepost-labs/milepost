import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAnnouncer } from '../../context/useAnnouncer';
import { useSoroban } from '../../context/useSoroban';
import { useWallet } from '../../context/useWallet';
import { phaseLabel, useTransaction } from '../../hooks/useTransaction';
import type { ContributionCard } from '../../lib/funding';
import { SAMPLE_TX_DELAY_MS, sampleSendable } from '../../lib/fundingTx';
import { formatUsdc } from '../../lib/programmeView';
import { ErrorPanel } from '../state/AsyncStates';
import '../programme/phasePill.css';
import './Funding.css';

export interface ContributionListProps {
  cards: ContributionCard[];
  /** Ids of programmes whose cards are stand-ins with no contract behind them. */
  sampleIds: ReadonlySet<string>;
  onRefunded: (programmeId: string) => void;
  sampleDelayMs?: number;
}

function ContributionItem({
  card,
  sample,
  onRefunded,
  sampleDelayMs,
}: {
  card: ContributionCard;
  sample: boolean;
  onRefunded: (programmeId: string) => void;
  sampleDelayMs: number;
}) {
  const { address } = useWallet();
  const { programmeAt } = useSoroban();
  const announce = useAnnouncer();
  const tx = useTransaction<bigint>({ contract: 'program' });

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
          <span className="fund-card__amount numeric">{formatUsdc(card.amount)}</span>
          <span className="fund-card__note">{card.note}</span>
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
 */
export function ContributionList({
  cards,
  sampleIds,
  onRefunded,
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
              sampleDelayMs={sampleDelayMs}
            />
          ))}
        </ul>
      )}
      <span className="fund-sample">Sample contributions for the design phase.</span>
    </section>
  );
}

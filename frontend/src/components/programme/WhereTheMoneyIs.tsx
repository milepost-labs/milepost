import type { FC } from 'react';
import { formatAmount, describeAmount } from '../../lib/amount';
import { computeMoneySquares, getMoneyState } from '../../lib/moneySquares';
import './WhereTheMoneyIs.css';

export interface WhereTheMoneyIsProps {
  contributed: bigint;
  fee: bigint;
  granted?: bigint;
  released?: bigint;
  /** `total_refunded`: what contributors have already claimed back. */
  refunded?: bigint;
  /** `total_swept`: what went to the treasury after the grace period. */
  swept?: bigint;
  /**
   * Whether refunds can be claimed: the programme is cancelled, or its
   * release deadline has passed. Before that nothing is refundable.
   */
  refundsOpen?: boolean;
  /** `fee_bps` from the config, shown beside the fee when known. */
  feeBps?: number;
  quorum: number;
  asset?: string;
}

export const WhereTheMoneyIs: FC<WhereTheMoneyIsProps> = ({
  contributed,
  fee,
  granted = 0n,
  released = 0n,
  refunded = 0n,
  swept = 0n,
  refundsOpen = false,
  feeBps,
  quorum,
  asset = 'USDC',
}) => {
  // Reconcile: contributed less fee equals budget
  const budget = contributed > fee ? contributed - fee : 0n;
  const clamp = (value: bigint) => (value > 0n ? value : 0n);

  // Mirrors the contract's refund rule: once refunds open, everything not
  // released is refundable in proportion, including awards that were never
  // paid out, less what has been claimed or swept. Until then, nothing is.
  const refundable = refundsOpen ? clamp(budget - released - refunded - swept) : 0n;
  const notYetAwarded = refundsOpen ? 0n : clamp(budget - granted);
  const awardedLocked = refundsOpen ? 0n : clamp(granted - released);

  // Quorum capped at 16
  const cappedQuorum = Math.min(Math.max(0, quorum), 16);

  const squares = computeMoneySquares(
    budget,
    released,
    refundsOpen ? released : granted,
    refundable,
    40,
  );

  const legend = [
    {
      bg: 'var(--accent-soft)',
      label: 'Not yet awarded',
      v: formatAmount(notYetAwarded, { asset }),
      raw: notYetAwarded,
    },
    {
      bg: 'var(--locked)',
      label: 'Awarded, locked',
      v: formatAmount(awardedLocked, { asset }),
      raw: awardedLocked,
    },
    {
      bg: 'var(--accent)',
      label: 'Released',
      v: formatAmount(released, { asset }),
      raw: released,
    },
    {
      bg: 'var(--refund)',
      label: 'Refundable',
      v: formatAmount(refundable, { asset }),
      raw: refundable,
    },
  ];

  const gridSummary = `40-square budget distribution: ${describeAmount(released, asset)} released, ${describeAmount(awardedLocked, asset)} awarded and locked, ${describeAmount(notYetAwarded, asset)} not yet awarded${refundable > 0n ? `, ${describeAmount(refundable, asset)} refundable` : ''}`;

  return (
    <section
      className="where-the-money-is"
      aria-labelledby="where-the-money-is-title"
    >
      <div className="where-the-money-is__header">
        <h2 id="where-the-money-is-title" className="where-the-money-is__title">
          Where the money is
        </h2>
        <span
          className="where-the-money-is__budget numeric"
          aria-label={`Budget: ${describeAmount(budget, asset)}`}
        >
          Budget {formatAmount(budget, { asset })}
        </span>
      </div>

      <div
        className="where-the-money-is__grid"
        role="img"
        aria-label={gridSummary}
      >
        {squares.map((q, i) => (
          <span
            key={i}
            className="where-the-money-is__square"
            data-money-state={getMoneyState(q)}
            style={{ backgroundColor: q }}
            aria-hidden="true"
          />
        ))}
      </div>

      <ul className="where-the-money-is__legend">
        {legend.map((item) => (
          <li key={item.label} className="where-the-money-is__legend-item">
            <span
              className="where-the-money-is__legend-dot"
              data-money-state={getMoneyState(item.bg)}
              style={{ backgroundColor: item.bg }}
              aria-hidden="true"
            />
            <span className="where-the-money-is__legend-label">{item.label}</span>
            <span
              className="where-the-money-is__legend-value numeric"
              aria-label={describeAmount(item.raw, asset)}
            >
              {item.v}
            </span>
          </li>
        ))}
      </ul>

      <div className="where-the-money-is__footer">
        <span>
          Contributed{' '}
          <strong
            className="numeric"
            aria-label={describeAmount(contributed, asset)}
          >
            {formatAmount(contributed, { asset })}
          </strong>
        </span>
        <span>
          Protocol fee{' '}
          <strong
            className="numeric"
            aria-label={describeAmount(fee, asset)}
          >
            {formatAmount(fee, { asset })}
            {feeBps !== undefined && ` (${(feeBps / 100).toFixed(2)}%)`}
          </strong>
        </span>
        <span>
          Reviewer votes needed <strong>{cappedQuorum}</strong>
        </span>
      </div>
    </section>
  );
};

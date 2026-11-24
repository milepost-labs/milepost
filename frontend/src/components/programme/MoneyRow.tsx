import { moneySquares } from '../../lib/programmeView';
import { getMoneyState } from '../../lib/moneySquares';
import { describeAmount } from '../../lib/amount';
import type { FixtureChainRead } from '../../fixtures/programmes';
import './MoneyRow.css';

/**
 * Money drawn as rows of small rounded squares, never as a gradient bar — the
 * design's whole money language. The container has a full text summary of the
 * distribution for screen readers, and marks each square with data-money-state
 * for forced-colours mode.
 */
export function MoneyRow({
  chain,
  count = 20,
  variant = 'card',
}: {
  chain: FixtureChainRead;
  count?: number;
  variant?: 'card' | 'detail';
}) {
  const squares = moneySquares(chain, count);
  const budget = BigInt(chain.contributed || 0) - BigInt(chain.fee || 0);
  const released = BigInt(chain.released || 0);
  const awarded = BigInt(chain.awarded || 0);
  const locked = awarded > released ? awarded - released : 0n;
  const unawarded = budget > awarded ? budget - awarded : 0n;
  const refundable = BigInt(chain.refundable || 0);

  const summary = `Money distribution: ${describeAmount(released, 'USDC')} released, ${describeAmount(locked, 'USDC')} locked, ${describeAmount(unawarded, 'USDC')} unawarded${refundable > 0n ? `, ${describeAmount(refundable, 'USDC')} refundable` : ''}`;

  return (
    <div
      className={`money-row money-row--${variant}`}
      role="img"
      aria-label={summary}
    >
      {squares.map((background, i) => (
        <span
          key={i}
          className="money-row__square"
          data-money-state={getMoneyState(background)}
          style={{ background }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/**
 * What the four square colours mean. The squares are decorative; the words
 * carry it. Shown once per page, near the first money row.
 */
export function MoneyLegend() {
  return (
    <span className="money-legend">
      <span>
        <i className="money-legend__sq money-legend__sq--unawarded" aria-hidden="true" />
        Unawarded
      </span>
      <span>
        <i className="money-legend__sq money-legend__sq--locked" aria-hidden="true" />
        Awarded, locked
      </span>
      <span>
        <i className="money-legend__sq money-legend__sq--released" aria-hidden="true" />
        Released
      </span>
      <span>
        <i className="money-legend__sq money-legend__sq--refundable" aria-hidden="true" />
        Refundable
      </span>
    </span>
  );
}

import { moneySquares } from '../../lib/programmeView';
import type { FixtureChainRead } from '../../fixtures/programmes';
import './MoneyRow.css';

/**
 * Money drawn as rows of small rounded squares, never as a gradient bar — the
 * design's whole money language. The squares are decorative: the amounts are
 * always stated in text beside them (the card's Budget / Awarded / Released
 * figures, or the detail legend), so this is `aria-hidden`.
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

  return (
    <div className={`money-row money-row--${variant}`} aria-hidden="true">
      {squares.map((background, i) => (
        <span key={i} className="money-row__square" style={{ background }} />
      ))}
    </div>
  );
}

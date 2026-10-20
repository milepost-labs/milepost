import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { formatAmount } from '../../lib/amount';
import './TermsTab.css';

/** The four payment modes, as `Mode` documents them in the program contract. */
const MODES = [
  {
    mode: 'Direct',
    description:
      'Paid straight to a verified destination, called a payee, chosen when the award is finalized. The recipient never holds the money.',
  },
  {
    mode: 'Allocated',
    description:
      'Held in escrow, locked inside the programme. The recipient chooses which verified payee receives it, and when. This depends on nothing outside the contract.',
  },
  {
    mode: 'Restricted',
    description:
      "Paid into the recipient's smart wallet, where a spending rule in the wallet (a policy signer) limits transfers to verified destinations. Only as strong as that wallet's configuration.",
  },
  { mode: 'Open', description: 'Paid to the recipient with no restriction.' },
];

export interface TermsTabProps {
  programmeId: string;
  quorum?: number;
  asset?: string;
  /**
   * The programme's minimum award in stroops. `0n` means no minimum, so the
   * row is omitted rather than pretending zero is a floor.
   */
  minimumAward?: bigint;
}

export const TermsTab: FC<TermsTabProps> = ({
  programmeId,
  quorum = 1,
  asset = 'USDC',
  minimumAward = 0n,
}) => {
  const cappedQuorum = Math.min(Math.max(1, quorum), 16);

  const terms: Array<{ k: string; v: string; explanation?: string }> = [
    { k: 'Asset', v: asset },
    ...(minimumAward > 0n
      ? [
          {
            k: 'Minimum award',
            v: formatAmount(minimumAward, { asset }),
            explanation:
              "The contract's finalize refuses any award below this amount (BelowMinimumAward, error 38). An award is the median of reviewer votes, so if the median lands below the minimum the application cannot be finalized.",
          },
        ]
      : []),
    {
      k: 'Payment mode',
      v: 'Chosen per award',
      explanation:
        'A payment mode is the rule for where released money may go. Each award gets its own mode when it is finalized.',
    },
    {
      k: 'Reviewer votes needed',
      v: `${cappedQuorum} ${cappedQuorum === 1 ? 'vote' : 'votes'} (max 16)`,
      explanation:
        'Quorum means the minimum number of reviewer votes needed before an award can be finalized.',
    },
    {
      k: 'Award rule',
      v: 'Median of reviewer votes',
      explanation:
        'After enough reviewers have voted, the submitted amounts are sorted and the middle value is selected to protect against outlier votes.',
    },
    {
      k: 'Unpaid money',
      v: 'Refunded in proportion, then swept after a grace period',
      explanation:
        'Once the release window closes, or if the programme is cancelled, anything not yet released, including awards never paid out, can be claimed back by funders in proportion to what they contributed. What nobody claims is swept to the treasury after a grace period.',
    },
  ];

  const keepaliveUrl = `/keepalive?programme=${encodeURIComponent(programmeId)}`;

  return (
    <div
      className="terms-tab"
      role="tabpanel"
      id="panel-terms"
      aria-labelledby="tab-terms"
    >
      <div className="terms-tab__list">
        {terms.map((item) => (
          <div key={item.k} className="terms-tab__row">
            <div className="terms-tab__row-header">
              <span className="terms-tab__key">{item.k}</span>
              <span className="terms-tab__val">{item.v}</span>
            </div>
            {item.explanation && (
              <p className="terms-tab__explanation">{item.explanation}</p>
            )}
          </div>
        ))}
      </div>

      <dl className="terms-tab__mode-card">
        {MODES.map((item) => (
          <div key={item.mode}>
            <dt>
              <strong>{item.mode}</strong>
            </dt>
            <dd>{item.description}</dd>
          </div>
        ))}
      </dl>

      <Link
        to={keepaliveUrl}
        className="terms-tab__keepalive-link"
        aria-label="Keep this programme's entries on the network"
      >
        Keep this programme&apos;s entries on the network &rarr;
      </Link>
    </div>
  );
};

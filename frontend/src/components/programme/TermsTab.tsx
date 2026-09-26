import type { FC } from 'react';
import { Link } from 'react-router-dom';
import './TermsTab.css';

export interface TermsTabProps {
  programmeId: string;
  mode?: string;
  quorum?: number;
  asset?: string;
}

export const TermsTab: FC<TermsTabProps> = ({
  programmeId,
  mode = 'Direct',
  quorum = 1,
  asset = 'USDC',
}) => {
  const cappedQuorum = Math.min(Math.max(1, quorum), 16);

  const modeDescriptions: Record<string, string> = {
    Direct:
      'Each award is paid straight to a verified payee chosen at award time. The recipient never holds the money.',
    Allocated:
      'Released money is held in escrow. The recipient chooses which verified payee receives it, and when. This depends on nothing outside the contract.',
    Restricted:
      "Released money goes to the recipient's own wallet, limited by a policy signer to one asset, verified payees and a cap. It is only as strong as that wallet's configuration.",
    Open:
      'Released money moves directly to the recipient without restrictions.',
  };

  const modeNote =
    modeDescriptions[mode] ||
    'Released money follows the rules configured in the programme contract.';

  const terms = [
    { k: 'Asset', v: asset },
    { k: 'Mode', v: mode },
    {
      k: 'Reviewer quorum',
      v: `${cappedQuorum} ${cappedQuorum === 1 ? 'vote' : 'votes'} (max 16)`,
    },
    {
      k: 'Award rule',
      v: 'Median of reviewer votes',
      explanation:
        'The award is the median of reviewer votes. Once quorum (capped at 16) is met, submitted amounts are sorted and the middle value is selected to protect against outlier votes.',
    },
    {
      k: 'Unawarded budget',
      v: 'Refunded in proportion, then swept after a grace period',
      explanation:
        'Unawarded budget is refunded proportionally to funders based on their initial contribution after the release window closes. Any unclaimed refund balance is swept to the treasury once the grace period expires.',
    },
  ];

  const keepaliveUrl = `/admin/standing?programme=${encodeURIComponent(programmeId)}`;

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

      <div className="terms-tab__mode-card">
        <strong>{mode} mode.</strong> {modeNote}
      </div>

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

import { Link } from 'react-router-dom';
import type { TxReceipt } from '../../lib/fundingTx';
import { formatUsdc, shortId } from '../../lib/programmeView';
import { CopyButton } from '../ui';

export interface ContributeReceiptProps {
  amount: bigint;
  programmeName: string;
  programmeHref: string;
  receipt: TxReceipt;
  /** Stand-in receipt from a sample programme; tagged so it is not taken as real. */
  sample: boolean;
  onAgain: () => void;
}

/**
 * What a confirmed contribution leaves behind: enough to verify it (the
 * transaction hash and ledger) and what happens to the money next.
 */
export function ContributeReceipt({
  amount,
  programmeName,
  programmeHref,
  receipt,
  sample,
  onAgain,
}: ContributeReceiptProps) {
  return (
    <>
      <div className="fund-summary">
        <span className="fund-summary__confirmed">
          <span aria-hidden="true">✓ </span>Contribution confirmed
        </span>
        <span className="fund-summary__amount numeric">{formatUsdc(amount)}</span>
        <span className="fund-summary__to">to {programmeName}</span>
      </div>

      <dl className="fund-breakdown">
        <div>
          <dt>Transaction</dt>
          <dd className="fund-receipt__hash">
            <span className="numeric" title={receipt.hash}>
              {receipt.hash ? shortId(receipt.hash) : 'Not reported'}
            </span>
            {receipt.hash && <CopyButton value={receipt.hash} label="Copy transaction hash" />}
          </dd>
        </div>
        <div>
          <dt>Ledger</dt>
          <dd className="numeric">{receipt.ledger !== null ? receipt.ledger.toLocaleString() : 'Not reported'}</dd>
        </div>
      </dl>
      {sample && <span className="fund-sample">Sample receipt for the design phase.</span>}

      <p className="fund-next">
        Next, applicants are reviewed and awards are set. Your money stays locked in the programme until a
        verifier confirms each milepost, and whatever isn't awarded comes back to you.
      </p>

      <div className="fund-actions">
        <Link to={programmeHref} className="fund-button fund-button--primary">
          View programme
        </Link>
        <button type="button" className="fund-button" onClick={onAgain}>
          Contribute again
        </button>
      </div>
    </>
  );
}

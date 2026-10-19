import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ContributionStats } from '../components/funder/DonorContributionReceipt';
import { AddressChip, Card, CopyButton, Field } from '../components/ui';
import { ErrorPanel, PendingState } from '../components/state/AsyncStates';
import { useAnnouncer } from '../context/useAnnouncer';
import { useSoroban } from '../context/useSoroban';
import { usePageTitle } from '../hooks/usePageTitle';
import { useIndexedList } from '../hooks';
import { formatDateTime, explorerUrl } from '../lib/format';
import { explain } from '../lib/errors';
import { fetchProgrammes } from '../lib/indexer';
import {
  isValidTxHash,
  lookupTransaction,
  rpcServer,
  type ContributionTx,
  type TxLookup,
} from '../lib/txLookup';
import { formatUsdc } from '../lib/programmeView';
import './FundingPage.css';
import '../components/funder/Funding.css';

type LookupState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'result'; result: TxLookup }
  | { kind: 'failed'; error: unknown };

/**
 * `/funders/receipt` — rebuild a contribution receipt from its transaction
 * hash.
 *
 * The receipt a `contribute` leaves behind exists only at the moment of
 * sending; a funder who closed the tab, or needs to prove a payment months
 * later, has only the hash. This screen reads the transaction back from the
 * RPC — which knows it while it is recent — recovers the contribution (which
 * programme, which donor, how much) from the invoke arguments, and re-reads
 * the programme on-chain so the figures answer for today, not for the moment
 * of sending. Older transactions are outside the RPC's retention window and
 * belong to the explorer, so that dead end is a link, not a shrug.
 */
export const ReceiptLookup = () => {
  usePageTitle('Receipt');
  const [params] = useSearchParams();
  const { rpcUrl } = useSoroban();
  const announce = useAnnouncer();
  const listRead = useIndexedList(() => fetchProgrammes(), []);

  const [hashInput, setHashInput] = useState(params.get('hash') ?? '');
  const [state, setState] = useState<LookupState>({ kind: 'idle' });

  const run = useCallback(
    async (raw: string) => {
      const cleaned = raw.trim().toLowerCase();
      if (!isValidTxHash(cleaned)) {
        setState({ kind: 'failed', error: new Error('That is not a transaction hash.') });
        return;
      }
      setState({ kind: 'searching' });
      try {
        const result = await lookupTransaction(rpcServer(rpcUrl), cleaned);
        setState({ kind: 'result', result });
        announce(
          result.status === 'SUCCESS'
            ? result.contribution
              ? 'Receipt rebuilt from the transaction.'
              : 'The transaction went through, but it is not a contribution.'
            : 'The transaction did not go through.',
        );
      } catch (error) {
        setState({ kind: 'failed', error });
        announce('Could not reach the network to read the transaction.', 'alert');
      }
    },
    [announce, rpcUrl],
  );

  // A hash in the URL is a receipt someone kept: attempt it on arrival, once
  // per distinct hash.
  const seeded = params.get('hash');
  useEffect(() => {
    if (seeded && isValidTxHash(seeded)) {
      // This intentionally starts the lookup once from a URL seed so a copied
      // receipt link opens with the right result automatically.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void run(seeded);
    }
  }, [seeded, run]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(hashInput);
  };

  const invalid = hashInput.trim() !== '' && !isValidTxHash(hashInput);

  return (
    <div className="funding">
      <header className="funding__intro">
        <h1 className="funding__title">Receipt lookup</h1>
        <p className="funding__lede">
          Enter a transaction hash to rebuild a contribution receipt: which programme it
          went to, who contributed, how much — and where the money sits now. The network
          keeps recent transactions only; older ones live on the explorer.
        </p>
      </header>

      <section className="fund-panel" aria-labelledby="receipt-lookup-heading">
        <div className="fund-panel__head">
          <h2 id="receipt-lookup-heading" className="fund-panel__title">
            By transaction hash
          </h2>
        </div>

        <form onSubmit={onSubmit}>
          <Field
            label="Transaction hash"
            hint="64 hexadecimal characters — from your wallet's activity, or the explorer."
            error={invalid ? 'That does not look like a transaction hash: 64 hex characters.' : null}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. 7c1e9a4b…"
            value={hashInput}
            onChange={(event) => setHashInput(event.target.value)}
          />
          <div className="fund-actions">
            <button type="submit" className="fund-button fund-button--primary" disabled={hashInput.trim() === ''}>
              Rebuild receipt
            </button>
          </div>
        </form>

        {state.kind === 'searching' && (
          <PendingState title="Reading the transaction…" note="Usually a few seconds. Keep this tab open." />
        )}

        {state.kind === 'failed' && (
          <ErrorPanel
            explained={explain(state.error, 'program')}
            onRetry={() => void run(hashInput)}
          />
        )}

        {state.kind === 'result' && (
          <ResultView
            result={state.result}
            hash={hashInput.trim().toLowerCase()}
            programmeName={(id) => listRead.data?.find((entry) => entry.id === id)?.name ?? null}
          />
        )}
      </section>
    </div>
  );
};

function ResultView({
  result,
  hash,
  programmeName,
}: {
  result: TxLookup;
  hash: string;
  programmeName: (id: string) => string | null;
}) {
  if (result.status === 'NOT_FOUND') {
    return (
      <div role="status">
        <p className="fund-failure__title">The network does not have this transaction any more.</p>
        <p className="fund-note">
          The RPC keeps a recent window only; a hash from months ago needs the explorer.
        </p>
        <div className="fund-actions">
          <a
            href={explorerUrl(hash, 'TESTNET')}
            target="_blank"
            rel="noreferrer"
            className="fund-button"
          >
            Look it up on the explorer
          </a>
        </div>
      </div>
    );
  }

  if (result.status === 'FAILED') {
    return (
      <div role="status">
        <p className="fund-failure__title">This transaction did not go through.</p>
        <p className="fund-note">
          Nothing was contributed — the network refused it, so no programme was touched.
        </p>
      </div>
    );
  }

  if (!result.contribution) {
    return (
      <div role="status">
        <p className="fund-note">
          The transaction went through ({result.opCount} operation
          {result.opCount === 1 ? '' : 's'}), but none of its operations is a
          contribution. A receipt can only be rebuilt from a transaction that called a
          programme&apos;s <code>contribute</code>.
        </p>
      </div>
    );
  }

  return (
    <RebuiltReceipt
      tx={result.contribution}
      hash={hash}
      ledger={result.ledger}
      createdAt={result.createdAt}
      programmeName={programmeName}
    />
  );
}

/**
 * The rebuilt receipt: what the hash proves happened, then what the programme
 * looks like now that the money did.
 */
function RebuiltReceipt({
  tx,
  hash,
  ledger,
  createdAt,
  programmeName,
}: {
  tx: ContributionTx;
  hash: string;
  ledger: number;
  createdAt: number | null;
  programmeName: (id: string) => string | null;
}) {
  const { programmeAt } = useSoroban();
  const client = useMemo(() => programmeAt(tx.programmeId), [programmeAt, tx.programmeId]);
  const title = programmeName(tx.programmeId) ?? tx.programmeId;

  return (
    <>
      <div className="fund-summary">
        <span className="fund-summary__confirmed">
          <span aria-hidden="true">✓ </span>Contribution confirmed
        </span>
        <span className="fund-summary__amount numeric">{formatUsdc(tx.amount)}</span>
        <span className="fund-summary__to">
          to <Link to={`/programme/${encodeURIComponent(tx.programmeId)}`}>{title}</Link>
        </span>
      </div>

      <dl className="fund-breakdown">
        <div>
          <dt>Transaction</dt>
          <dd className="fund-receipt__hash">
            <span className="numeric" title={hash}>
              {hash}
            </span>
            <CopyButton value={hash} label="Copy transaction hash" />
            <a
              href={explorerUrl(hash, 'TESTNET')}
              target="_blank"
              rel="noreferrer"
              aria-label="View the transaction on the explorer"
            >
              Explorer
            </a>
          </dd>
        </div>
        <div>
          <dt>Ledger</dt>
          <dd className="numeric">{ledger.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Confirmed</dt>
          <dd>{createdAt !== null ? formatDateTime(createdAt) : 'At an unknown time'}</dd>
        </div>
        <div>
          <dt>Programme</dt>
          <dd>
            <AddressChip address={tx.programmeId} copyLabel="Copy programme id" />
          </dd>
        </div>
        <div>
          <dt>Donor</dt>
          <dd>
            <AddressChip address={tx.donor} copyLabel="Copy donor address" />
          </dd>
        </div>
      </dl>

      <Card title="Where the money sits now">
        <ContributionStats client={client} donorAddress={tx.donor} />
      </Card>

      <p className="fund-next">
        The amount and the addresses come from the transaction itself. The figures above are
        re-read from the programme on-chain, so they answer for today, not for the day you
        contributed.
      </p>
    </>
  );
}

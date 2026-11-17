import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Search } from 'lucide-react';
import type { ProgrammeConfig } from '@milepost/program';
import { Button, CopyButton, Field, Notice, PageHead, Receipt, StatTile } from '../components/ui';
import { ErrorPanel, PendingState } from '../components/state/AsyncStates';
import { useAnnouncer } from '../context/useAnnouncer';
import { useSoroban } from '../context/useSoroban';
import { usePageTitle } from '../hooks/usePageTitle';
import { useIndexedList } from '../hooks/useIndexedList';
import { useContractRead, useContractResult } from '../hooks/useContractRead';
import { formatDateTime, explorerUrl, truncateAddress } from '../lib/format';
import { formatShare, formatIn } from '../lib/funding';
import { explain } from '../lib/errors';
import { fetchProgrammes } from '../lib/indexer';
import { programmeAsset, shortId } from '../lib/programmeView';
import { isValidTxHash, lookupTransaction, rpcServer, type ContributionTx, type TxLookup } from '../lib/txLookup';
import './ReceiptLookup.css';

type LookupState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'result'; result: TxLookup; hash: string }
  | { kind: 'failed'; error: unknown };

/**
 * `/funders/receipt`: rebuild a contribution receipt from its transaction
 * hash, with no sign-in.
 *
 * The RPC returns the transaction while it is recent; the contribution (which
 * programme, which donor, how much) is recovered from its arguments, and the
 * programme is re-read so "where it sits now" answers for today. Older
 * transactions are outside the RPC's window, so that case links to the
 * explorer. Only contributions can be rebuilt.
 */
export const ReceiptLookup = () => {
  usePageTitle('Receipt lookup');
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
        setState({ kind: 'result', result, hash: cleaned });
        announce(
          result.status === 'SUCCESS'
            ? result.contribution
              ? 'Receipt rebuilt from the transaction.'
              : 'The transaction went through, but it is not a contribution.'
            : result.status === 'NOT_FOUND'
              ? 'The network no longer has this transaction.'
              : 'The transaction did not go through.',
        );
      } catch (error) {
        setState({ kind: 'failed', error });
        announce('Could not reach the network to read the transaction.', 'alert');
      }
    },
    [announce, rpcUrl],
  );

  // A hash in the URL is a receipt someone kept: look it up on arrival.
  const seeded = params.get('hash');
  useEffect(() => {
    if (seeded && isValidTxHash(seeded)) {
      // Starts the lookup once from a URL seed, so a kept receipt link opens with its result.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void run(seeded);
    }
  }, [seeded, run]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run(hashInput);
  };

  const invalid = hashInput.trim() !== '' && !isValidTxHash(hashInput.trim());
  const programmeName = (id: string) => listRead.data?.find((entry) => entry.id === id)?.name ?? null;

  return (
    <div className="receipt-lookup">
      <PageHead eyebrow="Fund" title="Receipt lookup">
        <p>Paste a transaction hash to rebuild a contribution receipt from the chain. No sign-in needed.</p>
      </PageHead>

      <form className="receipt-lookup__form" onSubmit={onSubmit}>
        <Field
          label="Transaction hash"
          hint="64 characters, from your wallet’s activity or the explorer."
          error={invalid ? 'That doesn’t look like a transaction hash: 64 hex characters.' : null}
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. 9f3a8c…c21e"
          className="receipt-lookup__field"
          value={hashInput}
          onChange={(event) => setHashInput(event.target.value)}
        />
        <Button
          type="submit"
          icon={<Search size={18} aria-hidden="true" />}
          disabled={hashInput.trim() === '' || state.kind === 'searching'}
        >
          Find receipt
        </Button>
      </form>
      <p className="receipt-lookup__fine">
        Works for contributions. The network keeps recent transactions only; older ones live on the explorer.
      </p>

      {state.kind === 'searching' && (
        <PendingState title="Reading the transaction…" note="Usually a few seconds." />
      )}
      {state.kind === 'failed' && (
        <ErrorPanel explained={explain(state.error, 'program')} onRetry={() => void run(hashInput)} />
      )}
      {state.kind === 'result' && <ResultView result={state.result} hash={state.hash} programmeName={programmeName} />}
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
      <Notice tone="warn" role="status">
        <span>
          <strong>The network no longer has this transaction.</strong> The RPC keeps a recent window only. Check it’s a
          testnet hash, or look it up on the explorer.
        </span>
        <a className="ui-button ui-button--secondary ui-button--sm" href={explorerUrl(hash, 'TESTNET')} target="_blank" rel="noreferrer">
          Open the explorer
        </a>
      </Notice>
    );
  }
  if (result.status === 'FAILED') {
    return (
      <Notice tone="risk" role="status">
        <span>
          <strong>This transaction didn’t go through.</strong> The network refused it, so nothing was contributed and
          no programme was touched.
        </span>
      </Notice>
    );
  }
  if (!result.contribution) {
    return (
      <Notice tone="info" role="status">
        <span>
          The transaction went through ({result.opCount} operation{result.opCount === 1 ? '' : 's'}), but none of them is
          a contribution. A receipt can only be rebuilt from a call to a programme’s <code>contribute</code>.
        </span>
      </Notice>
    );
  }
  return (
    <RebuiltReceipt
      tx={result.contribution}
      hash={hash}
      ledger={result.ledger}
      createdAt={result.createdAt}
      programmeName={programmeName(result.contribution.programmeId)}
    />
  );
}

/** What the hash proves happened, then what the programme looks like now. */
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
  programmeName: string | null;
}) {
  const { programmeAt } = useSoroban();
  const client = useMemo(() => programmeAt(tx.programmeId), [programmeAt, tx.programmeId]);
  const asset = programmeAsset({ sample: false });
  const config = useContractResult<ProgrammeConfig>(() => client.get_config(), [client], { contract: 'program' });
  const byDonor = useContractRead(() => client.contributed_by({ donor: tx.donor }), [client, tx.donor], {
    contract: 'program',
  });
  const total = useContractRead(() => client.total_contributed(), [client], { contract: 'program' });

  const name = programmeName ?? shortId(tx.programmeId);
  const share = byDonor.data != null && total.data ? (byDonor.data * 10_000n) / total.data : null;
  const text = [
    `Milepost contribution receipt`,
    `Programme: ${name} (${tx.programmeId})`,
    `From: ${tx.donor}`,
    `Sent: ${formatIn(tx.amount, asset)}`,
    `Ledger: ${ledger}`,
    createdAt !== null ? `Time: ${formatDateTime(createdAt)}` : null,
    `Transaction: ${hash}`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      <section className="receipt-card" aria-labelledby="receipt-title">
        <div className="receipt-card__head">
          <div>
            <p className="receipt-card__eyebrow">Receipt · rebuilt from the chain</p>
            <h2 id="receipt-title">Contribution · {formatIn(tx.amount, asset)}</h2>
          </div>
          <span className="receipt-card__status">Success</span>
        </div>
        <Receipt
          rows={[
            {
              label: 'Programme',
              value: <Link to={`/programme/${encodeURIComponent(tx.programmeId)}`}>{name}</Link>,
              text: true,
            },
            { label: 'From', value: <span title={tx.donor}>{truncateAddress(tx.donor)}</span> },
            { label: 'Sent', value: formatIn(tx.amount, asset) },
            ...(config.data
              ? [
                  {
                    label: 'Protocol fee',
                    value: `${formatShare(BigInt(config.data.fee_bps))} of contributions`,
                    text: true,
                  },
                ]
              : []),
            { label: 'Ledger', value: ledger.toLocaleString('en-GB') },
            { label: 'Time', value: createdAt !== null ? formatDateTime(createdAt) : 'Unknown', text: true },
            { label: 'Transaction', value: <span title={hash}>{shortId(hash)}</span> },
          ]}
        />
        <div className="receipt-card__actions">
          <CopyButton value={hash} label="Copy hash" showLabel />
          <a className="ui-button ui-button--ghost ui-button--sm" href={explorerUrl(hash, 'TESTNET')} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> View on the explorer
          </a>
          <CopyButton value={text} label="Copy receipt as text" showLabel />
        </div>
      </section>

      <section className="receipt-lookup__now" aria-labelledby="receipt-now">
        <h2 id="receipt-now">Where it sits now</h2>
        <div className="ui-stat-tiles ui-stat-tiles--three">
          <StatTile
            label="This address has given"
            value={byDonor.data != null ? formatIn(byDonor.data, asset).replace(` ${asset}`, '') : '—'}
            unit={asset}
            hint="To this programme, in total"
          />
          <StatTile
            label="Share of the programme"
            value={share !== null ? formatShare(share) : '—'}
            hint={total.data != null ? `Of ${formatIn(total.data, asset)} contributed` : 'Reading the programme…'}
          />
          <StatTile label="Programme" value={name} hint={<Link to={`/programme/${encodeURIComponent(tx.programmeId)}`}>Open its page</Link>} />
        </div>
        <p className="receipt-lookup__fine">
          The amount and addresses come from the transaction itself. The figures above are re-read from the programme, so
          they answer for today, not the day of the contribution. The protocol fee is taken from the programme’s total,
          not from each payment.
        </p>
      </section>
    </>
  );
}

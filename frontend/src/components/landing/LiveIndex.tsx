import { Link } from 'react-router-dom';
import { ArrowRight, WifiOff } from 'lucide-react';
import { useIndexedList } from '../../hooks/useIndexedList';
import {
  fetchMeta,
  fetchProgrammes,
  INDEXER_BASE_URL,
  isStale,
  type IndexedProgramme,
  type IndexerMeta,
} from '../../lib/indexer';
import { timeUntil, truncateAddress } from '../../lib/format';
import { Button } from '../ui/Button';

interface IndexSnapshot {
  meta: IndexerMeta;
  programmes: IndexedProgramme[];
  /** When this snapshot was read. Staleness is judged against it, so render stays pure. */
  readAt: number;
}

async function readIndex(): Promise<IndexSnapshot> {
  const [meta, programmes] = await Promise.all([fetchMeta(), fetchProgrammes()]);
  return { meta, programmes, readAt: Date.now() };
}

/**
 * The one landing section that claims to show real chain state, so every
 * figure here comes from the published index and nothing is filled in when it
 * cannot be read. A failed read shows that no figures are available, even if
 * an earlier read succeeded: a figure that can no longer be vouched for is a
 * guess. There is no sample-data preview on the real page.
 *
 * The figures are the ones the index can back today: how many programmes it
 * lists, how fresh it is, how far it has read, and how many event types it
 * does not handle yet. Totals contributed and released are not published by
 * the index, so they are not shown.
 */
export function LiveIndex() {
  const { data, error, loading, fetching, refetch } = useIndexedList(readIndex, []);
  const source = INDEXER_BASE_URL.replace(/^https?:\/\//, '');
  const failed = !loading && (Boolean(error) || !data);
  const age = data ? indexAge(data) : null;

  return (
    <section className="lp-section lp-live" aria-labelledby="lp-live-title">
      <div className="lp-wrap">
        <div className="lp-live__head">
          <div>
            <p className="lp-eyebrow">Live on testnet</p>
            <h2 id="lp-live-title" className="lp-h2 lp-h2--narrow">
              Real figures from the public index.
            </h2>
          </div>
          <p className="lp-lead lp-live__lead">
            Read from the index as you load this page. If it can't be reached, we show nothing rather than
            guess. The index is rebuilt every few hours and is advisory: the app re-checks every entry
            on-chain before you act on it.
          </p>
        </div>

        <div aria-live="polite" aria-busy={fetching}>
          {loading ? (
            <div className="lp-live__figs">
              {FIGURE_LABELS.map((label) => (
                <div className="lp-fig" key={label}>
                  <div className="lp-fig__k">{label}</div>
                  <span className="lp-fig__skeleton" aria-hidden="true" />
                </div>
              ))}
            </div>
          ) : failed ? (
            <div className="lp-live__empty" role="alert">
              <WifiOff aria-hidden="true" />
              <p>
                <b>Couldn't reach the public index.</b>
                {error instanceof Error ? `${error.message} ` : ''}No figures are shown rather than guessed.
                Programmes are still browsable in the app, where everything you act on is read on chain.
              </p>
            </div>
          ) : (
            data && <IndexFigures snapshot={data} />
          )}
        </div>

        <div className="lp-live__foot">
          <span className="numeric">
            {loading
              ? 'Index: reading meta.json and programmes.json…'
              : failed
                ? 'Index: unreachable'
                : `Index: updated ${age} · lists are advisory`}
          </span>
          {!loading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={refetch}
              loading={fetching}
              loadingLabel="Refreshing"
            >
              {failed ? 'Try again' : 'Refresh'}
            </Button>
          )}
          <span className="numeric">Source: {source}</span>
        </div>
      </div>
    </section>
  );
}

const FIGURE_LABELS = ['Programmes indexed', 'Index updated', 'Last ledger read', 'Event types not yet indexed'];

function indexAge({ meta, readAt }: IndexSnapshot): string {
  const indexedAt = Date.parse(meta.indexedAt);
  return Number.isNaN(indexedAt) ? 'at an unknown time' : timeUntil(indexedAt / 1000, new Date(readAt));
}

function IndexFigures({ snapshot }: { snapshot: IndexSnapshot }) {
  const { meta, programmes, readAt } = snapshot;
  const age = indexAge(snapshot);
  const unhandled = Object.keys(meta.unhandledEvents).length;

  const figures = [
    { label: FIGURE_LABELS[0], value: programmes.length.toLocaleString(), note: 'deployed through the registry' },
    { label: FIGURE_LABELS[1], value: age, note: 'rebuilt from contract events' },
    { label: FIGURE_LABELS[2], value: meta.indexedToLedger.toLocaleString(), note: `on ${meta.network}` },
    {
      label: FIGURE_LABELS[3],
      value: unhandled.toLocaleString(),
      note: unhandled === 0 ? 'every event type is handled' : 'so some counts are not shown',
    },
  ];

  return (
    <>
      {isStale(meta, readAt) && (
        <p className="lp-live__stale" role="status">
          The index was last updated {age}. Figures may be behind the chain.
        </p>
      )}

      <dl className="lp-live__figs">
        {figures.map((figure) => (
          <div key={figure.label} className="lp-fig">
            <dt className="lp-fig__k">{figure.label}</dt>
            <dd className="lp-fig__v numeric">{figure.value}</dd>
            <dd className="lp-fig__s">{figure.note}</dd>
          </div>
        ))}
      </dl>

      {programmes.length > 0 && (
        <ul className="lp-live__programmes">
          {programmes.map((programme) => (
            <li key={programme.id}>
              <Link to={`/programme/${programme.id}`} className="lp-live__programme">
                <span className="lp-live__programme-name">{programme.name ?? 'Unnamed programme'}</span>
                <span className="numeric">{truncateAddress(programme.id)}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import { Link } from 'react-router-dom';
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
 * guess.
 */
export function LiveIndex() {
  const { data, error, loading, fetching, refetch } = useIndexedList(readIndex, []);
  const source = INDEXER_BASE_URL.replace(/^https?:\/\//, '');

  return (
    <section className="live-section scroll-animate" aria-labelledby="live-heading">
      <div className="live-header">
        <div className="section-header">
          <span className="eyebrow">Live on testnet</span>
          <h2 id="live-heading">Read from the public index.</h2>
          <p className="text-muted">
            The index is rebuilt from contract events every few hours and is advisory. The app
            re-checks every entry on-chain before you act on it.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={refetch}
          loading={fetching && !loading}
          loadingLabel="Refreshing"
        >
          Refresh
        </Button>
      </div>

      <div aria-live="polite" aria-busy={fetching}>
        {loading ? (
          <p className="live-panel text-muted">Reading meta.json and programmes.json…</p>
        ) : error || !data ? (
          <div className="live-panel live-panel--error" role="alert">
            <p className="live-error-title">Couldn't reach the index</p>
            <p className="text-muted">
              {error instanceof Error ? `${error.message} ` : ''}No figures are shown rather than
              guessed.
            </p>
          </div>
        ) : (
          <IndexFigures snapshot={data} />
        )}
      </div>

      <p className="live-source numeric">Source: {source}</p>
    </section>
  );
}

function IndexFigures({ snapshot }: { snapshot: IndexSnapshot }) {
  const { meta, programmes, readAt } = snapshot;
  const indexedAt = Date.parse(meta.indexedAt);
  const age = Number.isNaN(indexedAt)
    ? 'at an unknown time'
    : timeUntil(indexedAt / 1000, new Date(readAt));

  const tiles = [
    { label: 'Programmes indexed', value: programmes.length.toLocaleString() },
    { label: 'Index updated', value: age },
    { label: 'Last ledger read', value: meta.indexedToLedger.toLocaleString() },
    {
      label: 'Event types not yet indexed',
      value: Object.keys(meta.unhandledEvents).length.toLocaleString(),
    },
  ];

  return (
    <div className="live-figures">
      {isStale(meta, readAt) && (
        <p className="live-stale" role="status">
          The index was last updated {age}. Figures may be behind the chain.
        </p>
      )}

      <dl className="live-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="live-tile">
            <dt className="text-muted">{tile.label}</dt>
            <dd className="numeric">{tile.value}</dd>
          </div>
        ))}
      </dl>

      {programmes.length > 0 && (
        <ul className="live-programmes">
          {programmes.map((programme) => (
            <li key={programme.id}>
              <Link to={`/programme/${programme.id}`} className="live-programme">
                <span className="live-programme-text">
                  <span className="live-programme-name">{programme.name ?? 'Unnamed programme'}</span>
                  <span className="live-programme-id numeric">{truncateAddress(programme.id)}</span>
                </span>
                <span className="live-programme-phase">Phase read on-chain in app</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

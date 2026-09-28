import { useIndexedList } from '../hooks/useIndexedList';
import { fetchMeta, isStale } from '../lib/indexer';
import type { IndexerMeta } from '../lib/indexer';
import { Skeleton } from '../components/state/AsyncStates';
import './IndexStatus.css';

export interface StatusEntry {
  meta: IndexerMeta;
  fetchedAt: number;
}

export const IndexStatus = () => {
  const { data, loading, error, refetch } = useIndexedList<StatusEntry>(
    async () => ({ meta: await fetchMeta(), fetchedAt: Date.now() }),
    [],
  );

  const meta = data?.meta ?? null;
  const fetchedAt = data?.fetchedAt ?? null;

  const age = fetchedAt && meta ? fetchedAt - Date.parse(meta.indexedAt) : null;
  const ageText =
    age === null
      ? null
      : age < 60_000
        ? 'less than a minute ago'
        : age < 3_600_000
          ? `${Math.round(age / 60_000)} min ago`
          : age < 86_400_000
            ? `${Math.round(age / 3_600_000)} h ago`
            : `${Math.round(age / 86_400_000)} days ago`;

  const stale = meta ? isStale(meta) : false;
  const unhandledEntries = meta
    ? Object.entries(meta.unhandledEvents).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="status-container">
      <section aria-labelledby="status-heading" className="status-section">
        <h1 id="status-heading">Index status</h1>
        <p className="status-lede">
          The public index is rebuilt from contract events every few hours. This
          page shows how fresh it is and what it does not yet cover.
        </p>

        {loading && (
          <div role="status" aria-live="polite">
            <Skeleton variant="card" label="Loading index status" />
          </div>
        )}

        {error != null && (
          <div role="alert" className="status-banner status-banner--unreachable">
            <strong>Index unreachable.</strong>
            <p>
              The published index could not be fetched. The indexer may be down
              or the network may be unavailable.
            </p>
            <button type="button" className="status-retry" onClick={refetch}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && meta && (
          <div className="status-grid">
            <div className="status-card">
              <dt className="status-card__label">Last indexed at</dt>
              <dd className="status-card__value numeric">
                {meta.indexedAt}
              </dd>
              <dd className="status-card__hint">
                {ageText ? `${ageText}` : 'Unknown age'}
              </dd>
            </div>

            <div className="status-card">
              <dt className="status-card__label">Indexed to ledger</dt>
              <dd className="status-card__value numeric">
                {meta.indexedToLedger}
              </dd>
              <dd className="status-card__hint">
                From ledger {meta.fromLedger}
              </dd>
            </div>

            <div className="status-card">
              <dt className="status-card__label">Freshness</dt>
              <dd className="status-card__value">
                <span
                  className={`status-freshness ${stale ? 'status-freshness--stale' : 'status-freshness--fresh'}`}
                >
                  {stale ? 'Stale' : 'Fresh'}
                </span>
              </dd>
              <dd className="status-card__hint">
                {stale
                  ? 'Older than 12 hours. New data may be missing.'
                  : 'Updated within the last 12 hours.'}
              </dd>
            </div>

            <div className="status-card">
              <dt className="status-card__label">Network</dt>
              <dd className="status-card__value numeric">{meta.network}</dd>
              <dd className="status-card__hint">
                Registry: {meta.registry.slice(0, 12)}…
              </dd>
            </div>

            <div className="status-card">
              <dt className="status-card__label">Index completeness</dt>
              <dd className="status-card__value">
                {meta.complete ? 'Complete' : 'Partial'}
              </dd>
              <dd className="status-card__hint">
                {meta.gap
                  ? 'Gaps detected — some events were lost.'
                  : 'No gaps detected.'}
              </dd>
            </div>
          </div>
        )}

        {!loading && !error && meta && unhandledEntries.length > 0 && (
          <section aria-labelledby="unhandled-heading" className="status-unhandled">
            <h2 id="unhandled-heading">Unhandled event types</h2>
            <p className="status-unhandled__intro">
              The indexer does not yet have handlers for these event types.
              Counts show how many events of each type were seen but not
              processed.
            </p>
            <table className="status-table" role="table">
              <thead>
                <tr>
                  <th scope="col">Event type</th>
                  <th scope="col" className="numeric">Count</th>
                </tr>
              </thead>
              <tbody>
                {unhandledEntries.map(([eventType, count]) => (
                  <tr key={eventType}>
                    <td className="numeric">{eventType}</td>
                    <td className="numeric">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {!loading && !error && meta && unhandledEntries.length === 0 && (
          <div className="status-card status-card--full">
            <p>All event types are handled by the indexer.</p>
          </div>
        )}
      </section>
    </div>
  );
};

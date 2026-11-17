import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useIndexedList } from '../hooks/useIndexedList';
import { usePageTitle } from '../hooks/usePageTitle';
import { fetchMeta, isStale } from '../lib/indexer';
import type { IndexerMeta } from '../lib/indexer';
import { formatAgo } from '../lib/programmeView';
import { Skeleton } from '../components/state/AsyncStates';
import { Button, Notice, PageHead, StatTile } from '../components/ui';
import { useAnnouncer } from '../context/useAnnouncer';
import './IndexStatus.css';

export interface StatusEntry {
  meta: IndexerMeta;
  fetchedAt: number;
}

const UTC = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/**
 * `/status`: how fresh the public index is. The contracts keep no lists, so
 * the index rebuilds them from contract events; this page shows when it last
 * ran, how far it reached, whether it is complete, and which event types it
 * does not handle yet. All of it is read from `meta.json`. The index publishes
 * no history of its runs, so none is shown.
 */
export const IndexStatus = () => {
  usePageTitle('Index status');
  const { data, loading, error, refetch, fetching } = useIndexedList<StatusEntry>(
    async () => ({ meta: await fetchMeta(), fetchedAt: Date.now() }),
    [],
  );

  const announce = useAnnouncer();
  // Announce a freshness change once; the meta object is replaced on every refetch.
  const announcedFreshness = useRef<'fresh' | 'stale' | null>(null);

  const meta = data?.meta ?? null;
  const fetchedAt = data?.fetchedAt ?? null;
  const indexedAt = meta ? Date.parse(meta.indexedAt) : NaN;
  const age = fetchedAt && Number.isFinite(indexedAt) ? Math.max(0, fetchedAt - indexedAt) : null;
  const stale = meta ? isStale(meta) : false;
  const unhandled = meta
    ? Object.entries(meta.unhandledEvents)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
    : [];
  const unhandledTotal = unhandled.reduce((sum, [, count]) => sum + count, 0);

  useEffect(() => {
    if (!meta) return;
    const freshness = stale ? 'stale' : 'fresh';
    if (announcedFreshness.current === freshness) return;
    announcedFreshness.current = freshness;
    announce(
      stale
        ? 'Index status is stale. Older than 12 hours, so new data may be missing.'
        : 'Index status is fresh. Updated within the last 12 hours.',
    );
  }, [meta, stale, announce]);

  return (
    <div className="index-status">
      <PageHead
        eyebrow="Programmes"
        title="Index status"
        action={
          meta ? (
            <Button
              variant="ghost"
              icon={<RefreshCw size={18} aria-hidden="true" />}
              loading={fetching}
              loadingLabel="Checking…"
              onClick={refetch}
            >
              Check again
            </Button>
          ) : undefined
        }
      >
        <p>
          The contracts keep no lists. A public index rebuilds them from contract events every few hours. This page
          shows how fresh it is.
        </p>
      </PageHead>

      {loading && (
        <div role="status" aria-live="polite">
          <Skeleton variant="card" label="Loading index status" />
        </div>
      )}

      {error != null && !meta && (
        <Notice tone="risk" role="alert">
          <span>
            <strong>Index unreachable.</strong> The published index could not be fetched. Lists can’t load, but
            programme pages and every action still read the chain directly.
          </span>
          <Button size="sm" variant="secondary" onClick={refetch}>
            Try again
          </Button>
        </Notice>
      )}

      {meta && (
        <>
          {stale ? (
            <Notice tone="warn" role="status">
              <span>
                <strong>Stale.</strong> Last rebuilt {age !== null ? formatAgo(age) : 'a while ago'}. Above 12 hours,
                every list in the app shows a warning. Anything you act on is still re-read on the chain first.
              </span>
            </Notice>
          ) : (
            <Notice tone="ok" role="status">
              <span>
                <strong>Fresh.</strong> Last rebuilt {age !== null ? formatAgo(age) : 'recently'}. Lists show a
                warning once the index is more than 12 hours old.
              </span>
            </Notice>
          )}

          <div className="ui-stat-tiles">
            <StatTile
              label="Last rebuilt"
              value={age !== null ? formatAgo(age).replace(' ago', '') : '—'}
              unit={age !== null ? 'ago' : undefined}
              hint={Number.isFinite(indexedAt) ? `${UTC.format(indexedAt)} UTC` : meta.indexedAt}
              highlight={!stale}
            />
            <StatTile
              label="Indexed to ledger"
              value={meta.indexedToLedger.toLocaleString('en-GB')}
              hint={`From ledger ${meta.fromLedger.toLocaleString('en-GB')}`}
            />
            <StatTile
              label="Completeness"
              value={meta.complete && !meta.gap ? 'Complete' : 'Partial'}
              hint={
                meta.gap
                  ? 'Runs stopped too long once, so some events were lost.'
                  : meta.complete
                    ? 'Every event since the registry was deployed.'
                    : 'Indexing started after deployment, so early events are missing.'
              }
            />
            <StatTile
              label="Unhandled event types"
              value={unhandled.length}
              hint={unhandled.length ? `${unhandledTotal.toLocaleString('en-GB')} events seen but not used` : 'Every type is handled'}
            />
          </div>

          <div className="index-status__grid">
            <section className="index-status__panel" aria-labelledby="unhandled-heading">
              <h2 id="unhandled-heading">Event types not handled yet</h2>
              {unhandled.length > 0 ? (
                <>
                  <p className="index-status__intro">
                    The indexer saw these events but has no handler for them, so lists built from them (applications,
                    attestations, schemas and more) can’t be published yet.
                  </p>
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th scope="col">Event type</th>
                        <th scope="col" className="numeric-col">
                          Seen
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {unhandled.map(([eventType, count]) => (
                        <tr key={eventType}>
                          <td data-label="Event type" className="numeric">
                            {eventType}
                          </td>
                          <td data-label="Seen" className="numeric numeric-col">
                            {count.toLocaleString('en-GB')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="index-status__intro">All event types are handled by the indexer.</p>
              )}
            </section>

            <aside className="index-status__aside" aria-labelledby="meaning-heading">
              <h2 id="meaning-heading">What this means</h2>
              <ul>
                <li>
                  Lists (the directory, queues, award tables) come from the index and are <b>advisory</b>.
                </li>
                <li>Programme pages and every action read the chain directly, so they’re never stale.</li>
                <li>Anyone can run the indexer and compare results.</li>
              </ul>
              <p className="index-status__meta numeric">
                {meta.network} · registry {meta.registry.slice(0, 6)}…{meta.registry.slice(-4)}
              </p>
              <Link to="/about">Contract ids and build →</Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
};

import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MoneyRow } from '../components/programme/MoneyRow';
import '../components/programme/phasePill.css';
import { Skeleton, Empty } from '../components/state/AsyncStates';
import { useIndexedList } from '../hooks';
import { fetchMeta, fetchProgrammes, isStale } from '../lib/indexer';
import {
  DIRECTORY_PHASES,
  filterProgrammes,
  formatAgo,
  formatUsdc,
  mergeProgrammes,
  phaseCounts,
  programmeCta,
  programmeStatus,
  shortId,
  type DirectoryPhase,
  type DirectoryProgramme,
} from '../lib/programmeView';
import './ProgrammeDirectory.css';

const asPhase = (value: string | null): DirectoryPhase =>
  DIRECTORY_PHASES.includes(value as DirectoryPhase) ? (value as DirectoryPhase) : 'All';

/**
 * `/directory` — every programme, narrowed by a search box and phase pills.
 *
 * The list comes from the public index and is advisory; the chain values shown
 * on each card are stand-ins (`FIXTURE_CHAIN`) until the per-programme reads
 * are wired, and every card says so. Filter state lives in the URL so a
 * filtered view can be linked and survives a reload.
 */
export const ProgrammeDirectory = () => {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const phase = asPhase(params.get('phase'));

  const metaRead = useIndexedList(async () => ({ meta: await fetchMeta(), readAt: Date.now() }), []);
  const listRead = useIndexedList(() => fetchProgrammes(), []);

  const setQuery = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set('q', value);
      else next.delete('q');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setPhase = useCallback(
    (value: DirectoryPhase) => {
      const next = new URLSearchParams(params);
      if (value === 'All') next.delete('phase');
      else next.set('phase', value);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('phase');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const all = useMemo(() => mergeProgrammes(listRead.data), [listRead.data]);
  const counts = useMemo(() => phaseCounts(all, query), [all, query]);
  const shown = useMemo(
    () =>
      filterProgrammes(all, query, phase).sort(
        (a, b) => (b.createdLedger ?? 0) - (a.createdLedger ?? 0),
      ),
    [all, query, phase],
  );

  const loading = listRead.loading || metaRead.loading;
  const error = listRead.error ?? metaRead.error;
  const meta = metaRead.data?.meta ?? null;
  const now = metaRead.data?.readAt ?? null;
  const indexedCount = listRead.data?.length ?? 0;
  const indexedAt = meta ? Date.parse(meta.indexedAt) : Number.NaN;
  const stale = meta ? isStale(meta) : false;

  const age = now !== null && !Number.isNaN(indexedAt) ? now - indexedAt : null;
  const ageText = age === null ? 'at an unknown time' : formatAgo(age);

  const indexLine = loading
    ? 'Reading the public index…'
    : meta
      ? `${indexedCount} in the public index${age === null ? '' : ` · updated ${ageText}`}`
      : '';

  const showEmpty = !loading && shown.length === 0;

  return (
    <div className="directory-container">
      <section aria-labelledby="directory-heading" className="directory-section">
        <div className="directory-top">
          <div className="directory-top__copy">
            <h1 id="directory-heading">Programmes</h1>
            <p className="directory-top__lede">
              Fund one, apply to one, or follow where the money went. No sign-in needed to
              browse.
            </p>
          </div>
          <label className="directory-search">
            <span className="directory-search__label">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Programme name or id"
            />
          </label>
        </div>

        <div className="directory-controls">
          <div role="group" aria-label="Filter by phase" className="directory-filters">
            {DIRECTORY_PHASES.map((option) => {
              const on = option === phase;
              return (
                <button
                  key={option}
                  type="button"
                  className={`directory-filter${on ? ' directory-filter--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => setPhase(option)}
                >
                  {option}
                  <span className="directory-filter__count numeric">{counts[option]}</span>
                </button>
              );
            })}
          </div>
          <span className="directory-indexline">{indexLine}</span>
        </div>

        {stale && (
          <div role="status" className="directory-banner directory-banner--stale">
            The public index was last updated {ageText}. New programmes may be missing.
            Anything you open is re-read on-chain.
          </div>
        )}

        {error != null && (
          <div role="alert" className="directory-banner directory-banner--error">
            <span className="directory-banner__title">Couldn&apos;t load the public index.</span>
            <span className="directory-banner__body">
              The list below is the sample set only.
            </span>
            <button
              type="button"
              className="directory-banner__retry"
              onClick={() => {
                listRead.refetch();
                metaRead.refetch();
              }}
            >
              Try again
            </button>
          </div>
        )}

        <div aria-live="polite" aria-busy={loading} className="directory-body">
          {loading && (
            <div className="directory-grid">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="card" label="Loading programmes" />
              ))}
            </div>
          )}

          {showEmpty && (
            <Empty
              title={
                query
                  ? `No programmes match “${query}”`
                  : `No ${phase === 'All' ? '' : `${phase.toLowerCase()} `}programmes right now`
              }
              description="Try another phase, or clear the search."
              onClearFilters={clearFilters}
            />
          )}

          {!loading && shown.length > 0 && (
            <div className="directory-grid">
              {shown.map((programme) => (
                <ProgrammeCard key={programme.id} programme={programme} />
              ))}
            </div>
          )}
        </div>

        <p className="directory-footnote">
          This list comes from the public index, which is advisory. The chain values shown on
          each card are samples until the per-programme reads are wired.
        </p>
      </section>
    </div>
  );
};

function ProgrammeCard({ programme }: { programme: DirectoryProgramme }) {
  const { chain } = programme;
  const budget = BigInt(chain.contributed) - BigInt(chain.fee);
  const href = `/programme/${encodeURIComponent(programme.id)}`;

  return (
    <Link to={href} className="directory-card-link">
      <article className="directory-card-new">
        <div className="directory-card-new__head">
          <span className="directory-card-new__title">
            <span className="directory-card-new__name">{programme.name}</span>
            <span className="directory-card-new__id numeric">{shortId(programme.id)}</span>
          </span>
          <span className={`phase-pill phase-pill--${chain.phase.toLowerCase()}`}>{chain.phase}</span>
        </div>

        <span className="directory-card-new__status">{programmeStatus(chain)}</span>

        <MoneyRow chain={chain} count={20} variant="card" />

        <div className="directory-card-new__figures">
          <Figure label="Budget" value={formatUsdc(budget)} />
          <Figure label="Awarded" value={formatUsdc(chain.awarded)} />
          <Figure label="Released" value={formatUsdc(chain.released)} />
        </div>

        <div className="directory-card-new__foot">
          <span className="directory-card-new__mode">{chain.mode}</span>
          <span className="directory-card-new__sample">
            {programme.sample ? 'Sample data' : 'Sample chain read'}
          </span>
          <span className="directory-card-new__cta">{programmeCta(chain.phase)} →</span>
        </div>
      </article>
    </Link>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="directory-figure">
      <span className="directory-figure__label">{label}</span>
      <span className="directory-figure__value numeric">{value}</span>
    </span>
  );
}

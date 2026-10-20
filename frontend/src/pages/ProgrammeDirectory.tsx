import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MoneyRow } from '../components/programme/MoneyRow';
import { ModePill } from '../components/ui';
import '../components/programme/phasePill.css';
import { Skeleton, Empty } from '../components/state/AsyncStates';
import { describeAmount } from '../lib/amount';
import { useIndexedList, useProgrammeChainReads, useRegistryProgrammes } from '../hooks';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { fetchMeta, fetchProgrammes, isStale } from '../lib/indexer';
import { FIXTURE_USER_ROLES, ROLE_LABELS } from '../fixtures/userRoles';
import {
  DEFAULT_DIRECTORY_SORT,
  DIRECTORY_PHASES,
  DIRECTORY_SORTS,
  directorySearch,
  filterProgrammes,
  sortProgrammes,
  formatAgo,
  formatUsdc,
  hydrateRealProgrammes,
  mergeProgrammes,
  phaseCounts,
  programmeCta,
  programmeSourceTag,
  programmeStatus,
  shortId,
  type DirectoryPhase,
  type DirectorySort,
  type DirectoryProgramme,
} from '../lib/programmeView';
import './ProgrammeDirectory.css';

const asPhase = (value: string | null): DirectoryPhase =>
  DIRECTORY_PHASES.includes(value as DirectoryPhase) ? (value as DirectoryPhase) : 'All';

const asSort = (value: string | null): DirectorySort =>
  DIRECTORY_SORTS.some((option) => option.value === value)
    ? (value as DirectorySort)
    : DEFAULT_DIRECTORY_SORT;

/**
 * `/directory` — every programme, narrowed by a search box and phase pills.
 *
 * The list starts at the public index and is advisory. It is also walked from
 * the registry itself (`nonce()` and `programme_address(n)`, every address
 * re-checked with `is_programme`), so a programme the index is missing —
 * because it is down, or because a just-deployed programme has not been
 * indexed yet — still appears, showing only what the chain will vouch for:
 * its id and its live figures. Names live in the index alone.
 *
 * Every real card's figures are read through the shared per-programme reader;
 * a card still reading says so, and the sample programmes keep their "Sample
 * data" tag. Filter and sort state live in the URL so a narrowed view can be
 * linked and survives a reload.
 */
export const ProgrammeDirectory = () => {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const phase = asPhase(params.get('phase'));
  const sort = asSort(params.get('sort'));
  const yoursOnly = params.get('yours') === '1';
  const { status: walletStatus, address } = useWallet();
  const isSignedIn = walletStatus === 'connected' && address != null;

  const metaRead = useIndexedList(async () => ({ meta: await fetchMeta(), readAt: Date.now() }), []);
  const listRead = useIndexedList(() => fetchProgrammes(), []);
  const registryRead = useRegistryProgrammes();

  const userRoles = isSignedIn ? FIXTURE_USER_ROLES : undefined;

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

  const setSort = useCallback(
    (value: DirectorySort) => {
      const next = new URLSearchParams(params);
      if (value === DEFAULT_DIRECTORY_SORT) next.delete('sort');
      else next.set('sort', value);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const toggleYours = useCallback(() => {
    const next = new URLSearchParams(params);
    if (yoursOnly) next.delete('yours');
    else next.set('yours', '1');
    setParams(next, { replace: true });
  }, [params, setParams, yoursOnly]);

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('phase');
    next.delete('yours');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const realCount = listRead.data?.filter((p) => Boolean(p?.id)).length ?? 0;
  const hasReal = realCount > 0;
  const samplesParam = params.get('samples');
  const showSamples = hasReal ? samplesParam === '1' : true;

  const toggleSamples = useCallback(() => {
    const next = new URLSearchParams(params);
    if (showSamples) next.delete('samples');
    else next.set('samples', '1');
    setParams(next, { replace: true });
  }, [params, setParams, showSamples]);

  const all = useMemo(
    () => mergeProgrammes(listRead.data, userRoles, { showSamples }),
    [listRead.data, userRoles, showSamples],
  );
  const counts = useMemo(() => phaseCounts(all, query), [all, query]);
  const all = useMemo(
    () => mergeProgrammes(listRead.data, userRoles, registryRead.ids ?? undefined),
    [listRead.data, userRoles, registryRead.ids],
  );
  const realIds = useMemo(() => all.filter((p) => !p.sample).map((p) => p.id), [all]);
  const reads = useProgrammeChainReads(realIds);
  // Real cards swap their stand-in chain for the read the moment it lands.
  const hydrated = useMemo(() => hydrateRealProgrammes(all, reads.reads), [all, reads.reads]);
  const readsByError = useMemo(
    () => new Map(Object.entries(reads.errors).map(([id, error]) => [id, error])),
    [reads.errors],
  );

  const counts = useMemo(() => phaseCounts(hydrated, query), [hydrated, query]);
  const shown = useMemo(
    () => sortProgrammes(filterProgrammes(hydrated, query, phase, yoursOnly), sort),
    [hydrated, query, phase, sort, yoursOnly],
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
  // Carried into every programme link, so "All programmes" can come back to
  // this filtered view rather than an empty directory.
  const carriedSearch = directorySearch(params.toString());

  // Issue #485: this list used to be a live region, so every filter change
  // read every card aloud. Announce just the new count instead — once per
  // filter, search or sort change. The ref starts at the initial key so the
  // first load says nothing, and `loading` holds the announcement until the
  // data lands rather than speaking a count that is about to change.
  const announce = useAnnouncer();
  const filterKey = `${query}|${phase}|${sort}|${yoursOnly ? 'yours' : ''}`;
  const announcedKey = useRef(filterKey);

  useEffect(() => {
    if (loading || announcedKey.current === filterKey) return;
    announcedKey.current = filterKey;
    announce(
      shown.length === 1 ? '1 programme matches' : `${shown.length} programmes match`,
    );
  }, [filterKey, loading, shown.length, announce]);

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
            {isSignedIn && (
              <button
                type="button"
                className={`directory-filter${yoursOnly ? ' directory-filter--on' : ''}`}
                aria-pressed={yoursOnly}
                onClick={toggleYours}
              >
                Yours
              </button>
            )}
            {hasReal && (
              <button
                type="button"
                className={`directory-filter${showSamples ? ' directory-filter--on' : ''}`}
                aria-pressed={showSamples}
                onClick={toggleSamples}
              >
                {showSamples ? 'Hide sample programmes' : 'Show sample programmes'}
              </button>
            )}
          </div>
          <label className="directory-sort">
            <span className="directory-sort__label">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(asSort(event.target.value))}
            >
              {DIRECTORY_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="directory-indexline">{indexLine}</span>
        </div>

        {!hasReal && !loading && error == null && (
          <div role="note" className="directory-banner directory-banner--samples">
            <span className="directory-banner__title">Showing sample programmes.</span>
            <span className="directory-banner__body">
              No real programmes have been published to the index yet. These samples demonstrate layout and milestone workflows.
            </span>
          </div>
        )}

        {stale && (
          <div role="status" className="directory-banner directory-banner--stale">
            The public index was last updated {ageText}. New programmes may be missing.
            Anything you open is re-read on-chain.{' '}
            <Link to="/status" className="directory-banner__link">
              View index status
            </Link>
          </div>
        )}

        {error != null && (
          <div role="alert" className="directory-banner directory-banner--error">
            <span className="directory-banner__title">Couldn&apos;t load the public index.</span>
            <span className="directory-banner__body">
              {registryRead.ids && registryRead.ids.length > 0
                ? "The registry's programmes are listed instead, read straight from the chain; names, which only the index stores, return when it does."
                : 'The list below is the sample set only.'}
            </span>
            <button
              type="button"
              className="directory-banner__retry"
              onClick={() => {
                listRead.refetch();
                metaRead.refetch();
                registryRead.refetch();
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Not a live region: the count is announced through the shared
            announcer, so replacing these cards reads nothing (#485). */}
        <div aria-busy={loading} className="directory-body">
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
                <ProgrammeCard key={programme.id} programme={programme} carriedSearch={carriedSearch} />
              ))}
            </div>
          )}
        </div>

        <p className="directory-footnote">
          This list comes from the public index, which is advisory, and is walked from the
          registry for anything the index has not caught up with. Cards tagged “Live on
          chain” show what the chain says; sample programmes keep their sample tag.
        </p>
      </section>
    </div>
  );
};

function ProgrammeCard({
  programme,
  carriedSearch,
}: {
  programme: DirectoryProgramme;
  /** The directory's filters, carried through so the programme can link back. */
  carriedSearch: string;
}) {
  const { chain } = programme;
  const budget = BigInt(chain.contributed) - BigInt(chain.fee);
  const href = `/programme/${encodeURIComponent(programme.id)}${carriedSearch ? `?${carriedSearch}` : ''}`;

  const tag = readError !== undefined
    ? 'Chain read failed'
    : programmeSourceTag(programme);
  // A real programme whose read has not settled yet shows no figures at all:
  // its stand-in `chain` must never be mistaken for chain state.
  const reading = !programme.sample && !programme.real;

  return (
    <Link to={href} className="directory-card-link">
      <article className="directory-card-new">
        <div className="directory-card-new__head">
          <span className="directory-card-new__title">
            <span className="directory-card-new__name">{programme.name}</span>
            {/* A registry-only entry is named by its id already. */}
            {programme.name !== programme.id && (
              <span className="directory-card-new__id numeric">{shortId(programme.id)}</span>
            )}
          </span>
          <span className={`phase-pill${reading ? '' : ` phase-pill--${chain.phase.toLowerCase()}`}`}>
            {reading ? 'Reading' : chain.phase}
          </span>
        </div>

        {programme.userRoles && programme.userRoles.length > 0 && (
          <div className="directory-card-new__roles" aria-label="Your roles">
            {programme.userRoles.map((role) => (
              <span key={role} className="directory-role-badge">
                {ROLE_LABELS[role]}
              </span>
            ))}
          </div>
        )}

        <span className="directory-card-new__status">{programmeStatus(chain)}</span>

        {reading ? (
          <span
            role="status"
            aria-busy="true"
            className="directory-card-new__status"
          >
            Reading this programme on the chain…
          </span>
        ) : (
          <>
            <MoneyRow chain={chain} count={20} variant="card" />

            <div className="directory-card-new__figures">
              <Figure label="Budget" value={formatUsdc(budget)} amount={budget} />
              <Figure label="Awarded" value={formatUsdc(chain.awarded)} amount={chain.awarded} />
              <Figure label="Released" value={formatUsdc(chain.released)} amount={chain.released} />
            </div>
          </>
        )}

        <div className="directory-card-new__foot">
          <span className="directory-card-new__sample">
            {programme.sample ? 'Sample data' : 'Sample chain read'}
          </span>
          <span className="directory-card-new__mode">
            <span className="directory-card-new__mode-label">Planned default</span>
            <ModePill mode={chain.mode} />
          </span>
          <span className="directory-card-new__cta">{programmeCta(chain.phase)} →</span>
        </div>
      </article>
    </Link>
  );
}

function Figure({ label, value, amount }: { label: string; value: string; amount?: bigint | string }) {
  return (
    <span className="directory-figure">
      <span className="directory-figure__label">{label}</span>
      <span
        className="directory-figure__value numeric"
        aria-label={amount !== undefined ? `${label}: ${describeAmount(amount, 'USDC')}` : undefined}
      >
        {value}
      </span>
    </span>
  );
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MoneyLegend, MoneyRow } from '../components/programme/MoneyRow';
import { ArrowRight, ChevronLeft, ChevronRight, Plus, RefreshCw, Search, WifiOff } from 'lucide-react';
import { Badge, ModePill, Notice, PageHead, PhaseBadge, SampleTag, Segmented } from '../components/ui';
import { Skeleton, Empty } from '../components/state/AsyncStates';
import { describeAmount } from '../lib/amount';
import { useIndexedList, useProgrammeChainReads, useRegistryProgrammes } from '../hooks';
import { useWallet } from '../context/useWallet';
import { useAnnouncer } from '../context/useAnnouncer';
import { fetchMeta, fetchProgrammes, indexMismatch, isStale } from '../lib/indexer';
import { samplesEnabled } from '../lib/samples';
import { FIXTURE_USER_ROLES, ROLE_LABELS } from '../fixtures/userRoles';
import {
  DEFAULT_DIRECTORY_SORT,
  DIRECTORY_PHASES,
  DIRECTORY_SORTS,
  directorySearch,
  filterProgrammes,
  sortProgrammes,
  formatAgo,
  formatFigure,
  programmeAsset,
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

/** Cards shown per page. */
const PAGE_SIZE = 24;

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
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const { status: walletStatus, address } = useWallet();
  const isSignedIn = walletStatus === 'connected' && address != null;

  const metaRead = useIndexedList(async () => ({ meta: await fetchMeta(), readAt: Date.now() }), []);
  const listRead = useIndexedList(() => fetchProgrammes(), []);
  const registryRead = useRegistryProgrammes();

  const userRoles = isSignedIn && samplesEnabled() ? FIXTURE_USER_ROLES : undefined;

  const setQuery = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set('q', value);
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setPhase = useCallback(
    (value: DirectoryPhase) => {
      const next = new URLSearchParams(params);
      if (value === 'All') next.delete('phase');
      else next.set('phase', value);
      next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setSort = useCallback(
    (value: DirectorySort) => {
      const next = new URLSearchParams(params);
      if (value === DEFAULT_DIRECTORY_SORT) next.delete('sort');
      else next.set('sort', value);
      next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const toggleYours = useCallback(() => {
    const next = new URLSearchParams(params);
    if (yoursOnly) next.delete('yours');
    else next.set('yours', '1');
    next.delete('page');
    setParams(next, { replace: true });
  }, [params, setParams, yoursOnly]);

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('phase');
    next.delete('yours');
    next.delete('page');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const meta = metaRead.data?.meta ?? null;
  const mismatch = meta ? indexMismatch(meta) : null;
  // An index for another network or registry says nothing about this one:
  // use none of its lists and fall back to the registry and samples.
  const indexProgrammes = mismatch ? null : listRead.data;

  const realCount = indexProgrammes?.filter((p) => Boolean(p?.id)).length ?? 0;
  const hasReal = realCount > 0;
  const samplesParam = params.get('samples');
  const showSamples = samplesEnabled() && (hasReal ? samplesParam === '1' : true);

  const toggleSamples = useCallback(() => {
    const next = new URLSearchParams(params);
    if (showSamples) next.delete('samples');
    else next.set('samples', '1');
    setParams(next, { replace: true });
  }, [params, setParams, showSamples]);

  const all = useMemo(
    () => mergeProgrammes(indexProgrammes, userRoles, { showSamples }, registryRead.ids ?? undefined),
    [indexProgrammes, userRoles, showSamples, registryRead.ids],
  );

  // Counts and filtering need the full merged list. Chain reads fire only for
  // the programmes on the visible page so the RPC is not hammered on load.
  // The hydrated list reuses whatever reads have already settled (cached by
  // sessionRead) so previously-read cards stay hydrated when paging back.
  const counts = useMemo(() => phaseCounts(all, query), [all, query]);
  const shown = useMemo(
    () => sortProgrammes(filterProgrammes(all, query, phase, yoursOnly), sort),
    [all, query, phase, sort, yoursOnly],
  );

  // Pagination: clamp current page to valid range, then slice.
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageShown = useMemo(
    () => shown.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [shown, clampedPage],
  );

  const setPage = useCallback(
    (next: number) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next <= 1) p.delete('page');
          else p.set('page', String(next));
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Only the visible page's real IDs get chain reads.
  const pageRealIds = useMemo(
    () => pageShown.filter((p) => !p.sample).map((p) => p.id),
    [pageShown],
  );
  const reads = useProgrammeChainReads(pageRealIds);
  // Merge the settled reads back into the visible page so cards update live.
  const hydrated = useMemo(() => hydrateRealProgrammes(pageShown, reads.reads), [pageShown, reads.reads]);

  const readsByError = useMemo(
    () => new Map(Object.entries(reads.errors).map(([id, error]) => [id, error])),
    [reads.errors],
  );

  const loading = listRead.loading || metaRead.loading;
  const error = mismatch ? null : listRead.error ?? metaRead.error;
  const now = metaRead.data?.readAt ?? null;
  const indexedCount = indexProgrammes?.length ?? 0;
  const indexedAt = meta ? Date.parse(meta.indexedAt) : Number.NaN;
  const stale = meta && !mismatch ? isStale(meta) : false;

  const age = now !== null && !Number.isNaN(indexedAt) ? now - indexedAt : null;
  const ageText = age === null ? 'at an unknown time' : formatAgo(age);

  const indexLine = loading
    ? 'Reading the public index…'
    : mismatch
      ? 'The public index is for a different deployment'
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

  const phaseOptions = DIRECTORY_PHASES.map((option) => ({
    value: option,
    label: option,
    count: counts[option],
  }));

  return (
    <div className="directory">
      <PageHead
        eyebrow="Programmes"
        title="Where the money is going"
        action={
          <Link to="/admin" className="btn-secondary">
            <Plus aria-hidden="true" />
            Deploy a programme
          </Link>
        }
      >
        Every programme on Milepost, what it funds, and how much has actually been released. No sign-in
        needed to browse.
      </PageHead>

      {mismatch && (
        <Notice tone="warn" role="alert" className="directory-notice">
          <strong>This index belongs to a different deployment.</strong> It was built for{' '}
          <span className="numeric">{mismatch.found.network}</span> with registry{' '}
          <span className="numeric">{mismatch.found.registry}</span>, but this app reads the{' '}
          <span className="numeric">{mismatch.expected.network}</span> registry{' '}
          <span className="numeric">{mismatch.expected.registry}</span>. Its lists are not used; programmes
          are read from the chain instead.
        </Notice>
      )}

      {stale && (
        <Notice tone="warn" role="status" className="directory-notice">
          <strong>The public index was last updated {ageText}.</strong> New programmes may be missing and
          figures may be out of date. Anything you open is re-read on the chain.{' '}
          <Link to="/status">View index status</Link>
        </Notice>
      )}

      {error != null && (
        <div role="alert" className="directory-error">
          <p className="directory-error__title">
            <WifiOff aria-hidden="true" />
            Couldn&apos;t load the public index.
          </p>
          <p className="directory-error__body">
            {registryRead.ids && registryRead.ids.length > 0
              ? "The registry's programmes are listed instead, read straight from the chain; names, which only the index stores, return when it does."
              : 'The list below is the sample set only.'}
          </p>
          <button
            type="button"
            className="btn-secondary directory-error__retry"
            onClick={() => {
              listRead.refetch();
              metaRead.refetch();
              registryRead.refetch();
            }}
          >
            <RefreshCw aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      {!hasReal && !loading && error == null && !mismatch && (
        <Notice role="note" className="directory-notice">
          <strong>Showing sample programmes.</strong> No real programmes have been published to the index
          yet. These samples demonstrate layout and milestone workflows.
        </Notice>
      )}

      <div className="directory-toolbar">
        <div className="directory-search">
          <Search aria-hidden="true" />
          <label className="visually-hidden" htmlFor="directory-search">
            Search programmes
          </label>
          <input
            id="directory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or id"
          />
        </div>
        <div className="directory-toolbar__filters">
          <Segmented label="Filter by phase" options={phaseOptions} value={phase} onChange={setPhase} />
          {isSignedIn && (
            <button type="button" className="directory-toggle" aria-pressed={yoursOnly} onClick={toggleYours}>
              Yours
            </button>
          )}
          {hasReal && samplesEnabled() && (
            <button type="button" className="directory-toggle" aria-pressed={showSamples} onClick={toggleSamples}>
              {showSamples ? 'Hide sample programmes' : 'Show sample programmes'}
            </button>
          )}
          <label className="visually-hidden" htmlFor="directory-sort">
            Sort
          </label>
          <select
            id="directory-sort"
            className="directory-sort"
            value={sort}
            onChange={(event) => setSort(asSort(event.target.value))}
          >
            {DIRECTORY_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`directory-fresh${stale ? ' directory-fresh--stale' : ''}`}>
        {indexLine && (
          <span className="directory-fresh__index">
            <i className="directory-fresh__dot" aria-hidden="true" />
            {indexLine}
          </span>
        )}
        <span>Lists are advisory. Actions re-read the chain.</span>
        <MoneyLegend />
      </div>

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
          <>
            <div className="directory-grid">
              {hydrated.map((programme) => (
                <ProgrammeCard
                  key={programme.id}
                  programme={programme}
                  carriedSearch={carriedSearch}
                  readError={readsByError.get(programme.id)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="directory-pagination" aria-label="Programme pages">
                <button
                  type="button"
                  className="directory-pagination__btn"
                  onClick={() => setPage(clampedPage - 1)}
                  disabled={clampedPage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  Previous
                </button>
                <span
                  className="directory-pagination__count"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {(clampedPage - 1) * PAGE_SIZE + 1}–{Math.min(clampedPage * PAGE_SIZE, shown.length)} of {shown.length}
                </span>
                <button
                  type="button"
                  className="directory-pagination__btn"
                  onClick={() => setPage(clampedPage + 1)}
                  disabled={clampedPage >= totalPages}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      <p className="directory-footnote">
        This list comes from the public index, which is advisory, and is walked from the registry for
        anything the index has not caught up with. Cards tagged “Live on chain” show what the chain says;
        sample programmes keep their sample tag.
      </p>
    </div>
  );
};

function ProgrammeCard({
  programme,
  carriedSearch,
  readError,
}: {
  programme: DirectoryProgramme;
  /** The directory's filters, carried through so the programme can link back. */
  carriedSearch: string;
  /** Set when this real programme's chain read failed. */
  readError?: unknown;
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
  const asset = programmeAsset(programme);

  return (
    <Link to={href} className={`directory-card directory-card--${chain.phase.toLowerCase()}`}>
      <span className="directory-card__top">
        {programme.sample ? <SampleTag /> : <span className="directory-card__source">{tag}</span>}
        {reading ? <Badge tone="neutral">Reading</Badge> : <PhaseBadge phase={chain.phase} />}
      </span>

      <h2 className="directory-card__name">{programme.name}</h2>
      {/* A registry-only entry is named by its id already. */}
      <span className="directory-card__id numeric">
        {programme.name !== programme.id && `${shortId(programme.id)} · `}
        {asset}
      </span>

      {programme.userRoles && programme.userRoles.length > 0 && (
        <span className="directory-card__roles" aria-label="Your roles">
          {programme.userRoles.map((role) => (
            <span key={role} className="directory-card__role">
              {ROLE_LABELS[role]}
            </span>
          ))}
          {/* The roles are stand-ins until the per-programme role reads are wired. */}
          {!programme.sample && <SampleTag />}
        </span>
      )}

      <span className="directory-card__status">{programmeStatus(chain)}</span>

      {reading ? (
        <span role="status" aria-busy="true" className="directory-card__status directory-card__money">
          Reading this programme on the chain…
        </span>
      ) : (
        <>
          <span className="directory-card__money">
            <MoneyRow chain={chain} count={40} variant="card" />
          </span>

          <span className="directory-card__figures">
            <Figure label="Budget" amount={budget} asset={asset} />
            <Figure label="Awarded" amount={chain.awarded} asset={asset} />
            <Figure label="Released" amount={chain.released} asset={asset} />
          </span>
        </>
      )}

      <span className="directory-card__foot">
        {chain.mode ? (
          <span className="directory-card__mode">
            <span className="visually-hidden">Planned default</span>
            <ModePill mode={chain.mode} />
          </span>
        ) : (
          <span />
        )}
        <span className="directory-card__cta">
          {programmeCta(chain.phase)}
          <ArrowRight aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

/** A bare figure; the card names the asset once, beside the id. */
function Figure({ label, amount, asset }: { label: string; amount: bigint | string; asset: string }) {
  return (
    <span className="directory-card__figure">
      <span className="directory-card__figure-label">{label}</span>
      <span
        className="directory-card__figure-value numeric"
        aria-label={`${label}: ${describeAmount(amount, asset)}`}
      >
        {formatFigure(amount)}
      </span>
    </span>
  );
}

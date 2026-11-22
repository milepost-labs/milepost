import type { FC } from 'react';
import { useCallback, useContext, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Buffer } from 'buffer';
import type { Award, ProgrammeConfig } from '@milepost/program';
import type { IndexedAward } from '../../lib/indexer';
import { fetchAwards } from '../../lib/indexer';
import { useIndexedList } from '../../hooks/useIndexedList';
import { useContractRead, useContractResult } from '../../hooks/useContractRead';
import { useProgrammeMetadata } from '../../hooks/useProgrammeMetadata';
import { SorobanContext } from '../../context/sorobanStore';
import { formatAmount, parseAmount, describeAmount } from '../../lib/amount';
import { awardsToCsv, downloadFile } from '../../lib/csv';
import { formatFigure, isSampleProgrammeId } from '../../lib/programmeView';
import { FIXTURE_AWARDS } from '../../fixtures/programmeFixtures';
import { Empty } from '../state/AsyncStates';
import { Badge, Button, SampleTag } from '../ui';
import './AwardsTab.css';

/** Awards shown per page. */
const PAGE_SIZE = 25;

/** URL search param that carries the current awards page (1-indexed). */
const PAGE_PARAM = 'awardsPage';

export interface AwardsTabProps {
  programmeId: string;
  phase?: string;
  isSample?: boolean;
  asset?: string;
}

function parseAwardStroops(val: string | number | bigint | undefined | null): bigint {
  if (val === null || val === undefined) return 0n;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(Math.floor(val));
  const s = String(val).trim();
  if (!s) return 0n;
  try {
    if (s.includes('.')) {
      return parseAmount(s);
    }
    return BigInt(s);
  } catch {
    return 0n;
  }
}

function shortAddress(addr: string): string {
  if (!addr) return '—';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export interface AwardRowItemProps {
  award: IndexedAward;
  programmeId: string;
  isSample: boolean;
  asset: string;
  payeeNames?: Map<string, string>;
}

export const AwardRowItem: FC<AwardRowItemProps> = ({
  award,
  programmeId,
  isSample,
  asset,
  payeeNames,
}) => {
  const soroban = useContext(SorobanContext);
  const programme = useMemo(() => {
    if (!soroban || !programmeId || isSample) return null;
    try {
      return soroban.programmeAt(programmeId);
    } catch {
      return null;
    }
  }, [soroban, programmeId, isSample]);

  const standaloneConfig = useContractResult<ProgrammeConfig>(
    () => programme!.get_config(),
    [programme],
    { enabled: Boolean(programme && !payeeNames) },
  );
  const standaloneHashHex = standaloneConfig.data
    ? Buffer.from(standaloneConfig.data.metadata_hash).toString('hex')
    : null;
  const standaloneMetadata = useProgrammeMetadata(payeeNames ? null : standaloneHashHex);

  const effectivePayeeNames = useMemo(() => {
    if (payeeNames) return payeeNames;
    if (standaloneMetadata?.status !== 'ok' || !standaloneMetadata.doc.labels) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const l of standaloneMetadata.doc.labels) {
      if (l.role === 'payee' && l.label?.trim()) {
        map.set(l.address.trim(), l.label.trim());
      }
    }
    return map;
  }, [payeeNames, standaloneMetadata]);

  const payeeName = award.payee ? effectivePayeeNames.get(award.payee.trim()) : undefined;

  const isPayee = useContractRead<boolean>(
    () => programme!.is_payee({ payee: award.payee! }),
    [programme, award.payee],
    { enabled: Boolean(programme && award.payee && payeeName) },
  );

  const chainAward = useContractResult<Award>(
    () => programme!.get_award({ recipient: award.recipient }),
    [programme, award.recipient],
    { enabled: Boolean(programme && award.recipient) },
  );

  const indexGranted = parseAwardStroops(award.granted);
  const indexReleased = parseAwardStroops(award.released);
  const indexTranches = Number(award.tranches ?? 0);
  const indexTranchesReleased = Number(award.tranchesReleased ?? 0);

  const chainSuccess = Boolean(!chainAward.loading && !chainAward.error && chainAward.data);
  const chainFailed = Boolean(!chainAward.loading && chainAward.error);

  const granted = chainSuccess ? BigInt(chainAward.data!.granted) : indexGranted;
  const released = chainSuccess ? BigInt(chainAward.data!.released) : indexReleased;
  const tranches = chainSuccess ? Number(chainAward.data!.tranches) : indexTranches;
  const tranchesReleased = chainSuccess ? Number(chainAward.data!.tranches_released) : indexTranchesReleased;
  const hasTranches = tranches > 0;

  const trancheLabel = `${tranchesReleased} of ${tranches} tranches released`;

  const differs = chainSuccess && (
    granted !== indexGranted ||
    released !== indexReleased ||
    tranches !== indexTranches ||
    tranchesReleased !== indexTranchesReleased
  );

  let mismatchText = '';
  if (differs) {
    if (released !== indexReleased) {
      mismatchText = `Index behind: shows ${formatAmount(indexReleased, { asset })}`;
    } else if (granted !== indexGranted) {
      mismatchText = `Index behind: shows ${formatAmount(indexGranted, { asset })}`;
    } else if (tranchesReleased !== indexTranchesReleased || tranches !== indexTranches) {
      mismatchText = `Index behind: shows ${indexTranchesReleased} of ${indexTranches} tranches`;
    }
  }

  return (
    <tr>
      <td data-label="Recipient">
        <span className="awards-tab__recipient-line">
          <Link
            to={`/award/${encodeURIComponent(programmeId)}/${encodeURIComponent(award.recipient)}`}
            className="awards-tab__recipient-link numeric"
            title={award.recipient}
            aria-label={`Open the award for ${award.recipient}`}
          >
            {shortAddress(award.recipient)}
          </Link>
          {chainFailed && <Badge tone="neutral">Advisory</Badge>}
        </span>
        {differs && (
          <span className="awards-tab__diff" role="status">
            {mismatchText}
          </span>
        )}
      </td>
      <td data-label="Tranches">
        {hasTranches ? (
          <span className="awards-tab__tranches" role="img" aria-label={trancheLabel}>
            {Array.from({ length: tranches }, (_, i) => (
              <span
                key={i}
                className="awards-tab__tranche"
                data-money-state={i < tranchesReleased ? 'released' : 'locked'}
              />
            ))}
          </span>
        ) : (
          <span className="awards-tab__muted">Read on-chain</span>
        )}
      </td>
      <td data-label="Award" className="numeric-col numeric" aria-label={describeAmount(granted, asset)}>
        {formatFigure(granted)}
      </td>
      <td data-label="Released" className="numeric-col numeric" aria-label={describeAmount(released, asset)}>
        {formatFigure(released)}
      </td>
      <td data-label="Payee">
        {award.payee ? (
          payeeName ? (
            <span className="awards-tab__payee-wrap">
              <span className="awards-tab__payee-name">
                {payeeName} <span className="awards-tab__claim-tag">(creator’s claim)</span>
              </span>
              <span className="awards-tab__payee numeric" title={award.payee}>
                {shortAddress(award.payee)}
              </span>
              {isPayee.loading ? (
                <Badge tone="neutral">Checking…</Badge>
              ) : isPayee.data === true ? (
                <Badge tone="success">Verified payee</Badge>
              ) : isPayee.data === false ? (
                <Badge tone="danger">Not a verified payee</Badge>
              ) : isPayee.error ? (
                <Badge tone="warning">Couldn’t check</Badge>
              ) : null}
            </span>
          ) : (
            <span className="awards-tab__payee numeric" title={award.payee}>
              {shortAddress(award.payee)}
            </span>
          )
        ) : (
          <span className="awards-tab__muted">Not set</span>
        )}
      </td>
    </tr>
  );
};

/** Previous / Next controls with a count. */
interface PaginationProps {
  page: number;
  totalPages: number;
  totalAwards: number;
  pageSize: number;
  onPage: (page: number) => void;
}

const Pagination: FC<PaginationProps> = ({ page, totalPages, totalAwards, pageSize, onPage }) => {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalAwards);

  return (
    <nav className="awards-tab__pagination" aria-label="Awards pages">
      <button
        type="button"
        className="awards-tab__page-btn"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Previous
      </button>
      <span className="awards-tab__page-count" aria-live="polite" aria-atomic="true">
        {start}–{end} of {totalAwards}
      </span>
      <button
        type="button"
        className="awards-tab__page-btn"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
};

export const AwardsTab: FC<AwardsTabProps> = ({
  programmeId,
  phase = 'Open',
  isSample = false,
  asset = 'USDC',
}) => {
  // A caller may only relax this to a sample when the id really is a fixture id;
  // a contract-shaped id can never be a sample, so its awards always come from
  // the index.
  const sample = isSample && isSampleProgrammeId(programmeId);

  const [searchParams, setSearchParams] = useSearchParams();

  // Page is 1-indexed; clamp to 1 if the param is absent or invalid.
  const rawPage = Number(searchParams.get(PAGE_PARAM) ?? '1');
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const {
    data: fetchedAwards,
    loading,
    error,
  } = useIndexedList<IndexedAward[]>(
    () => fetchAwards(programmeId),
    [programmeId],
    { enabled: Boolean(programmeId) && !sample },
  );

  const allAwards = useMemo(() => {
    if (sample) return phase === 'Settled' ? FIXTURE_AWARDS : [];
    return fetchedAwards ?? [];
  }, [sample, phase, fetchedAwards]);

  const totalPages = Math.max(1, Math.ceil(allAwards.length / PAGE_SIZE));
  // Clamp the current page to the valid range once allAwards is known.
  const clampedPage = Math.min(page, totalPages);

  // Only the visible page is passed to AwardRowItem — chain reads fire for
  // these rows only, not for every award in the list.
  const pageAwards = useMemo(
    () => allAwards.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [allAwards, clampedPage],
  );

  const soroban = useContext(SorobanContext);
  const programme = useMemo(() => {
    if (!soroban || !programmeId || sample) return null;
    try {
      return soroban.programmeAt(programmeId);
    } catch {
      return null;
    }
  }, [soroban, programmeId, sample]);

  const config = useContractResult<ProgrammeConfig>(
    () => programme!.get_config(),
    [programme],
    { enabled: Boolean(programme) },
  );
  const hashHex = config.data
    ? Buffer.from(config.data.metadata_hash).toString('hex')
    : null;
  const metadata = useProgrammeMetadata(hashHex);

  const payeeNames = useMemo(() => {
    if (metadata?.status !== 'ok' || !metadata.doc.labels) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const l of metadata.doc.labels) {
      if (l.role === 'payee' && l.label?.trim()) {
        map.set(l.address.trim(), l.label.trim());
      }
    }
    return map;
  }, [metadata]);

  const handlePage = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set(PAGE_PARAM, String(next));
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const advisoryNote = sample
    ? 'Awards use the middle reviewer vote after enough reviewers have voted. Listed from the public index, advisory.'
    : 'From the public index (awards.json), advisory. Each award is re-read on-chain before it is acted on.';

  // CSV export covers all awards, not just the visible page.
  const handleDownloadCsv = useCallback(() => {
    const csv = awardsToCsv(allAwards, new Date().toISOString());
    const filename = `awards-${programmeId.slice(0, 12)}-${Date.now()}.csv`;
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  }, [allAwards, programmeId]);

  const empty =
    phase === 'Open'
      ? { title: 'No awards yet', description: 'Applications are still open.' }
      : phase === 'Review'
        ? {
            title: 'No awards are final yet',
            description: 'Each is set once enough reviewer votes are in and someone finalizes it.',
          }
        : phase === 'Settled'
          ? { title: 'No awards were made', description: 'The programme settled without any.' }
          : phase === 'Cancelled'
            ? { title: 'No awards', description: 'This programme was cancelled before any awards were set.' }
            : { title: 'No awards yet', description: 'The index has no awards for this programme yet.' };

  return (
    <div
      className="awards-tab"
      role="tabpanel"
      id="panel-awards"
      aria-labelledby="tab-awards"
      tabIndex={0}
    >
      {!loading && !error && allAwards.length > 0 && (
        <div className="awards-tab__bar">
          <span className="awards-tab__count">
            {allAwards.length} {allAwards.length === 1 ? 'award' : 'awards'} · amounts in {asset}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={14} aria-hidden="true" />}
            onClick={handleDownloadCsv}
          >
            Download CSV
          </Button>
        </div>
      )}

      {loading && (
        <div className="awards-tab__status" role="status" aria-live="polite">
          <span>Reading awards…</span>
        </div>
      )}

      {!loading && Boolean(error) && (
        <div className="awards-tab__error" role="alert">
          <p>
            Couldn&apos;t load awards from the index.{' '}
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      {!loading && !error && allAwards.length === 0 && <Empty {...empty} />}

      {!loading && !error && allAwards.length > 0 && (
        <>
          <table className="ui-table awards-tab__table">
            <thead>
              <tr>
                <th scope="col">Recipient</th>
                <th scope="col">Tranches</th>
                <th scope="col" className="numeric-col">
                  Award
                </th>
                <th scope="col" className="numeric-col">
                  Released
                </th>
                <th scope="col">Payee</th>
              </tr>
            </thead>
            <tbody>
              {pageAwards.map((award, idx) => (
                <AwardRowItem
                  key={`${award.recipient}-${(clampedPage - 1) * PAGE_SIZE + idx}`}
                  award={award}
                  programmeId={programmeId}
                  isSample={isSample}
                  asset={asset}
                  payeeNames={payeeNames}
                />
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <Pagination
              page={clampedPage}
              totalPages={totalPages}
              totalAwards={allAwards.length}
              pageSize={PAGE_SIZE}
              onPage={handlePage}
            />
          )}
        </>
      )}

      <p className="awards-tab__note">
        {sample && <><SampleTag />{' '}</>}
        {advisoryNote}
      </p>
    </div>
  );
};

import type { FC } from 'react';
import { useCallback, useContext, useMemo } from 'react';
import { Download } from 'lucide-react';
import type { Award } from '@milepost/program';
import type { IndexedAward } from '../../lib/indexer';
import { fetchAwards } from '../../lib/indexer';
import { useIndexedList } from '../../hooks/useIndexedList';
import { useContractResult } from '../../hooks/useContractRead';
import { SorobanContext } from '../../context/sorobanStore';
import { formatAmount, parseAmount, describeAmount } from '../../lib/amount';
import { awardsToCsv, downloadFile } from '../../lib/csv';
import { formatFigure, isSampleProgrammeId } from '../../lib/programmeView';
import { FIXTURE_AWARDS } from '../../fixtures/programmeFixtures';
import { Empty } from '../state/AsyncStates';
import { Badge, Button, SampleTag } from '../ui';
import './AwardsTab.css';

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
}

export const AwardRowItem: FC<AwardRowItemProps> = ({
  award,
  programmeId,
  isSample,
  asset,
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
          <span className="awards-tab__recipient numeric" title={award.recipient}>
            {shortAddress(award.recipient)}
          </span>
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
          <span className="awards-tab__payee numeric" title={award.payee}>
            {shortAddress(award.payee)}
          </span>
        ) : (
          <span className="awards-tab__muted">Not set</span>
        )}
      </td>
    </tr>
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

  const {
    data: fetchedAwards,
    loading,
    error,
  } = useIndexedList<IndexedAward[]>(
    () => fetchAwards(programmeId),
    [programmeId],
    { enabled: Boolean(programmeId) && !sample },
  );

  const awards = useMemo(() => {
    if (sample) return phase === 'Settled' ? FIXTURE_AWARDS : [];
    return fetchedAwards ?? [];
  }, [sample, phase, fetchedAwards]);

  const advisoryNote = sample
    ? 'Awards use the middle reviewer vote after enough reviewers have voted. Listed from the public index, advisory.'
    : 'From the public index (awards.json), advisory. Each award is re-read on-chain before it is acted on.';

  const handleDownloadCsv = useCallback(() => {
    const csv = awardsToCsv(awards, new Date().toISOString());
    const filename = `awards-${programmeId.slice(0, 12)}-${Date.now()}.csv`;
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  }, [awards, programmeId]);

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
      {!loading && !error && awards.length > 0 && (
        <div className="awards-tab__bar">
          <span className="awards-tab__count">
            {awards.length} {awards.length === 1 ? 'award' : 'awards'} · amounts in {asset}
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

      {!loading && !error && awards.length === 0 && <Empty {...empty} />}

      {!loading && !error && awards.length > 0 && (
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
            {awards.map((award, idx) => (
              <AwardRowItem
                key={`${award.recipient}-${idx}`}
                award={award}
                programmeId={programmeId}
                isSample={isSample}
                asset={asset}
              />
            ))}
          </tbody>
        </table>
      )}

      <p className="awards-tab__note">
        {sample && <><SampleTag />{' '}</>}
        {advisoryNote}
      </p>
    </div>
  );
};

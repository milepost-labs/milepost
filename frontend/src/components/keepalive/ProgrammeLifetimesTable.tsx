import { Button, Table, type Column } from '../ui';
import { explain } from '../../lib/errors';
import { truncateAddress } from '../../lib/format';
import { sortByDaysLeft, type ProgrammeInstanceLifetime } from '../../lib/entryTtl';
import { TTL_EXTENDED_DAYS, TTL_WARNING_DAYS } from '../../fixtures/keepaliveFixtures';
import './ProgrammeLifetimesTable.css';

export interface ProgrammeLifetimeRow extends ProgrammeInstanceLifetime {
  /** The creator's name from the index, when it has one. */
  name: string | null;
}

/**
 * Every indexed programme's contract instance lifetime, most urgent first.
 * Rows under the warning threshold say so in words as well as colour, and
 * Extend hands the programme to the page's existing per-programme flow.
 */
export function ProgrammeLifetimesTable({
  rows,
  onExtend,
}: {
  rows: ProgrammeLifetimeRow[];
  onExtend: (programmeId: string) => void;
}) {
  const label = (row: ProgrammeLifetimeRow) => row.name ?? truncateAddress(row.programmeId);
  const columns: Column<ProgrammeLifetimeRow>[] = [
    {
      key: 'programme',
      header: 'Programme',
      render: (row) => (
        <span className="lifetimes-table__programme">
          <span className="lifetimes-table__name">{label(row)}</span>
          {row.name && <span className="lifetimes-table__id numeric">{truncateAddress(row.programmeId)}</span>}
        </span>
      ),
    },
    {
      key: 'days',
      header: 'Days left',
      render: (row) => <DaysLeft row={row} />,
    },
    {
      key: 'extend',
      header: 'Extend',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Extend ${label(row)}`}
          onClick={() => onExtend(row.programmeId)}
        >
          Extend
        </Button>
      ),
    },
  ];

  return (
    <Table
      caption="Programme contract lifetimes, fewest days left first"
      columns={columns}
      rows={sortByDaysLeft(rows)}
      keyOf={(row) => row.programmeId}
    />
  );
}

function DaysLeft({ row }: { row: ProgrammeLifetimeRow }) {
  if (row.error) {
    return <span className="lifetimes-table__failed">Could not read: {explain(row.error).message}</span>;
  }
  const days = row.liveForDays;
  const low = days === null || days < TTL_WARNING_DAYS;
  return (
    <span className={`lifetimes-table__days${low ? ' lifetimes-table__days--low' : ''}`}>
      <span className="numeric">{days === null ? 'Not found' : `${days} days`}</span>
      {low && (
        <span className="lifetimes-table__warn">
          {days === null ? 'Archived or missing, extend or restore it' : `Under ${TTL_WARNING_DAYS} days`}
        </span>
      )}
      <span className="lifetimes-table__bar" aria-hidden="true">
        <span style={{ width: `${days === null ? 0 : Math.min(100, Math.round((days / TTL_EXTENDED_DAYS) * 100))}%` }} />
      </span>
    </span>
  );
}

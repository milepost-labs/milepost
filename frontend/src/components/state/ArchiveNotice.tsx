import { Link } from 'react-router-dom';

export interface ArchiveNoticeProps {
  programmeId: string;
}

export function ArchiveNotice({ programmeId }: ArchiveNoticeProps) {
  return (
    <div className="archive-notice">
      <p>
        This data is archived. The entry's lifetime on the ledger expired. It can be restored by sending a transaction that touches it—the system will restore it automatically and then process your request.
      </p>
      <p>
        You can bump entries manually on the <Link to={`/keepalive?programme=${programmeId}`}>Keepalive screen</Link> to extend their lifetime before they expire.
      </p>
    </div>
  );
}

import { StandingWriterAdmin } from '../components/admin/StandingWriterAdmin';
import { PageHead } from '../components/ui';
import { usePageTitle } from '../hooks/usePageTitle';

/** `/admin/standing`: which contracts may credit a recipient's standing. */
export const AdminStanding = () => {
  usePageTitle('Standing writers');
  return (
    <div className="admin-standing">
      <PageHead eyebrow="Admin" title="Standing writers">
        <p>
          Standing is a recipient’s portable record of totals across programmes. Only writer contracts can add to it,
          and each write is a count, never details.
        </p>
      </PageHead>
      <StandingWriterAdmin />
    </div>
  );
};

import { StandingWriterAdmin } from '../components/admin/StandingWriterAdmin';
import './RegistryAdmin.css';

/**
 * Standing-writer administration, a screen of the admin area (issue #341)
 * rendered inside `AdminLayout`. Reachable at the same `/admin/standing`
 * path, so nothing that already linked here breaks.
 */
export const AdminStanding = () => (
  <div className="admin-page__grid">
    <StandingWriterAdmin />
  </div>
);

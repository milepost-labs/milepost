import { NavLink } from 'react-router-dom';
import { StandingWriterAdmin } from '../components/admin/StandingWriterAdmin';
import { ADMIN_SECTIONS } from './adminSections';
import './RegistryAdmin.css';

/**
 * Standing-writer administration, now a section of the admin area (issue
 * #341) rather than its own separate page (the old `AdminDashboard.tsx`,
 * which also duplicated the registry console — see `RegistryAdmin.tsx`).
 * Reachable at the same `/admin/standing` path, so nothing that already
 * linked here breaks.
 */
export const AdminStanding = () => (
  <div className="dashboard-container admin-page">
    <header className="dashboard-header">
      <h1>Standing writers</h1>
      <p className="typo-text text-muted">
        Manage which contracts may write recipient standing.
      </p>
    </header>
    <nav className="admin-page__sections" aria-label="Admin sections">
      {ADMIN_SECTIONS.map((section) => (
        <NavLink
          key={section.to + section.label}
          to={section.to}
          end={section.to === '/admin'}
          className={({ isActive }) =>
            isActive ? 'admin-page__pill admin-page__pill--current' : 'admin-page__pill'
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
    <div className="admin-page__grid">
      <StandingWriterAdmin />
    </div>
  </div>
);

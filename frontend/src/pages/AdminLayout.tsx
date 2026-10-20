import { NavLink, Outlet } from 'react-router-dom';
import { ADMIN_SECTIONS } from './adminSections';
import './AdminLayout.css';

/**
 * The shared shell for every admin screen: one heading and one row of tab
 * pills, with the current screen rendered below through the router's outlet.
 * The tabs are real links, so each screen keeps its own URL and `NavLink`
 * marks the current one with `aria-current="page"`.
 */
export const AdminLayout = () => (
  <div className="admin-shell">
    <header className="admin-shell__header">
      <h1>Run programmes</h1>
      <p className="typo-text text-muted">
        Finalize awards, deploy new programmes through the registry, register what verifiers
        sign, manage standing writers and keep programme entries alive.
      </p>
    </header>
    <nav className="admin-shell__tabs" aria-label="Admin sections">
      {ADMIN_SECTIONS.map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          end
          className={({ isActive }) =>
            isActive ? 'admin-shell__pill admin-shell__pill--current' : 'admin-shell__pill'
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
    <Outlet />
  </div>
);

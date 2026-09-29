import { NavLink } from 'react-router-dom';
import { DeployProgramme } from '../components/admin/DeployProgramme';
import { ProtocolConfigCard } from '../components/admin/ProtocolConfigCard';
import { ADMIN_SECTIONS } from './adminSections';
import './RegistryAdmin.css';

/**
 * Protocol administration: finalize awards, deploy programmes through the
 * registry, and register what verifiers sign.
 *
 * Deploy carries the constructor constraints (ordered deadlines, quorum
 * bound, verifiers, schema); the protocol config card reads live from the
 * registry and, for the registry admin, is also where its settings are
 * changed (issue #342) — there is no separate console duplicating the same
 * fields.
 */
export const RegistryAdmin = () => (
  <div className="dashboard-container admin-page">
    <header className="dashboard-header">
      <h1>Run programmes</h1>
      <p className="typo-text text-muted">
        Finalize awards, deploy new programmes through the registry, and register what
        verifiers sign.
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
      <DeployProgramme />
      <ProtocolConfigCard />
    </div>
  </div>
);

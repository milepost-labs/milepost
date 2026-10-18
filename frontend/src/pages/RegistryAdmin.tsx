import { DeployProgramme } from '../components/admin/DeployProgramme';
import { ProtocolConfigCard } from '../components/admin/ProtocolConfigCard';
import './RegistryAdmin.css';

/**
 * Deploy a programme through the registry. Rendered inside `AdminLayout`,
 * which supplies the page heading and the admin tabs.
 *
 * Deploy carries the constructor constraints (ordered deadlines, quorum
 * bound, verifiers, schema); the protocol config card reads live from the
 * registry and, for the registry admin, is also where its settings are
 * changed (issue #342) — there is no separate console duplicating the same
 * fields.
 */
export const RegistryAdmin = () => (
  <div className="admin-page__grid">
    <DeployProgramme />
    <ProtocolConfigCard />
  </div>
);

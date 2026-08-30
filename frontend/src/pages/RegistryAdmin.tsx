import { RegistryAdminConsole } from '../components/admin/RegistryAdminConsole';

/**
 * Protocol configuration every future programme inherits. The console handles
 * its own admin gating and renders read-only for anyone else, so this page is
 * only the route and the framing.
 */
export const RegistryAdmin = () => (
  <div className="dashboard-container">
    <header className="dashboard-header">
      <h1>Protocol administration</h1>
      <p className="typo-text text-muted">
        Fee, treasury, policy and programme wasm on the registry. These are inherited by every
        programme created after they change; existing programmes keep the terms they were
        deployed with.
      </p>
    </header>
    <RegistryAdminConsole />
  </div>
);

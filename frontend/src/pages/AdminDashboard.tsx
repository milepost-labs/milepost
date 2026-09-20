import { RegistryAdminConsole } from "../components/admin/RegistryAdminConsole";
import { StandingWriterAdmin } from "../components/admin/StandingWriterAdmin";
import "./FunderDashboard.css";

export const AdminDashboard = () => {
  return (
    <div className="dashboard-container">
      <header className="dashboard-header animate-fade-up">
        <h1>Admin Dashboard</h1>
        <p className="typo-text text-muted">
          Protocol registry and standing record administration
        </p>
      </header>

      <section
        className="animate-fade-up"
        style={{ animationDelay: "100ms", marginBottom: "2rem" }}
      >
        <RegistryAdminConsole />
      </section>

      <section className="animate-fade-up" style={{ animationDelay: "200ms" }}>
        <StandingWriterAdmin />
      </section>
    </div>
  );
};

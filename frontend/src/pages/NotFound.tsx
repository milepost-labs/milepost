import { Link } from 'react-router-dom';
import './NotFound.css';

export const NotFound = () => {
  return (
    <div className="not-found" role="alert">
      <h1>Page not found</h1>
      <p className="typo-text text-muted">
        The address you followed does not match any page in this app. It may be a mistyped programme
        address or a stale link — not a bug.
      </p>
      <nav className="not-found__links" aria-label="Main sections">
        <Link to="/" className="not-found__link">Home</Link>
        <Link to="/directory" className="not-found__link">Directory</Link>
        <Link to="/funders" className="not-found__link">Funders</Link>
        <Link to="/recipients" className="not-found__link">Recipients</Link>
        <Link to="/verifiers" className="not-found__link">Verifiers</Link>
        <Link to="/attestations" className="not-found__link">Attestations</Link>
        <Link to="/schemas/register" className="not-found__link">Register schema</Link>
        <Link to="/policy" className="not-found__link">Policy</Link>
        <Link to="/admin" className="not-found__link">Admin</Link>
      </nav>
      <p className="typo-text text-muted" style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
        If you pasted a programme address, check it against the directory. Navigation remains available above.
      </p>
    </div>
  );
};

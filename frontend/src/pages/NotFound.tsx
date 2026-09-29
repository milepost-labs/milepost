import { Link, useLocation } from 'react-router-dom';
import './NotFound.css';

export const NotFound = () => {
  const location = useLocation();
  const route = `${location.pathname}${location.search}`;

  return (
    <div className="not-found">
      <section className="not-found__card" aria-labelledby="not-found-heading">
        <span className="not-found__marks" aria-hidden="true">
          <span className="not-found__mark not-found__mark--accent" />
          <span className="not-found__mark not-found__mark--locked" />
          <span className="not-found__mark not-found__mark--locked" />
        </span>
        <h1 id="not-found-heading">This page doesn't exist</h1>
        <p className="typo-text text-muted">
          Nothing lives at <span className="not-found__route">{route}</span>. If you followed a
          link to a programme, it may not be in the public index yet.
        </p>
        <div className="not-found__actions">
          <Link to="/directory" className="not-found__action not-found__action--primary">
            Browse programmes
          </Link>
          <Link to="/" className="not-found__action not-found__action--secondary">
            Home
          </Link>
        </div>
      </section>
    </div>
  );
};

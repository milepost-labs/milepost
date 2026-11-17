import { Link, useLocation } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import '../components/state/AsyncStates.css';
import './NotFound.css';

/** Any path the app doesn't serve: the three-squares art, and a way back to the programmes. */
export const NotFound = () => {
  usePageTitle('Not found');
  const location = useLocation();
  const route = `${location.pathname}${location.search}`;

  return (
    <section className="not-found" aria-labelledby="not-found-heading">
      {/* Two empty squares and one tinted, as on every empty state. */}
      <span className="state-empty__art" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <p className="not-found__eyebrow numeric">404</p>
      <h1 id="not-found-heading">There’s no milepost here</h1>
      <p className="not-found__text">
        Nothing lives at <span className="not-found__route numeric">{route}</span>. The link may be out of date, or a
        programme you followed may not be in the public index yet.
      </p>
      <div className="not-found__actions">
        <Link to="/directory" className="ui-button ui-button--primary ui-button--md">
          Go to programmes
        </Link>
        <Link to="/" className="ui-button ui-button--ghost ui-button--md">
          Home
        </Link>
      </div>
    </section>
  );
};

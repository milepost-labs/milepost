import { Link } from 'react-router-dom';
import { ROLE_ENTRIES } from '../../pages/homeContent';
import './LandingSections.css';

/**
 * Landing section 2: the four role entry cards directly below the hero.
 *
 * Most visitors arrive already knowing which side of the transaction they are
 * on, so this is a routing device rather than a description. Each card is a
 * real `Link` to a served route — never a click handler on a div — and each
 * card is one tap target taller than 44px.
 */
export function RoleEntryCards() {
  return (
    <section className="quick-roles" aria-labelledby="quick-roles-heading">
      <h2 id="quick-roles-heading" className="quick-roles__heading">
        What brings you here?
      </h2>
      <div className="quick-roles__grid">
        {ROLE_ENTRIES.map((entry) => (
          <Link key={entry.path} to={entry.path} className="quick-role">
            <span className="quick-role__text">
              <span className="quick-role__want">{entry.want}</span>
              <span className="quick-role__role">{entry.role} dashboard</span>
            </span>
            <span className="quick-role__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
